module.exports = {
  extends: '@loopback/eslint-config',
  parserOptions: {
    // tsconfig.json exclui src/__tests__; o tsconfig.test.json cobre os testes.
    project: ['./tsconfig.json', './tsconfig.test.json'],
    tsconfigRootDir: __dirname,
  },
};
