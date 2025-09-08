import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { client } from '../graphql/client.js';
import { SearchAtomsQuery } from '../graphql/generated/graphql.js';
import { gql } from 'graphql-request';
import { removeEmptyFields, createErrorResponse } from '../lib/response.js';
import { formatShares } from '../lib/position-utils.js';

/**
 * Format all shares-related fields in atom search results
 * Recursively processes the nested data structure to format total_shares
 */
function formatAtomShares(atom: any): any {
  if (!atom) return atom;

  // Create a deep copy to avoid mutating the original
  const formatted = JSON.parse(JSON.stringify(atom));

  // Format all BigInt values in term
  if (formatted.term) {
    if (formatted.term.total_market_cap) {
      formatted.term.total_market_cap = formatShares(formatted.term.total_market_cap);
    }
    // Remove confusing total_assets
    delete formatted.term.total_assets;
  }

  // Format shares and other BigInt values in term.vaults
  if (formatted.term?.vaults) {
    formatted.term.vaults = formatted.term.vaults.map((vault: any) => ({
      curve_id: vault.curve_id,
      term_id: vault.term_id,
      market_cap: vault.market_cap ? formatShares(vault.market_cap) : vault.market_cap,
      // Remove confusing technical metrics
      // total_shares, position_count, current_share_price, total_assets excluded
    }));
  }

  // Format shares in as_subject_triples
  if (formatted.as_subject_triples) {
    formatted.as_subject_triples = formatted.as_subject_triples.map((triple: any) => ({
      ...triple,
      term: triple.term?.vaults ? {
        ...triple.term,
        total_market_cap: triple.term.total_market_cap ? formatShares(triple.term.total_market_cap) : triple.term.total_market_cap,
        vaults: triple.term.vaults.map((vault: any) => ({
          curve_id: vault.curve_id,
          term_id: vault.term_id,
          market_cap: vault.market_cap ? formatShares(vault.market_cap) : vault.market_cap,
          // Remove confusing technical metrics
          // total_shares excluded
        })),
      } : triple.term,
      counter_term: triple.counter_term?.vaults ? {
        ...triple.counter_term,
        total_market_cap: triple.counter_term.total_market_cap ? formatShares(triple.counter_term.total_market_cap) : triple.counter_term.total_market_cap,
        vaults: triple.counter_term.vaults.map((vault: any) => ({
          curve_id: vault.curve_id,
          term_id: vault.term_id,
          market_cap: vault.market_cap ? formatShares(vault.market_cap) : vault.market_cap,
          // Remove confusing technical metrics
          // total_shares excluded
        })),
      } : triple.counter_term,
    }));
  }

  return formatted;
}

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
  description: `Search for accounts, things, people, and concepts by name, description, URL or ens domain (e.g. john.eth).

This tool is particularly powerful for discovering detailed relationships and semantic connections. When you search for an account or entity, it returns not just basic info but also rich "as_subject_triples" data showing all the relationships where this entity is the subject (e.g., "Account follows Person", "Account has tag Concept", "Account loves Protocol").

The search results include:
- Basic entity information (name, type, description)
- Financial data (market cap, shares, positions)
- **Rich relationship data**: All the semantic triples showing how this entity relates to others
- Human-readable relationship descriptions for easy interpretation

**Perfect for**: Getting comprehensive relationship profiles for accounts, discovering social connections, finding tagged entities, and understanding semantic relationships in the knowledge graph.

Use the user input with synonyms or break it down into single words for arguments.

### Examples
Examples of cases when to use the tool to assist the user and the arguments to extract:

- user_message: search atoms for ethereum
  tool_args: {"queries":["ethereum","eth"]}

- user_message: search for data about intuition
  tool_args: {"queries":["intuition"]}

- user_message: what information you have about centralized exchanges
  tool_args: {"queries":["centralized exchanges","cex"]}

- user_message: what's in intuition about ethereum
  tool_args: {"queries":["ethereum","eth"]}

- user_message: find atoms for vitalik buterin
  tool_args: {"queries":["vitalik buterin","vitalik.eth","vitalik"]}

- user_message: tell me what you know about blockchains
  tool_args: {"queries":["blockchain"]}

- user_message: what connection does he have to vitalik
  tool_args: {"queries":["vitalik","vitalik.eth","vitalik buterin"]}

- user_message: do you know something about billy.eth
  tool_args: {"queries":["billy.eth","bill","william"]}

- user_message: show me detailed info about jonathanprozzi.eth
  tool_args: {"queries":["jonathanprozzi.eth","jonathanprozzi","jonathan"]}

### Response format

When replying to the user using the tool call result:
- Favor the most popular atoms (with the largest positions) and sort them by position descending
- Always mention the atom IDs and relationship counts
- Give at least 10 connections and detailed relationship insights
- Structure your reply naturally and engagingly
- Highlight social connections, preferences, and semantic relationships
- Focus on the rich relationship data in as_subject_triples
- Present human-readable relationship descriptions based on the predicate and object data
`,
  parameters,
  async execute(args) {
    console.log('\n=== Starting Atom Search Operation ===');
    console.log('Search string:', args.queries);

    // Expand search queries to include both ENS names and wallet addresses
    let expandedQueries = [...args.queries];
    for (const query of args.queries) {
      // If it looks like a wallet address, also try to find associated ENS names via account lookup
      if (query.match(/^0x[a-fA-F0-9]{40}$/)) {
        try {
          console.log(`\n=== Resolving ENS for address ${query} ===`);
          // Try to find an account with this address that might have an ENS label
          const accountQuery = gql`
            query FindAccountByAddress($address: String!) {
              account(id: $address) {
                label
              }
            }
          `;
          const accountResult = await client.request(accountQuery, { address: query.toLowerCase() }) as { account: { label?: string } | null };
          if (accountResult.account?.label && accountResult.account.label !== query) {
            expandedQueries.push(accountResult.account.label);
            console.log(`Found ENS name for address ${query}: ${accountResult.account.label}`);
          }
        } catch (error) {
          console.log(`Could not resolve ENS for address ${query}:`, error);
        }
      }
    }

    console.log('Expanded search queries:', expandedQueries);

    try {
      console.log('\n=== Calling GraphQL Search ===');

      const queryArgs = expandedQueries.slice(0, 5);
      const query = SEARCH_ATOMS(queryArgs);
      console.log(query);

      const vars: { [type: string]: string } = {};
      for (let i = 0; i < expandedQueries.length; i++) {
        vars[`like${i}Str`] = `%${expandedQueries[i]}`;
      }
      const { atoms } = (await client.request(query, vars)) as SearchAtomsQuery;
      // const sdk = getSdk(client);

      // const { atoms } = await sdk.SearchAtoms({
      //   likeStr: `%${args.queries}%`,
      // });

      console.log('\n=== Raw Search Results ===');
      console.log('Results type:', typeof atoms);
      console.log('Is array:', Array.isArray(atoms));
      console.log('Number of results:', atoms?.length || 0);

      if (atoms?.length > 0) {
        console.log('\n=== Result Details ===');
        atoms.forEach((atom, i) => {
          console.log(`\nAtom ${i + 1}:`);
          console.log('- Label:', atom.label);
          console.log('- ID:', atom.term_id);
          if (atom.value?.account) {
            console.log('- Account:', atom.value.account.label);
          }
          if (atom.term?.vaults?.[0]) {
            console.log(
              '- Position count:',
              atom.term.vaults[0].position_count
            );
          }
        });
      }

      // Ensure results is an array and format for display
      const validResults = (atoms || [])
        .slice(0, 10) // Limit to top 10 results for token management
        .map((atom) => {
          // Limit relationships to prevent token overflow
          const limitedTriples = (atom.as_subject_triples || []).slice(0, 10);

          const atomWithLimitedTriples = {
            term_id: atom.term_id,
            label: atom.label,
            image: atom.image,
            type: atom.type,
            creator: atom.creator,
            value: atom.value,
            term: atom.term,
            as_subject_triples: limitedTriples,
          };

          // Format all shares values before returning
          return formatAtomShares(atomWithLimitedTriples);
        });

      // Return in MCP format - raw JSON like the old version
      const response: CallToolResult = {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'atom-search-result',
              text: JSON.stringify(removeEmptyFields(validResults)),
              mimeType: 'application/json',
            },
          },
        ],
      };

      console.log('\n=== Response Format ===');
      console.log(
        `Response size: ${JSON.stringify(response).length} characters`
      );
      console.log(
        `Returning ${validResults.length} atoms with limited relationships`
      );
      return response;
    } catch (error) {
      return createErrorResponse(error, {
        operation: 'search_atoms',
        args,
        phase: 'execution',
      });
    }
  },
};
