module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
  ],
  plugins: ["react-refresh"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  settings: {
    react: {
      version: "detect",
    },
  },
  rules: {
    "no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^(React|_)" },
    ],
    "react/prop-types": "off",
    "react/react-in-jsx-scope": "off",
    "react-refresh/only-export-components": ["error", { allowConstantExport: true }],
  },
  overrides: [
    {
      files: ["src/contexts/*.jsx"],
      rules: {
        "react-refresh/only-export-components": "off",
      },
    },
  ],
};
