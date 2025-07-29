import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { client } from '../graphql/client.js';
import { getSdk } from '../graphql/generated/graphql.js';

// Define the parameters schema
const parameters = z.object({
  query: z
    .string()
    .min(1)
    .describe('The search query to find lists by object label'),
});

// Define the operation interface
interface SearchListsOperation {
  description: string;
  parameters: typeof parameters;
  execute: (args: z.infer<typeof parameters>) => Promise<CallToolResult>;
}

export const searchListsOperation: SearchListsOperation = {
  description: `Search for lists of entities by name or description.

Do not hesitate to make multiple calls arguments broken down to single word or other variations when the arguments from the user is complex.

### Examples
Examples of cases when to use the tool to assist the user and the arguments to extract:

- user_message: give me a list of blockchains
  tool_args: {"query":"blockchain"}

- user_message: I'm looking for a list of crypto ceos
  tool_args: {"query":"crypto ceos"}

- user_message: do you have information about important policitians
  tool_args: {"query":"politicians"}

- user_message: do you have a collection about web3
  tool_args: {"query":"web3"}

- user_message: what are some popular defi protocols
  tool_args: {"query":"defi protocols"}

### Response format

When replying to the user using the tool call result give at least 10 items if there is at least 10 items in the result. Sort the items by position descending. Always mention the atom ids. Give a good amount of details. Structure your reply but keep a natural and engaging format and follow the other speech directives.
`,
  parameters,
  async execute(args) {
    console.log('\n=== Starting Search Lists Operation ===');
    console.log('Search string:', args.query);

    try {
      // Validate input parameters
      const validatedArgs = parameters.parse(args);

      console.log('\n=== Calling GraphQL Search ===');
      const sdk = getSdk(client);

      const { predicate_objects } = await sdk.SearchLists({
        str: `%${validatedArgs.query}%`,
      });

      console.log('\n=== Raw Search Results ===');
      console.log('Results type:', typeof predicate_objects);
      console.log('Is array:', Array.isArray(predicate_objects));

      // Ensure results is an array
      const validResults = Array.isArray(predicate_objects)
        ? predicate_objects
        : [];

      if (validResults.length === 0) {
        return {
          isError: false,
          content: [
            {
              type: 'text',
              text: 'No lists found matching your search criteria.',
            },
          ],
        };
      }

      // Return in MCP format with essential data for UI
      return {
        isError: false,
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'list-search-result',
              text: JSON.stringify({
                query: validatedArgs.query,
                results: validResults.slice(0, 10).map((list) => ({
                  id: list.id,
                  label: list.object?.label,
                  triple_count: list.triple_count,
                  object_id: list.object?.term_id,
                })),
                total_found: validResults.length,
                showing: Math.min(validResults.length, 10),
              }),
              mimeType: 'application/json',
            },
          },
          {
            type: 'text',
            text: `Search Results for "${validatedArgs.query}":

Found ${validResults.length} lists:
${validResults
  .slice(0, 10)
  .map((list, i) => `${i + 1}. ${list.object?.label || 'Unnamed List'}`)
  .join('\n')}

${
  validResults.length > 10
    ? `\n...and ${validResults.length - 10} more results`
    : ''
}`,
          },
        ],
      };
    } catch (error) {
      console.error('Error in search lists operation:', error);

      // Handle different types of errors
      if (error instanceof z.ZodError) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Validation Error: ${error.errors
                .map((e) => e.message)
                .join(', ')}`,
            },
          ],
        };
      }

      if (error instanceof Error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Operation Error: ${error.message}`,
            },
            {
              type: 'text',
              text: `Details: ${error.stack || 'No stack trace available'}`,
            },
          ],
        };
      }

      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Unknown Error: ${String(error)}`,
          },
        ],
      };
    }
  },
};