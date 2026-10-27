import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'evidence/**',
      'assets/**',
      'yuyang-site-3d-assets/**',
      'tests/fixtures/retired-miro-rest/**',
    ],
  },
  {
    files: [
      'src/**/*.js',
      'server/**/*.js',
      'tools/**/*.js',
      'scripts/**/*.mjs',
      'tests/**/*.mjs',
      '*.js',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-unexpected-multiline': 'error',
      'valid-typeof': 'error',
      'constructor-super': 'error',
      'no-this-before-super': 'error',
      'no-constant-binary-expression': 'error',
    },
  },
  {
    files: ['src/**/*.js'],
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['src/**/*.js'],
    ignores: ['src/api/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^node:|/(tools|api)/|/server/(?!chat-attachments[.]js$))',
              message:
                'Browser code may import only browser modules and the pure attachment contract.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['server/chat-attachments.js'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['*'] }],
      'no-restricted-globals': ['error', 'process', 'require', 'fetch', 'global'],
    },
  },
  {
    files: ['src/api/**/*.js'],
    languageOptions: { globals: globals.node },
  },
];
