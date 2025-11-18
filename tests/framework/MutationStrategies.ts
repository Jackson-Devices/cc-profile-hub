/**
 * Mutation Strategies for Fuzzing
 * Each strategy takes (vector, rng) and returns mutated vector
 */

import { SeededRandom } from './SeededRandom';

export type MutationStrategy = (vector: any, rng: SeededRandom) => any;

/**
 * Case variation mutations
 */
export const caseVariation: MutationStrategy = (vector, rng) => {
  if (typeof vector !== 'string') return vector;

  const variations = [
    vector.toLowerCase(),
    vector.toUpperCase(),
    vector.charAt(0).toUpperCase() + vector.slice(1),
    vector.split('').map((c, i) =>
      i % 2 ? c.toUpperCase() : c.toLowerCase()
    ).join(''),
    // Random case for each char
    vector.split('').map(c =>
      rng.bool() ? c.toUpperCase() : c.toLowerCase()
    ).join(''),
  ];

  return rng.choice(variations);
};

/**
 * URL/Base64 encoding mutations
 */
export const encoding: MutationStrategy = (vector, rng) => {
  if (typeof vector !== 'string') return vector;

  const encodings = [
    Buffer.from(vector).toString('base64'),
    encodeURIComponent(vector),
    vector.split('').map(c => `\\x${c.charCodeAt(0).toString(16)}`).join(''),
    vector.split('').map(c => `&#${c.charCodeAt(0)};`).join(''),
    vector.split('').map(c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
  ];

  return rng.choice(encodings);
};

/**
 * Null byte injection
 */
export const nullBytes: MutationStrategy = (vector, rng) => {
  if (typeof vector !== 'string') return vector;

  const positions = [
    `${vector}\x00`,
    `\x00${vector}`,
    vector.split('').join('\x00'),
    vector.slice(0, Math.floor(vector.length / 2)) + '\x00' + vector.slice(Math.floor(vector.length / 2)),
  ];

  return rng.choice(positions);
};

/**
 * Length attack - random repeat count
 */
export const lengthAttack: MutationStrategy = (vector, rng) => {
  if (typeof vector !== 'string') return vector;

  const count = rng.nextInt(1, 10000);
  return vector.repeat(count);
};

/**
 * Recursion depth - random nesting
 */
export const recursion: MutationStrategy = (vector, rng) => {
  if (typeof vector !== 'string') return vector;

  const depth = rng.nextInt(1, 100);
  return '('.repeat(depth) + vector + ')'.repeat(depth);
};

/**
 * Special character injection
 */
export const specialChars: MutationStrategy = (vector, rng) => {
  if (typeof vector !== 'string') return vector;

  const chars = ['<', '>', '&', '"', "'", '\\', '/', '\n', '\r', '\t', '\0'];
  const char = rng.choice(chars);
  const count = rng.nextInt(10, 1000);

  const positions = [
    char.repeat(count) + vector,
    vector + char.repeat(count),
    vector.slice(0, Math.floor(vector.length / 2)) + char.repeat(count) + vector.slice(Math.floor(vector.length / 2)),
  ];

  return rng.choice(positions);
};

/**
 * Unicode mutation
 */
export const unicodeAttack: MutationStrategy = (vector, rng) => {
  if (typeof vector !== 'string') return vector;

  const unicodeChars = [
    '\u202e', // RTL override
    '\u200b', // Zero-width space
    '\ufeff', // BOM
    '\ufffe', // Non-character
    '\ud83d\udc80', // Skull emoji
    'а',      // Cyrillic a
    'і',      // Cyrillic i
  ];

  const char = rng.choice(unicodeChars);
  const pos = rng.nextInt(0, vector.length);

  return vector.slice(0, pos) + char + vector.slice(pos);
};

/**
 * Path traversal mutations
 */
export const pathTraversal: MutationStrategy = (vector, rng) => {
  if (typeof vector !== 'string') return vector;

  const traversals = [
    '../',
    '..\\',
    '.../',
    './../',
    '%2e%2e/',
    '%2e%2e%2f',
    '..%2f',
    '..;/',
    'file:///../',
  ];

  const traversal = rng.choice(traversals);
  const count = rng.nextInt(1, 10);

  return traversal.repeat(count) + vector;
};

/**
 * SQL injection patterns
 */
export const sqlInjection: MutationStrategy = (vector, rng) => {
  const sqli = [
    "' OR '1'='1",
    "'; DROP TABLE users--",
    "' AND SLEEP(5)--",
    "1' UNION SELECT null--",
    "admin'--",
  ];

  return rng.choice(sqli);
};

/**
 * XSS patterns
 */
export const xssInjection: MutationStrategy = (vector, rng) => {
  const xss = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    'javascript:alert(1)',
    '<svg onload=alert(1)>',
    '"><script>alert(1)</script>',
  ];

  return rng.choice(xss);
};

/**
 * Command injection
 */
export const commandInjection: MutationStrategy = (vector, rng) => {
  const cmds = [
    '; rm -rf /',
    '| cat /etc/passwd',
    '$(cat /etc/passwd)',
    '`cat /etc/passwd`',
    '& net user admin /add',
  ];

  return rng.choice(cmds);
};

/**
 * Format string attacks
 */
export const formatString: MutationStrategy = (vector, rng) => {
  const formats = [
    '%s%s%s%s%s',
    '%x%x%x%x',
    '%n%n%n%n',
    '%p%p%p%p',
    '${evil}',
    '{evil}',
  ];

  if (typeof vector === 'string') {
    const fmt = rng.choice(formats);
    const pos = rng.nextInt(0, vector.length);
    return vector.slice(0, pos) + fmt + vector.slice(pos);
  }

  return rng.choice(formats);
};

/**
 * Prototype pollution
 */
export const prototypePollution: MutationStrategy = (vector, rng) => {
  if (typeof vector === 'object' && vector !== null) {
    const pollution = {
      ...vector,
      '__proto__': { isAdmin: true },
    };
    return pollution;
  }

  return vector;
};

/**
 * Boundary value mutations
 */
export const boundaryValue: MutationStrategy = (vector, rng) => {
  if (typeof vector === 'number') {
    const boundaries = [
      -1,
      0,
      1,
      255,
      256,
      65535,
      65536,
      2147483647,
      -2147483648,
      Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER,
    ];
    return rng.choice(boundaries);
  }

  if (typeof vector === 'string') {
    const lengths = [0, 1, 7, 8, 9, 255, 256, 1023, 1024, 1025, 10000];
    const len = rng.choice(lengths);
    return 'a'.repeat(len);
  }

  return vector;
};

/**
 * Multi-mutation: combine multiple mutations
 */
export const multiMutation: MutationStrategy = (vector, rng) => {
  // Don't include multiMutation itself to avoid infinite recursion
  const strategies = [
    caseVariation,
    encoding,
    nullBytes,
    specialChars,
    unicodeAttack,
    pathTraversal,
    formatString,
  ];

  const count = rng.nextInt(2, 4);
  const selected = rng.sample(strategies, count);

  let result = vector;
  for (const strategy of selected) {
    result = strategy(result, rng);
  }

  return result;
};

/**
 * All available mutation strategies
 */
export const MUTATION_STRATEGIES: Record<string, MutationStrategy> = {
  caseVariation,
  encoding,
  nullBytes,
  lengthAttack,
  recursion,
  specialChars,
  unicodeAttack,
  pathTraversal,
  sqlInjection,
  xssInjection,
  commandInjection,
  formatString,
  prototypePollution,
  boundaryValue,
  multiMutation,
};

/**
 * Get random mutation strategy
 */
export function getRandomStrategy(rng: SeededRandom): MutationStrategy {
  const strategies = Object.values(MUTATION_STRATEGIES);
  return rng.choice(strategies);
}

/**
 * Get strategy by name
 */
export function getStrategy(name: string): MutationStrategy {
  const strategy = MUTATION_STRATEGIES[name];
  if (!strategy) {
    throw new Error(`Unknown mutation strategy: ${name}`);
  }
  return strategy;
}
