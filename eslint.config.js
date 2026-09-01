const tseslint = require('typescript-eslint');
const js = require('@eslint/js');

module.exports = tseslint.config(
  {
    ignores: ['node_modules/**', 'android/**', 'ios/**', 'dist/**', 'src/data/artRegistry.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Unused imports are the main thing worth catching here; allow the
      // leading-underscore escape hatch for intentionally-ignored params.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // require() is unavoidable for Metro's static asset map.
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
    },
  },
);
