import { z } from "zod";
import { PromptMessage, TextContent } from "@modelcontextprotocol/sdk/types.js";
import { getPersonalizationOperation } from "../operations/get-personalization.js";

// Define the prompt parameters schema
const personalizationPromptParameters = z.object({
  address: z.string().describe("Ethereum wallet address for personalization"),
  includeOpposition: z.boolean().optional().default(false).describe("Include opposition data for controversy awareness"),
  context: z.enum(["chat", "analysis", "brief"]).optional().default("chat").describe("Context for how the personalization will be used"),
});

// Helper function to format personalization data for different contexts
function formatPersonalizationForContext(data: any, context: string): string {
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;

  if (parsed.status === "no_account") {
    return `This user does not have an Intuition account yet. They may be new to the platform. Suggest exploring the Intuition protocol at launchpad.intuition.systems to get started.`;
  }

  const { summary, preferences, interests, identities, aiGuidance, opposition } = parsed;

  if (context === "brief") {
    // Minimal context for token efficiency
    const briefData = [];
    if (preferences?.length > 0) briefData.push(`Prefers: ${preferences.slice(0, 3).map((p: any) => p.object).join(", ")}`);
    if (interests?.length > 0) briefData.push(`Interested in: ${interests.slice(0, 3).map((i: any) => i.object).join(", ")}`);
    if (identities?.length > 0) briefData.push(`Identifies as: ${identities.slice(0, 2).map((i: any) => i.object).join(", ")}`);

    return briefData.length > 0 ?
      `User context: ${briefData.join(" | ")} (${aiGuidance.engagementLevel} engagement)` :
      "User has minimal Intuition activity.";
  }

  if (context === "analysis") {
    // Structured data for analysis tasks
    return `# User Profile Analysis

## Engagement Level: ${aiGuidance.engagementLevel}
- Total positions: ${summary.totalPositions}
- Personalization signals: ${summary.personalizationCount}

## Core Preferences (${preferences?.length || 0})
${preferences?.slice(0, 5).map((p: any) => `- ${p.object} (${p.shares} shares, ${p.communityPositions} community positions)`).join('\n') || 'None recorded'}

## Interests (${interests?.length || 0})
${interests?.slice(0, 5).map((i: any) => `- ${i.object} (${i.shares} shares)`).join('\n') || 'None recorded'}

## Identity Markers (${identities?.length || 0})
${identities?.slice(0, 3).map((i: any) => `- ${i.object}`).join('\n') || 'None recorded'}

${opposition?.contestedClaims?.length > 0 ? `## Controversial Positions
${opposition.contestedClaims.slice(0, 3).map((c: any) => `- ${c.statement} (${Math.round(c.oppositionRatio * 100)}% opposition)`).join('\n')}` : ''}`;
  }

  // Default: chat context with semantic guidance
  return `# User Personalization Context

You are responding to a user with the following Intuition protocol activity:

## Profile Summary
- **Engagement Level**: ${aiGuidance.engagementLevel} (${summary.totalPositions} total positions)
- **Personalization Signals**: ${summary.personalizationCount} explicit preferences/interests/identity markers
- **Account**: ${parsed.wallet}

## Core Preferences ${preferences?.length > 0 ? `(${preferences.length})` : '(None)'}
${preferences?.length > 0 ?
  preferences.slice(0, 8).map((p: any) =>
    `- **${p.object}** (${p.shares} shares, ${p.communityPositions} community supporters)`
  ).join('\n') :
  'No explicit preferences recorded on Intuition.'
}

## Interests ${interests?.length > 0 ? `(${interests.length})` : '(None)'}
${interests?.length > 0 ?
  interests.slice(0, 8).map((i: any) =>
    `- **${i.object}** (${i.shares} shares, ${i.communityPositions} community participants)`
  ).join('\n') :
  'No explicit interests recorded on Intuition.'
}

## Identity & Roles ${identities?.length > 0 ? `(${identities.length})` : '(None)'}
${identities?.length > 0 ?
  identities.slice(0, 5).map((i: any) =>
    `- **${i.object}** (${i.shares} shares)`
  ).join('\n') :
  'No identity markers recorded on Intuition.'
}

${opposition?.contestedClaims?.length > 0 ? `## ⚠️ Controversial Areas
This user has positions that face significant opposition:
${opposition.contestedClaims.slice(0, 3).map((c: any) =>
  `- ${c.statement} (${Math.round(c.oppositionRatio * 100)}% community opposition)`
).join('\n')}

Be mindful of these potentially sensitive topics.` : ''}

## AI Guidance for Responses

### Personalization Approach:
${aiGuidance.hasPreferences ? '✅ **Reference their preferences** when suggesting tools, resources, or examples' : '❌ No preferences to reference'}
${aiGuidance.hasInterests ? '✅ **Connect to their interests** when explaining concepts or providing context' : '❌ No interests to connect with'}
${aiGuidance.hasIdentity ? '✅ **Acknowledge their identity/roles** when relevant to the conversation' : '❌ No identity markers to acknowledge'}

### Response Strategy:
- **Engagement Level**: ${aiGuidance.engagementLevel === 'high' ? 'They are highly active - can reference specific Intuition concepts and deeper protocol mechanics' : aiGuidance.engagementLevel === 'medium' ? 'Moderate activity - explain Intuition concepts when referenced' : 'New/low activity - introduce Intuition concepts gently if relevant'}
${aiGuidance.isControversial ? '- **Controversial Profile**: Be diplomatic about contested topics, acknowledge different perspectives exist' : '- **Non-controversial Profile**: Straightforward approach is fine'}

### Link Generation:
When referencing any concept, person, or entity mentioned in their profile, you can link to it using:
\`[Entity Name](/explore?q=Entity+Name)\`

---

**Important**: This personalization context should inform your response style and examples, but don't explicitly mention "I see from your Intuition profile..." unless the user directly asks about their profile. Integrate this context naturally.`;
}

// Main prompt execution function
async function executePersonalizationPrompt(args: z.infer<typeof personalizationPromptParameters>): Promise<PromptMessage[]> {
  try {
    // Get personalization data using our existing operation
    const personalizationResult = await getPersonalizationOperation.execute({
      address: args.address,
      includeOpposition: args.includeOpposition || false,
      includePositions: true,
      limit: 100,
    });

    // Extract the data from the result
    const personalizationData = personalizationResult.content?.[0]?.text;

    if (!personalizationData) {
      return [
        {
          role: "user",
          content: {
            type: "text",
            text: "No personalization data available for this address."
          } as TextContent
        }
      ];
    }

    // Format the data according to the requested context
    const formattedContext = formatPersonalizationForContext(personalizationData, args.context || "chat");

    return [
      {
        role: "user",
        content: {
          type: "text",
          text: formattedContext
        } as TextContent
      }
    ];

  } catch (error) {
    console.error("Error in personalization prompt:", error);
    return [
      {
        role: "user",
        content: {
          type: "text",
          text: `Error loading personalization context: ${error instanceof Error ? error.message : String(error)}`
        } as TextContent
      }
    ];
  }
}

// Export the prompt configuration
export const personalizationPrompt = {
  name: "personalization_context",
  description: "Generates personalized context based on a user's Intuition protocol activity including preferences, interests, identity markers, and community engagement patterns. This context helps AI responses be more relevant and personalized.",
  parameters: personalizationPromptParameters,
  execute: executePersonalizationPrompt,
};