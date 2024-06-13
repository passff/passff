import eslintConfigPrettier from "eslint-config-prettier";

export default [
  {
    files: ["src/**/*.js"],
    rules: {
      semi: "error",
    },
  },
  eslintConfigPrettier,
];
