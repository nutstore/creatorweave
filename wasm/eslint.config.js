export default [
  {
    ignores: ['dist', 'wasm/pkg', 'node_modules'],
  },
  {
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-refresh/only-export-components': 'warn',
    },
  },
]
