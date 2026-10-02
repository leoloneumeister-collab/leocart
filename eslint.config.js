const browserGlobals = {
  window: 'readonly', document: 'readonly', navigator: 'readonly', performance: 'readonly', localStorage: 'readonly',
  requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly', location: 'readonly', console: 'readonly', fetch: 'readonly',
  URL: 'readonly', Blob: 'readonly', AbortController: 'readonly', structuredClone: 'readonly', confirm: 'readonly',
  AudioContext: 'readonly', Notification: 'readonly', self: 'readonly', caches: 'readonly', DOMParser: 'readonly',
};

export default [
  { ignores: ['apps/shared/vendor/**'] },
  {
    // Static browser apps in /apps/ (no build step, plain ES modules)
    files: ['apps/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: browserGlobals },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-dupe-keys': 'error',
      'no-unreachable': 'warn',
    },
  },
  {
    files: ['src/**/*.js', 'scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly', performance: 'readonly', localStorage: 'readonly',
        requestAnimationFrame: 'readonly', setTimeout: 'readonly', clearInterval: 'readonly', setInterval: 'readonly', location: 'readonly',
        process: 'readonly', console: 'readonly', URLSearchParams: 'readonly', OfflineAudioContext: 'readonly', Event: 'readonly',
        HTMLElement: 'readonly', Promise: 'readonly', fetch: 'readonly',
        URL: 'readonly', Buffer: 'readonly', DOMParser: 'readonly', structuredClone: 'readonly',
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
