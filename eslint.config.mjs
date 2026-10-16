import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: ['.next/**', 'node_modules/**', 'public/**', 'coverage/**'],
  },
  {
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    rules: {
      '@next/next/no-img-element': 'off',
      // Regras novas do React Compiler (eslint-plugin-react-hooks 7). Muitas
      // marcam padrões válidos (ex.: reset de estado no effect, navegar com
      // window.location). Ficam como aviso pra serem limpas aos poucos sem
      // travar o CI; rules-of-hooks continua como erro.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
];

export default eslintConfig;
