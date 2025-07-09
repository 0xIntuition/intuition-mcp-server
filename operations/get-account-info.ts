import { z } from "zod";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { client } from "../graphql/client.js";
import { getSdk } from "../graphql/generated/graphql.js";

// Define the parameters schema
const parameters = z
  .object({
    address: z.string().optional(),
    // identifier: z.string().optional(),
  })
  .refine((data) => data.address  , {
    message: "Address must be provided",
  });

// Define the operation interface
interface GetAccountInfoOperation {
  description: string;
  parameters: typeof parameters;
  execute: (args: z.infer<typeof parameters>) => Promise<CallToolResult>;
}

export const getAccountInfoOperation: GetAccountInfoOperation = {
  description: `Get detailed information about an account by address or identifier.

If you don't find information about the account you can search atoms instead if the identifier is not a hex address.

### Examples
Examples of cases when to use the tool to assist the user and the arguments to extract:

- user_message: "get the account info for 0x1234567890123456789012345678901234567890"
  tool_args: {"address":"0x1234567890123456789012345678901234567890"}

- user_message: "can you show me some info for 0xabcdef0123456789abcdef0123456789abcdef01"
  tool_args: {"address":"0xabcdef0123456789abcdef0123456789abcdef01"}

- user_message: "what do you know about 0x1234567890123456789012345678901234567890"
  tool_args: {"address":"0x1234567890123456789012345678901234567890"}

- user_message: "what's the intuition of 0x1234567890123456789012345678901234567890"
  tool_args: {"address":"0x1234567890123456789012345678901234567890"}


### Response format

When replying to the user using the tool call result, favor the most popular atoms(with the largest positions) and sort them by position descending.
Always mention the atom ids. Give at least 10 connections and a good amount of details. Structure your reply but keep a natural and engaging format and follow the other speech directives.
`,
  parameters,
  async execute(args) {
    console.log("\n=== Starting Get Account Info Operation ===");
    const address = args.address;
    console.log("Address:", address);

    try {
      console.log("\n=== Calling GraphQL Query ===");
      const sdk = getSdk(client);
      const { account } = await sdk.GetAccountInfo({
        address: address!,
      });

      if (!account) {
        return {
          content: [
            {
              type: "text",
              text: `Je n’ai trouvé aucun compte associé à l’adresse ${address}.`,
            },
          ],
        };
      }

      // Return in MCP format
      return {
        content: [
          {
            type: "resource",
            resource: {
              uri: "account-info",
              text: JSON.stringify({ account }),
              mimeType: "application/json",
            },
          },
        ],
      };
    } catch (error) {
      console.error("Error in get account info operation:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  },
};
