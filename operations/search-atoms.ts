import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { client } from '../graphql/client.js';
import { SearchAtomsQuery } from '../graphql/generated/graphql.js';
import { gql } from 'graphql-request';
import { removeEmptyFields, createErrorResponse } from '../lib/response.js';

// Define the parameters schema
const parameters = z.object({
  queries: z.array(z.string().min(1)).min(1),
});

// Define the operation interface
interface AtomSearchOperation {
  description: string;
  parameters: typeof parameters;
  execute: (args: z.infer<typeof parameters>) => Promise<CallToolResult>;
}

export const SEARCH_ATOMS = function (params: string[]) {
  return `
  query SearchAtoms(${params
    .map((param, index) => {
      return `$like${index}Str: String!`;
    })
    .join(', ')}) {
    atoms(
      where: {
        _or: [
        ${params
          .map((param, index) => {
            return `{ data: { _ilike: $like${index}Str } }
          { value: { text_object: { data: { _ilike: $like${index}Str } } } }
          { value: { account: { label: {  _ilike: $like${index}Str }}}}
          { value: { thing: { url: {  _ilike: $like${index}Str }}}}
          { value: { thing: { name: {  _ilike: $like${index}Str }}}}
          { value: { thing: { description: {  _ilike: $like${index}Str }}}}
          { value: { person: { url: { _ilike: $like${index}Str } } } }
          { value: { person: { name: { _ilike: $like${index}Str } } } }
          { value: { person: { description: { _ilike: $like${index}Str } } } }
          { value: { organization: { url: { _ilike: $like${index}Str } } } }
          { value: { organization: { name: { _ilike: $like${index}Str } } } }
          { value: { organization: { description: { _ilike: $like${index}Str } } } }`;
          })
          .join('\n')}
        ]
      }
      order_by: { term: { total_market_cap: desc } }
    ) {
      term_id
      image
      type
      label
      data
      created_at
      creator {
        id
        label
        image
        cached_image {
          safe
          url
        }
      }
      value {
        account {
          id
          label
        }
        person {
          name
          description
          email
          url
          identifier
        }
        thing {
          url
          name
          description
        }
        organization {
          name
          email
          description
          url
        }
      }
      term {
        total_assets
        total_market_cap
        vaults(where: { curve_id: { _eq: "1" } }) {
          curve_id
          term_id
          position_count
          current_share_price
          total_shares
          total_assets
          market_cap
        }
      }
      as_subject_triples {
        term_id
        object {
          term_id
          label
          image
          type
        }
        predicate {
          term_id
          label
          image
          type
        }
        counter_term {
          total_market_cap
          total_assets
          vaults(where: { curve_id: { _eq: "1" } }) {
            curve_id
            term_id
            position_count
            current_share_price
            total_shares
            total_assets
            market_cap
          }
        }
        term {
          total_market_cap
          total_assets
          vaults(where: { curve_id: { _eq: "1" } }) {
            curve_id
            term_id
            position_count
            current_share_price
            total_shares
            total_assets
            market_cap
          }
        }
      }
    }
  }
  `;
};

export const atomSearchOperation: AtomSearchOperation = {
  description: `Search for atoms based on one or more queries. Returns atoms with their data, relationships, and positions.

### Examples
Examples of cases when to use the tool to assist the user and the arguments to extract:

- user_message: "search ethereum"
  tool_args: {"queries":["ethereum"]}

- user_message: "search intuition protocol"
  tool_args: {"queries":["intuition", "protocol"]}

- user_message: "search for AI and machine learning"
  tool_args: {"queries":["AI", "machine learning"]}

### Response format

When replying to the user using the tool call result, favor the most popular atoms(with the largest positions) and sort them by position descending.
Always mention the atom ids. Give at least 10 connections and a good amount of details. Structure your reply but keep a natural and engaging format and follow the other speech directives.
`,
  parameters,
  async execute(args) {
    console.log('\n=== Starting Atom Search Operation ===');
    console.log('Queries:', args.queries);

    // Create variables object dynamically based on number of queries
    const variables: Record<string, string> = {};
    args.queries.forEach((query, index) => {
      const likeStr = `%${query}%`;
      variables[`like${index}Str`] = likeStr;
    });

    const query = gql`
      ${SEARCH_ATOMS(args.queries)}
    `;

    try {
      console.log('\n=== Calling GraphQL Query ===');
      const data = await client.request<{ atoms: any[] }>(query, variables);

      console.log('\n=== GraphQL Response ===');
      console.log(`Found ${data.atoms?.length || 0} atoms`);

      const cleanedData = removeEmptyFields(data);
      const atoms = cleanedData?.atoms || [];

      // Process results to add human-readable info and relationships
      const processedAtoms = atoms.map((atom: any) => {
        // Count relationships where this atom is the subject
        const relationshipCount = atom.as_subject_triples?.length || 0;
        
        // Get vault metrics for sorting
        const vault = atom.term?.vaults?.[0];
        const marketCap = vault?.market_cap || '0';
        const positionCount = vault?.position_count || 0;
        
        // Create human-readable relationships
        const topRelationships = (atom.as_subject_triples || [])
          .slice(0, 5)
          .map((triple: any) => ({
            relationship: `${atom.label} ${triple.predicate?.label || 'relates to'} ${triple.object?.label || 'Unknown'}`,
            object_id: triple.object?.term_id,
            predicate_id: triple.predicate?.term_id,
          }));

        return {
          ...atom,
          human_readable: {
            label: atom.label || atom.data || 'Unknown',
            type: atom.type,
            creator: atom.creator?.label || atom.creator?.id,
            description: atom.value?.thing?.description || 
                        atom.value?.person?.description || 
                        atom.value?.organization?.description || 
                        atom.data,
            relationship_count: relationshipCount,
            market_cap: marketCap,
            position_count: positionCount,
            top_relationships: topRelationships,
          },
        };
      });

      // Sort by market cap (descending)
      processedAtoms.sort((a: any, b: any) => {
        const aMarketCap = BigInt(a.human_readable.market_cap || '0');
        const bMarketCap = BigInt(b.human_readable.market_cap || '0');
        return aMarketCap > bMarketCap ? -1 : aMarketCap < bMarketCap ? 1 : 0;
      });

      // Format response for LLM
      const formattedResults = processedAtoms.slice(0, 20).map((atom: any, index: number) => {
        const relationships = atom.human_readable.top_relationships
          .map((rel: any) => `  - ${rel.relationship}`)
          .join('\n');
        
        return `${index + 1}. **${atom.human_readable.label}** (ID: ${atom.term_id})
   Type: ${atom.human_readable.type}
   Positions: ${atom.human_readable.position_count}
   Market Cap: ${atom.human_readable.market_cap}
   Relationships: ${atom.human_readable.relationship_count}
${relationships ? `   Top connections:\n${relationships}` : ''}`;
      }).join('\n\n');

      return {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'atom-search-results',
              text: JSON.stringify({
                query: args.queries,
                total_results: atoms.length,
                atoms: processedAtoms.slice(0, 20),
              }),
              mimeType: 'application/json',
            },
          },
          {
            type: 'text',
            text: `Found ${atoms.length} atoms matching "${args.queries.join('", "')}":

${formattedResults}

${atoms.length > 20 ? `\n(Showing top 20 of ${atoms.length} results, sorted by market cap)` : ''}`,
          },
        ],
      };
    } catch (error) {
      return createErrorResponse(error, {
        operation: 'search_atoms',
        args,
        phase: 'execution',
      });
    }
  },
};