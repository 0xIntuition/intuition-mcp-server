// Personalization Predicate Term IDs
// These match the predicate IDs used in the portal for personalization
export const PERSONALIZATION_PREDICATES = {
  PREFERS: '0x2fe31ead9ba4e10029d31afab44fc8300544514bb04fb801da884d10645d9df1',
  INTERESTED_IN: '0x793078598a48ba3ea9c419dc0adea983a0c908d7ff6871d578f3e3864bcb3166',
  IDENTIFIES_AS: '0xfc16841368d2dd2da47ddacf6ac53e1450353cfe198217c2841b58c68b2748e3',
} as const;

// Array for GraphQL queries
export const PERSONALIZATION_PREDICATE_IDS = [
  PERSONALIZATION_PREDICATES.PREFERS,
  PERSONALIZATION_PREDICATES.INTERESTED_IN,
  PERSONALIZATION_PREDICATES.IDENTIFIES_AS,
] as const;

// Categories for claim classification
export type ClaimCategory = 'personalization' | 'factual' | 'opinion' | 'other';

// Personalization-related predicates for categorization
export const PERSONALIZATION_PREDICATE_LABELS = [
  'prefers',
  'likes',
  'loves',
  'enjoys',
  'interested in',
  'uses',
  'recommends',
  'follows',
  'has tag',
] as const;

// Factual claim indicators
export const FACTUAL_PREDICATE_LABELS = [
  'created by',
  'founded by',
  'invented by',
  'developed by',
  'is',
  'was',
  'has',
  'contains',
  'includes',
] as const;