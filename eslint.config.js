// Flat ESLint config for the whole monorepo (backend, frontend).
// Style is delegated to Prettier; ESLint focuses on correctness. Most stylistic
// or gradual-typing findings are warnings so the lint step stays informative
// without blocking the build.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-ssr/**',
      '**/coverage/**',
      '**/*.min.js',
      'backend/prisma/migrations/**',
      'frontend/public/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  // 'essential' (not 'recommended') keeps ESLint focused on correctness and
  // leaves all formatting to Prettier.
  ...pluginVue.configs['flat/essential'],

  // Vue SFCs use the TypeScript parser for <script> blocks.
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
      globals: { ...globals.browser },
    },
  },

  // Browser-side TypeScript (frontend).
  {
    files: ['frontend/**/*.{ts,vue}'],
    languageOptions: { globals: { ...globals.browser } },
  },

  // Node-side TypeScript / scripts (backend, repo tooling).
  {
    files: ['backend/**/*.{ts,js}', 'scripts/**/*.{js,mjs,cjs}', '**/*.config.{ts,js}', '**/*.cjs'],
    languageOptions: { globals: { ...globals.node } },
  },

  // Server code must log through the shared pino logger (src/config/logger.ts):
  // console output bypasses log levels, structured fields and redaction, so a
  // stray console.log can leak diary or chat content into stdout.
  // Seed and maintenance scripts under prisma/ are CLI tools — console is fine there.
  {
    files: ['backend/src/**/*.ts'],
    ignores: ['backend/src/tests/**'],
    rules: {
      'no-console': 'error',
    },
  },

  // Project-wide rule tuning.
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-require-imports': 'off',
      'vue/multi-word-component-names': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off',
    },
  },
);
