module.exports = {
  root: true,
  extends: [
    '@nuxt/eslint',
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    'plugin:typescript/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    // TypeScript-specific
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-namespace': 'off',

    // Vue-specific
    'vue/multi-word-component-names': 'off',
    'vue/require-default-prop': 'off',
    'vue/no-v-html': 'off',

    // General
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    eqeqeq: ['warn', 'smart'],
    'prefer-const': 'warn',
  },
  ignorePatterns: [
    '.nuxt',
    '.output',
    'dist',
    'node_modules',
    'supabase/functions',
  ],
}
