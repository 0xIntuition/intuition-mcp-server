import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { client } from '../graphql/client.js';
import { gql } from 'graphql-request';
import { removeEmptyFields, createErrorResponse } from '../lib/response.js';
import { 
  processPositionWithOpposition, 
  filterZeroSharePositions
} from '../lib/position-utils.js';

// Define the parameters schema
const parameters = z.object({
  account_id: z
    .string()
    .min(1)
    .describe(
      'The account id of the account to find the followers for. Example: 0x3e2178cf851a0e5cbf84c0ff53f820ad7ead703b'
    ),
  predicate: z
    .string()
    .min(1)
    .describe(
      `Optional predicate to filter followers positions on.
Example: recommend, follow, like, dislike`
    )
    .optional(),
});

// Define the operation interface
interface GetFollowersOperation {
  description: string;
  parameters: typeof parameters;
  execute: (args: z.infer<typeof parameters>) => Promise<CallToolResult>;
}

const getFollowersQuery = gql`
  query followers(
    $where: positions_bool_exp
    $orderBy: [positions_order_by!]
    $limit: Int
    $predicateFilter: String
  ) {
    positions(where: $where, order_by: $orderBy, limit: $limit) {
      id
      shares
      account {
        id
        label
        image
      }
      term {
        triple {
          term_id
          counter_term_id
          subject {
            term_id
            label
            value {
              thing {
                url
                description
                name
              }
              account {
                id
                label
              }
              person {
                name
                description
                email
                identifier
              }
              organization {
                name
                email
                description
                url
              }
            }
          }
          predicate {
            term_id
            label
            value {
              thing {
                url
                description
                name
              }
              account {
                id
                label
              }
              person {
                name
                description
                email
                identifier
              }
              organization {
                name
                email
                description
                url
              }
            }
          }
          object {
            term_id
            label
            value {
              thing {
                url
                description
                name
              }
              account {
                id
                label
              }
              person {
                name
                description
                email
                identifier
              }
              organization {
                name
                email
                description
                url
              }
            }
          }
          # Include support vault info
          term {
            vaults(where: { curve_id: { _eq: "1" } }) {
              term_id
              position_count
              total_shares
              current_share_price
            }
          }
          # Include counter vault info for opposition detection
          counter_term {
            vaults(where: { curve_id: { _eq: "1" } }) {
              term_id
              position_count
              total_shares
              current_share_price
            }
          }
        }
        vaults(where: { curve_id: { _eq: "1" } }) {
          term_id
          position_count
          total_shares
          current_share_price
        }
      }
    }
  }
`;

interface GetFollowersQueryResponse {
  positions: Array<{
    id: string;
    shares: string;
    account: {
      id: string;
      label: string;
      image?: string;
    };
    term: {
      triple: {
        term_id: string;
        subject: {
          term_id: string;
          label: string;
          value: any;
        };
        predicate: {
          term_id: string;
          label: string;
          value: any;
        };
        object: {
          term_id: string;
          label: string;
          value: any;
        };
      };
      vaults: Array<{
        term_id: string;
        position_count: number;
        total_shares: string;
        current_share_price: string;
      }>;
    };
  }>;
}

interface FormattedFollowersQueryResponse {
  followers: {
    id: string;
    label: string;
    image?: string;
    shares: string;
    triple: {
      term_id: string;
      subject: any;
      predicate: any;
      object: any;
    };
    vault_info: any;
  }[];
}

function formatResponse(
  result: GetFollowersQueryResponse
): FormattedFollowersQueryResponse {
  const formattedResult: FormattedFollowersQueryResponse = { followers: [] };

  for (const position of result.positions) {
    const follower = {
      id: position.account.id,
      label: position.account.label,
      image: position.account.image,
      shares: position.shares,
      triple: {
        term_id: position.term.triple.term_id,
        subject: position.term.triple.subject,
        predicate: position.term.triple.predicate,
        object: position.term.triple.object,
      },
      vault_info: position.term.vaults[0] || null,
    };
    formattedResult.followers.push(follower);
  }

  return formattedResult;
}

export const getFollowersOperation: GetFollowersOperation = {
  description: `Get followers of a given address and their detailed relationships/interactions.

This tool finds accounts that follow the specified address and then discovers what relationships/predicates those followers have (what they follow, recommend, like, etc.). This provides rich social context about the follower network.

## Example:

- user: what do my followers follow?
  tool_args: {"account_id":"0x3e2178cf851a0e5cbf84c0ff53f820ad7ead703b","predicate":"follow"}

- user: what do my followers recommend?
  tool_args: {"account_id":"0x3e2178cf851a0e5cbf84c0ff53f820ad7ead703b","predicate":"recommend"}

- user: what are intuitionbilly.eth followers interested in?
  tool_args: {"account_id":"0x88d0af73508452c1a453356b3fac26525aec23a2","predicate":"follow"}

The results include both the follower information and their relationship patterns, providing insights into the social graph and shared interests.
`,
  parameters,
  async execute(args) {
    try {
      console.log('\n=== Getting Followers and Their Relationships ===');

      const address = args.account_id;
      const predicateFilter = args.predicate || 'follow';

      // First get followers (people who follow this account)
      const followersResult = (await client.request(getFollowersQuery, {
        where: {
          term: {
            triple: {
              predicate: {
                label: {
                  _ilike: '%follow%',
                },
              },
              object: {
                value: {
                  account: {
                    id: {
                      _eq: address,
                    },
                  },
                },
              },
            },
          },
          shares: {
            _gt: '0',
          },
        },
        orderBy: [
          {
            shares: 'desc',
          },
        ],
        limit: 50,
      })) as GetFollowersQueryResponse;

      // Now for each follower, get what they are interested in (their positions)
      const enrichedFollowers = await Promise.all(
        followersResult.positions.map(async (followerPosition) => {
          const followerId = followerPosition.account.id;

          // Get what this follower is interested in (their positions)
          const followerInterestsResult = (await client.request(
            getFollowersQuery,
            {
              where: {
                account_id: {
                  _eq: followerId,
                },
                term: {
                  triple: {
                    predicate: {
                      label: {
                        _ilike: `%${predicateFilter}%`,
                      },
                    },
                  },
                },
                shares: {
                  _gt: '0',
                },
              },
              orderBy: [
                {
                  shares: 'desc',
                },
              ],
              limit: 20,
            }
          )) as GetFollowersQueryResponse;

          // Filter out zero-share positions and process with opposition detection
          const nonZeroPositions = filterZeroSharePositions(followerInterestsResult.positions);
          
          const interests = nonZeroPositions
            .map((pos) => {
              const processedPosition = processPositionWithOpposition(pos, followerId);
              if (!processedPosition || processedPosition.type !== 'relationship_position') {
                return null;
              }

              return {
                relationship: processedPosition.relationship,
                shares: processedPosition.shares,
                position_type: processedPosition.positionType,
                predicate_label: processedPosition.predicate_label,
                opposition_metrics: processedPosition.oppositionMetrics,
                vault_info: processedPosition.vault_info,
                human_readable: processedPosition.human_readable,
              };
            })
            .filter((interest) => interest !== null);

          return {
            follower: {
              id: followerPosition.account.id,
              label: followerPosition.account.label,
              image: followerPosition.account.image,
              follows_with_shares: followerPosition.shares,
              vault_info: followerPosition.term.vaults?.[0],
            },
            interests: interests.slice(0, 10), // Top 10 interests
            interests_count: interests.length,
            opposition_count: interests.filter(i => i.position_type === 'oppose').length,
            relationship_summary: interests
              .slice(0, 5)
              .map((i) => {
                let summary = i.human_readable;
                if (i.position_type === 'oppose') summary += ' [OPPOSING]';
                if (i.opposition_metrics && i.opposition_metrics.oppositionRatio > 0.25) {
                  summary += ` [${Math.round(i.opposition_metrics.oppositionRatio * 100)}% opposition]`;
                }
                return summary;
              })
              .join('; '),
          };
        })
      );

      const formattedResult = {
        target_account: address,
        followers_count: enrichedFollowers.length,
        followers: enrichedFollowers.sort((a, b) => {
          const sharesA = BigInt(a.follower.follows_with_shares || '0');
          const sharesB = BigInt(b.follower.follows_with_shares || '0');
          return sharesA > sharesB ? -1 : sharesA < sharesB ? 1 : 0;
        }),
        summary: {
          total_followers: enrichedFollowers.length,
          total_relationships_discovered: enrichedFollowers.reduce(
            (sum, f) => sum + f.interests_count,
            0
          ),
          predicate_filter: predicateFilter,
        },
      };

      // Return in MCP format with essential data for UI
      const response: CallToolResult = {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'get-followers-result',
              text: JSON.stringify({
                target_account: address,
                followers: enrichedFollowers.slice(0, 5).map((follower) => ({
                  account_id: follower.follower.id,
                  label: follower.follower.label,
                  shares: follower.follower.follows_with_shares,
                  interests_count: follower.interests_count,
                  opposition_count: follower.opposition_count,
                })),
                total_followers: enrichedFollowers.length,
                total_interests: enrichedFollowers.reduce(
                  (sum, f) => sum + f.interests_count,
                  0
                ),
              }),
              mimeType: 'application/json',
            },
          },
          {
            type: 'text',
            text: `Followers Analysis for ${address}:
            
**FOLLOWERS** (${enrichedFollowers.length} accounts, top 5 shown):
${enrichedFollowers
  .slice(0, 5)
  .map(
    (follower, i) =>
      `${i + 1}. **${follower.follower.label}** (${
        follower.follower.follows_with_shares
      } shares)
   📊 ${follower.interests_count} ${predicateFilter} interests${
        follower.opposition_count > 0 ? ` (${follower.opposition_count} opposing)` : ''
      }
   🔗 ${follower.relationship_summary.slice(0, 100)}${
        follower.relationship_summary.length > 100 ? '...' : ''
      }`
  )
  .join('\n\n')}

📈 **Summary**: ${
              enrichedFollowers.length
            } followers with ${enrichedFollowers.reduce(
              (sum, f) => sum + f.interests_count,
              0
            )} total relationship patterns discovered.`,
          },
        ],
      };

      console.log('\n=== Followers Response ===');
      console.log(
        `Response size: ${JSON.stringify(response).length} characters`
      );
      return response;
    } catch (error) {
      return createErrorResponse(error, {
        operation: 'get_followers',
        args,
        phase: 'execution',
      });
    }
  },
};