/**
 * ESLint 9 flat config, written as native ES modules — the .mjs
 * extension makes Node load this one file as ESM regardless of
 * package.json not declaring "type": "module" (the rest of this
 * project stays CommonJS, matching tsconfig.json's "module":
 * "commonjs"). Written as ESM from the start: functions/'s original
 * eslint.config.js used require() and tripped
 * @typescript-eslint/no-require-imports linting itself — same fix
 * applied here up front instead of after the fact.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // cdk.out/ is CDK's synthesized CloudFormation output, not source;
    // dist/ is tsc's type-check-only build output (see .gitignore);
    // this config file is build tooling, not application source.
    ignores: ['node_modules/**', 'cdk.out/**', 'dist/**', 'eslint.config.mjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
    },
    rules: {
      // Lambda handlers and CDK constructs both commonly take a
      // parameter (event, scope, props) that documents shape without
      // every implementation needing every field — prefixing with `_`
      // opts out of the warning deliberately, rather than turning the
      // rule off.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  }
);
