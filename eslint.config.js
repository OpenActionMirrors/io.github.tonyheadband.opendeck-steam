import tseslint from "typescript-eslint";

const browser = Object.fromEntries(["window", "document", "WebSocket", "console"].map((name) => [name, "readonly"]));
const node = Object.fromEntries(["console", "process", "URL", "fetch", "AbortSignal"].map((name) => [name, "readonly"]));

export default tseslint.config(
  { ignores: ["**/bin/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  // Plain JS is outside the TypeScript presets, so enable the two rules that catch real mistakes.
  { files: ["**/ui/*.js"], languageOptions: { globals: browser }, rules: { "no-undef": "error", "no-unused-vars": ["error", { argsIgnorePattern: "^_" }] } },
  { files: ["scripts/*.mjs"], languageOptions: { globals: node }, rules: { "no-undef": "error", "no-unused-vars": "error" } },
);
