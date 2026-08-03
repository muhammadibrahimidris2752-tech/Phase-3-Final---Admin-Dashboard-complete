/**
 * ESLint 9 flat config, written as native ES modules.
 *
 * The .mjs extension makes Node load this one file as ESM regardless
 * of functions/package.json not declaring "type": "module" — the rest
 * of this project stays CommonJS (tsconfig.json compiles to
 * "module": "commonjs", matching what Cloud Functions expects). A
 * plain eslint.config.js using require() was tried first, but
 * typescript-eslint's recommended rules include
 * `@typescript-eslint/no-require-imports`, which the config file
 * itself then tripped over when `eslint .` linted it. Using real
 * `import` syntax here removes the require() calls that rule was
 * flagging, rather than suppressing the rule.
 *
 * This file is still excluded from the ruleset below (see `ignores`)
 * for the same reason lib/ and node_modules/ are: it's build tooling
 * configuration, not application source under src/.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['lib/**', 'node_modules/**', 'eslint.config.mjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
    },
    rules: {
      // Cloud Functions event handlers sometimes take a parameter that
      // documents the trigger's shape without every handler needing to
      // read every field of it — prefixing with `_` opts out of the
      // warning deliberately, rather than turning the rule off.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  }
);
