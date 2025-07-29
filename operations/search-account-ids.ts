import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { client } from '../graphql/client.js';
import { gql } from 'graphql-request';
import { createErrorResponse } from '../lib/response.js';

// Define the parameters schema
const parameters = z.object({
  identifier: z
    .string()
    .min(1)
    .describe(
      'The account identifier to search the id for, typically an ens address. Example: intuitionbilly.eth'
    ),
});

// Define the operation interface
interface SearchAccountIdsOperation {
  description: string;
  parameters: typeof parameters;
  execute: (args: z.infer<typeof parameters>) => Promise<CallToolResult>;
}

const searchAccountIdsQuery = gql`
  query Accounts($where: accounts_bool_exp) {
    accounts(where: $where) {
      id
    }
  }
`;

export const searchAccountIdsOperation: SearchAccountIdsOperation = {
  description: `Search account address for a given identifier.

## Example:

- user: what are intuitionbilly users he follows liking?
  tool_args: {"identifier":"intuitionbilly"}

- user: what is the address of vitalik.eth account?
  tool_args: {"identifier":"vitalik.eth"}
`,
  parameters,
  async execute(args) {
    console.log('\n=== Starting Search Account IDs Operation ===');
    console.log('Identifier:', args.identifier);

    try {
      console.log('\n=== Calling GraphQL Search ===');

      const identifier = args.identifier;

      const result = (await client.request(searchAccountIdsQuery, {
        where: {
          label: {
            _ilike: `%${identifier}%`,
          },
        },
      })) as { accounts: { id: string }[] };

      // Validate results
      if (!result || !result.accounts) {
        throw new Error(
          'Invalid response from GraphQL API - missing accounts field'
        );
      }

      const accounts = Array.isArray(result.accounts) ? result.accounts : [];

      // Return in MCP format with essential data for UI
      const response: CallToolResult = {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'search-account-ids-result',
              text: JSON.stringify({
                query: identifier,
                results: accounts.slice(0, 10).map((account) => ({
                  id: account.id,
                })),
                total_found: accounts.length,
                showing: Math.min(accounts.length, 10),
              }),
              mimeType: 'application/json',
            },
          },
          {
            type: 'text',
            text: `Search Results for "${identifier}":
              
Found ${accounts.length} matching account(s):
${accounts
  .slice(0, 10)
  .map((account, i) => `${i + 1}. ${account.id}`)
  .join('\n')}

${
  accounts.length === 0
    ? 'No accounts found matching this identifier. Try a different search term or check the spelling.'
    : accounts.length > 10
    ? `\n...and ${
        accounts.length - 10
      } more results. Use specific account IDs with other tools for detailed information.`
    : 'Use these account IDs with other tools to get detailed information about each account.'
}`,
          },
        ],
      };

      console.log('\n=== Response Format ===');
      console.log(
        `Response size: ${JSON.stringify(response).length} characters`
      );
      return response;
    } catch (error) {
      return createErrorResponse(error, {
        operation: 'search_account_ids',
        args,
        phase: 'execution',
      });
    }
  },
};