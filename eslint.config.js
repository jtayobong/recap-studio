import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// eslint-plugin-react-hooks v7 exposes its flat preset under `configs.flat`.
const reactHooksRecommended = reactHooks.configs.flat?.recommended ?? reactHooks.configs.recommended;

export default defineConfig([
  { ignores: ['dist', 'playwright-report', 'test-results', 'src-tauri'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooksRecommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'User content must never be rendered as HTML.',
        },
      ],
    },
  },
]);
