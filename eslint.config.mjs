import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  { ignores: ["node_modules/**", "dist/**", "NetscriptDefinitions.d.ts"] },
  js.configs.recommended,
  ...tsPlugin.configs["flat/recommended"],
  {
    files: ["test/**/*.mjs"],
    languageOptions: {
      globals: { process: "readonly", URL: "readonly", WebSocket: "readonly" },
    },
  },
  {
    files: ["home/**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      globals: { React: "readonly", ReactDOM: "readonly", console: "readonly" },
    },
  },
];
