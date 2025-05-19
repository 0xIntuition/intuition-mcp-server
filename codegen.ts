import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'https://prod.base.intuition-api.com/v1/graphql',
  documents: ['graphql/**/*.ts'],
  generates: {
    './graphql/generated/graphql.ts': {
      plugins: [
        'typescript',
        'typescript-operations',
        'typescript-graphql-request',
      ],
      config: {
        scalars: {
          numeric: 'string',
          timestamptz: 'string',
          uuid: 'string',
          jsonb: 'Record<string, any>',
        },
        dedupeFragments: true,
        skipTypename: true,
        avoidOptionals: false,
        gqlImport: 'graphql-request#gql',
      },
    },
  },
};

export default config;
