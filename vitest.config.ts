import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig keeps "jsx": "preserve" for Next; compile .tsx in tests with the automatic runtime so component
  // render tests do not need a global `React`.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    testTimeout: 60000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
