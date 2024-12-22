import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from 'eslint-plugin-react-hooks';
import eslintConfigPrettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jsx from 'eslint-plugin-jsx-a11y';
import { fixupPluginRules } from "@eslint/compat";

// import airbnb from 'eslint-config-airbnb';

export default [
  eslintConfigPrettier,
  importPlugin.flatConfigs.recommended,
  pluginJs.configs.recommended,
  jsx.flatConfigs.recommended,
  {
    plugins: {
      'react-hooks': fixupPluginRules(reactHooks),
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    }
  },
  {
    parserOptions: {
      ecmaVersion: 'latest',
    },
    settings: {
      react: {
        version: 'detect',
        defaultVersion: '',
      }
    },
    plugins: {
      // airbnb,
      react,
      '@typescript-eslint': tseslint.configs.recommended,
    },
    languageOptions: {
      globals: {
        'ethereum': 'readonly',
        'arguments': 'readonly',
        'getLogData': 'readonly',
        'playLogData': 'readonly',
        '__ENV_APP__': 'readonly',
        'autoLaunch': 'readonly',
        'bootstrap': 'readonly',
        'Olm': 'readonly',
        'qrcode': 'readonly',
        'tinyDB': 'readonly',
        ...globals.browser,
        ...globals.es2021
      }
    },
    ignores: [
      'android/**',
      'experiment/**',
      'node_modules/**',
      'gallery/**',
      'dist/**',
      'dist-electron/**',
      'vendor/**',
      'release/**',
      '.flatpak/**',
      '*.md',
      'old/**/**',
      '**/old.js',
      '**/old.jsx',
    ],
    rules: {

      'camelcase': 0,
      'default-case': 0,
      'array-callback-return': 0,
      'prefer-regex-literals': 0,
      'func-names': 0,
      'prefer-rest-params': 0,
      'max-classes-per-file': 0,
      'guard-for-in': 0,
      'linebreak-style': 0,

      'prefer-destructuring': 0,
      'consistent-return': 0,

      'no-loop-func': 0,
      'no-continue': 0,
      'no-restricted-syntax': 0,
      'no-unsafe-optional-chaining': 0,
      'no-underscore-dangle': 0,
      'no-new': 0,
      'no-console': 0,
      'no-alert': 0,
      'no-plusplus': 0,
      'no-minusminus': 0,
      'no-param-reassign': 0,
      "no-shadow": "off",
      'no-useless-escape': 0,
      'no-restricted-exports': 0,
      'no-nested-ternary': 0,
      'no-bitwise': 0,
      'no-unused-vars': 0,
      'no-async-promise-executor': 0,
      'no-await-in-loop': 0,

      'jsx-a11y/control-has-associated-label': 0,
      'jsx-a11y/no-noninteractive-element-interactions': 0,
      'jsx-a11y/media-has-caption': 0,
      'jsx-a11y/anchor-is-valid': 0,
      'jsx-a11y/click-events-have-key-events': 0,
      'jsx-a11y/no-static-element-interactions': 0,
      'jsx-a11y/label-has-associated-control': 0,

      'import/no-cycle': 0,
      "import/prefer-default-export": "off",
      "import/extensions": "off",
      "import/no-unresolved": "off",
      "import/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: true,
        },
      ],

      'react/no-unstable-nested-components': [
        'error',
        { allowAsProps: true },
      ],
      "react/jsx-filename-extension": [
        "error",
        {
          extensions: [".tsx", ".jsx"],
        },
      ],

      'react/jsx-curly-brace-presence': 0,
      'react/function-component-definition': 0,
      'react/button-has-type': 0,
      'react/forbid-prop-types': 0,
      'react/jsx-no-bind': 0,
      'react-hooks/exhaustive-deps': 0,
      'react/prop-types': 0,
      "react/require-default-props": "off",
      "react/jsx-props-no-spreading": "off",
      // "react-hooks/rules-of-hooks": "error",
      "react/no-unknown-property": 0,


      '@typescript-eslint/no-this-alias': 0,
      "@/no-shadow": "error",
      "@/no-unused-vars": "error",
    },
  },
];
