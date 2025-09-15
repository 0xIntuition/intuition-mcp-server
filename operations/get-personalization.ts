import { z } from "zod";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { client } from "../graphql/client.js";
import {
  getSdk,
  GetAccountWithPersonalizationQuery,
  GetAccountWithPersonalizationQueryVariables
} from "../graphql/generated/graphql.js";
import { removeEmptyFields, createErrorResponse } from "../lib/response.js";
import {
  PERSONALIZATION_PREDICATES,
  PERSONALIZATION_PREDICATE_IDS,
  PERSONALIZATION_PREDICATE_LABELS,
  FACTUAL_PREDICATE_LABELS,
  ClaimCategory,
} from "../lib/personalization-constants.js";

// Define the parameters schema
const parameters = z.object({
  address: z.string().describe("Ethereum wallet address"),
  includePositions: z.boolean().optional().default(true).describe("Include detailed position data"),
  includeOpposition: z.boolean().optional().default(true).describe("Include opposition and contested claims"),
  limit: z.number().optional().default(100).describe("Maximum number of positions to fetch"),
});

// Type definitions based on new personalization query
type PersonalizationAccount = NonNullable<GetAccountWithPersonalizationQuery['account']>;
type PersonalizationPosition = PersonalizationAccount['personalizationPositions'][0];
type RegularPosition = PersonalizationAccount['positions'][0];
type AccountTriple = NonNullable<RegularPosition['term']['triple']>;
type AccountAtom = NonNullable<RegularPosition['term']['atom']>;

interface ProcessedTripleData {
  triple: AccountTriple;
  shares: string;
  vault: {
    position_count: number;
    total_shares: string;
  };
  positionType: 'support' | 'oppose';
  claimCategory: ClaimCategory;
  oppositionMetrics: {
    supportCount: number;
    opposeCount: number;
    supportShares: string;
    opposeShares: string;
    isContested: boolean;
    oppositionRatio: number;
  };
}

// Helper function to categorize claim types
function categorizeClaimType(triple: AccountTriple): ClaimCategory {
  const predicate = triple?.predicate?.label?.toLowerCase() || '';

  // Check personalization predicates
  if (PERSONALIZATION_PREDICATE_LABELS.some((pref) => predicate.includes(pref))) {
    return 'personalization';
  }

  // Check factual predicates
  if (FACTUAL_PREDICATE_LABELS.some((fact) => predicate.includes(fact))) {
    return 'factual';
  }

  return 'opinion';
}

// Helper function to format shares from BigInt string to decimal
function formatShares(shares: string): string {
  const sharesBigInt = BigInt(shares || '0');
  if (sharesBigInt === 0n) return '0';

  // Convert from wei-like format (18 decimals) to human readable
  const divisor = BigInt(10) ** BigInt(18);
  const whole = sharesBigInt / divisor;
  const remainder = sharesBigInt % divisor;

  // Format with up to 6 decimal places
  const decimal = remainder * BigInt(1000000) / divisor;
  const formattedDecimal = decimal.toString().padStart(6, '0').replace(/0+$/, '');

  if (formattedDecimal) {
    return `${whole}.${formattedDecimal}`;
  }
  return whole.toString();
}

// Process positions with opposition detection
function processPositionsWithOpposition(positions: RegularPosition[]): ProcessedTripleData[] {
  return positions
    .filter((pos): pos is RegularPosition & { term: { triple: AccountTriple } } =>
      pos.term?.triple !== null && pos.term?.triple !== undefined
    )
    .map(pos => {
      const triple = pos.term.triple;
      const vault = pos.term.vaults?.[0];

      if (!vault) return null;

      // Determine position type (support vs oppose)
      const vaultTermId = vault.term_id;
      const counterTermId = triple.counter_term_id;
      const positionType: 'support' | 'oppose' =
        counterTermId && vaultTermId === counterTermId ? 'oppose' : 'support';

      // Calculate opposition metrics
      const supportVault = triple.term?.vaults?.[0];
      const opposeVault = triple.counter_term?.vaults?.[0];

      const supportCount = supportVault?.position_count || 0;
      const opposeCount = opposeVault?.position_count || 0;
      const supportShares = supportVault?.total_shares || '0';
      const opposeShares = opposeVault?.total_shares || '0';

      const totalPositions = supportCount + opposeCount;
      const oppositionRatio = totalPositions > 0 ? opposeCount / totalPositions : 0;
      const isContested = oppositionRatio > 0.25; // >25% opposition

      return {
        triple,
        shares: pos.shares,
        vault: {
          position_count: vault.position_count,
          total_shares: vault.total_shares,
        },
        positionType,
        claimCategory: categorizeClaimType(triple),
        oppositionMetrics: {
          supportCount,
          opposeCount,
          supportShares,
          opposeShares,
          isContested,
          oppositionRatio,
        },
      };
    })
    .filter((item): item is ProcessedTripleData => item !== null);
}

// Main execution function
async function execute(args: z.infer<typeof parameters>): Promise<CallToolResult> {
  try {
    const sdk = getSdk(client);

    // Use the new personalization query with generated types
    const { account } = await sdk.GetAccountWithPersonalization({
      address: args.address,
      positionsLimit: args.limit,
      positionsOffset: 0,
      personalizationPredicateIds: [...PERSONALIZATION_PREDICATE_IDS],
    });


    if (!account) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            status: "no_account",
            message: "No Intuition account found for this address",
            address: args.address,
            suggestions: [
              "User needs to create an account on Intuition",
              "Visit launchpad.intuition.systems to get started"
            ]
          }, null, 2)
        }]
      };
    }

    // Process regular positions
    const positions = account.positions || [];
    const processedPositions = args.includePositions ? processPositionsWithOpposition(positions) : [];

    // Process personalization positions (from the custom query alias)
    const personalizationPositions = account.personalizationPositions || [];

    // Separate by predicate type
    const epoch1Preferences = personalizationPositions.filter(
      (pos) =>
        pos.term?.triple?.predicate?.term_id === PERSONALIZATION_PREDICATES.PREFERS
    );

    const epoch2Interests = personalizationPositions.filter(
      (pos) =>
        pos.term?.triple?.predicate?.term_id === PERSONALIZATION_PREDICATES.INTERESTED_IN
    );

    const epoch3Identities = personalizationPositions.filter(
      (pos) =>
        pos.term?.triple?.predicate?.term_id === PERSONALIZATION_PREDICATES.IDENTIFIES_AS
    );

    // Process atoms
    const atoms = positions
      .filter((pos): pos is RegularPosition & { term: { atom: AccountAtom } } =>
        pos.term?.atom !== null && pos.term?.atom !== undefined
      )
      .map(pos => ({
        label: pos.term.atom.label || '',
        term_id: pos.term.atom.term_id,
        shares: formatShares(pos.shares),
        vault: pos.term.vaults?.[0] ? {
          position_count: pos.term.vaults[0].position_count,
          total_shares: pos.term.vaults[0].total_shares,
        } : null,
      }))
      .filter((atom): atom is typeof atom & { vault: NonNullable<typeof atom.vault> } =>
        atom.vault !== null
      );

    // Find opposing and contested positions
    const opposingPositions = args.includeOpposition ?
      processedPositions.filter(p => p.positionType === 'oppose') : [];

    const contestedClaims = args.includeOpposition ?
      processedPositions.filter(p => p.oppositionMetrics?.isContested) : [];

    // Build personalization context
    const personalizationContext = {
      wallet: args.address,
      status: "active",
      summary: {
        totalPositions: positions.length,
        totalAtoms: atoms.length,
        personalizationCount: personalizationPositions.length,
        opposingPositions: opposingPositions.length,
        contestedClaims: contestedClaims.length,
      },

      // Core personalization data
      preferences: epoch1Preferences.map((pos) => ({
        object: pos.term?.triple?.object?.label,
        objectTermId: pos.term?.triple?.object?.term_id,
        shares: formatShares(pos.shares),
        communityPositions: pos.term?.vaults?.[0]?.position_count || 0,
      })),

      interests: epoch2Interests.map((pos) => ({
        object: pos.term?.triple?.object?.label,
        objectTermId: pos.term?.triple?.object?.term_id,
        shares: formatShares(pos.shares),
        communityPositions: pos.term?.vaults?.[0]?.position_count || 0,
      })),

      identities: epoch3Identities.map((pos) => ({
        object: pos.term?.triple?.object?.label,
        objectTermId: pos.term?.triple?.object?.term_id,
        shares: formatShares(pos.shares),
        communityPositions: pos.term?.vaults?.[0]?.position_count || 0,
      })),

      // Top supported concepts
      topAtoms: atoms.slice(0, 10).map(atom => ({
        label: atom.label,
        termId: atom.term_id,
        shares: atom.shares,
        positionCount: atom.vault?.position_count,
      })),

      // Opposition data
      opposition: args.includeOpposition ? {
        personalizationOpposition: opposingPositions
          .filter(p => p.claimCategory === 'personalization')
          .slice(0, 5)
          .map(p => ({
            statement: `${p.triple.subject.label} ${p.triple.predicate.label} ${p.triple.object.label}`,
            oppositionRatio: p.oppositionMetrics?.oppositionRatio,
          })),

        factualOpposition: opposingPositions
          .filter(p => p.claimCategory === 'factual')
          .slice(0, 5)
          .map(p => ({
            statement: `${p.triple.subject.label} ${p.triple.predicate.label} ${p.triple.object.label}`,
            oppositionRatio: p.oppositionMetrics?.oppositionRatio,
          })),

        contestedClaims: contestedClaims
          .slice(0, 5)
          .map(p => ({
            statement: `${p.triple.subject.label} ${p.triple.predicate.label} ${p.triple.object.label}`,
            oppositionRatio: p.oppositionMetrics?.oppositionRatio,
            supportCount: p.oppositionMetrics?.supportCount,
            opposeCount: p.oppositionMetrics?.opposeCount,
          })),
      } : null,

      // AI guidance hints
      aiGuidance: {
        hasPreferences: epoch1Preferences.length > 0,
        hasInterests: epoch2Interests.length > 0,
        hasIdentity: epoch3Identities.length > 0,
        isControversial: opposingPositions.length > 5,
        engagementLevel: positions.length > 50 ? 'high' : positions.length > 10 ? 'medium' : 'low',
      },
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(removeEmptyFields(personalizationContext), null, 2)
      }]
    };

  } catch (error) {
    console.error("Error in get_personalization:", error);
    return createErrorResponse(error, {
      operation: "get_personalization",
      args,
      phase: "execution"
    });
  }
}

// Export the operation
export const getPersonalizationOperation = {
  name: "get_personalization",
  description: "Get comprehensive personalization context for a wallet address, including preferences, interests, identity, positions, and opposition data. This provides rich context about a user's Intuition activity for personalized AI responses.",
  parameters,
  execute,
};