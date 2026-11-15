// SPDX-License-Identifier: MIT
export default [{
    ignores: ['node_modules/**', 'dist/**'],
}, {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        globals: {console: 'readonly', print: 'readonly', ARGV: 'readonly'},
    },
    rules: {
        'no-undef': 'error',
        'no-unused-vars': ['error', {argsIgnorePattern: '^_', caughtErrors: 'none'}],
        'no-unreachable': 'error',
        'no-dupe-args': 'error',
        'no-dupe-keys': 'error',
        'no-constant-condition': 'error',
        'no-async-promise-executor': 'error',
        'no-promise-executor-return': 'error',
        'eqeqeq': 'error',
    },
}];
