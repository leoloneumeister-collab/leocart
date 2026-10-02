export default [
  {
    files: ['src/**/*.js', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', performance: 'readonly', localStorage: 'readonly',
        requestAnimationFrame: 'readonly', setTimeout: 'readonly', clearInterval: 'readonly', setInterval: 'readonly', location: 'readonly',
        process: 'readonly', console: 'readonly', URLSearchParams: 'readonly', OfflineAudioContext: 'readonly', Event: 'readonly',
        HTMLElement: 'readonly', Promise: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-dupe-keys': 'error',
      'no-unreachable': 'warn',
    },
  },
];
