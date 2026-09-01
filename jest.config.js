/**
 * Two projects on purpose:
 *
 *  - "domain" runs pure TypeScript — the rules in src/domain, the seed
 *    catalogue, the dependency-free db helpers, and the build scripts — on
 *    plain node. No React Native transform, no jsdom, so it starts in
 *    milliseconds and can run on every save.
 *
 *  - "app" uses the jest-expo preset for anything that touches React Native or
 *    opens SQLite.
 *
 * Note src/db is split between them: `backupFormat.ts` and friends are
 * deliberately free of any database import precisely so their rules can be
 * tested here rather than only on a device.
 */
module.exports = {
  projects: [
    {
      displayName: 'domain',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/src/domain/**/*.test.ts',
        '<rootDir>/src/data/**/*.test.ts',
        '<rootDir>/src/db/backupFormat.test.ts',
        '<rootDir>/scripts/**/*.test.ts',
      ],
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
      transform: {
        '^.+\\.tsx?$': [
          'babel-jest',
          { presets: [['babel-preset-expo', { jsxRuntime: 'automatic' }]] },
        ],
      },
    },
    {
      displayName: 'app',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/src/**/*.test.tsx', '<rootDir>/src/stores/**/*.test.ts'],
    },
  ],
};
