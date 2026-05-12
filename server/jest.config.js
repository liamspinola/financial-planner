/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>', '<rootDir>/../shared'],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../shared/$1',
  },
  // Custom resolver: picks the "require" (CJS) export condition for dual-mode
  // packages (drizzle-orm ships both ESM .js and CJS .cjs). Without this,
  // Jest picks the ESM files which contain bare "export" statements and crash.
  resolver: '<rootDir>/jest.resolver.js',
  // Prioritise .ts over .js so TypeScript routes shadow the legacy JS files
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/jest.setup.ts'],
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.json',
      // Disable type-checking in Jest — we run `tsc --noEmit` separately.
      // Avoids false positives from drizzle-orm appearing in both
      // server/node_modules and the root node_modules.
      diagnostics: false,
    },
  },
};
