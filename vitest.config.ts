import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    exclude: ["node_modules", ".next", "dist", "tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      exclude: [
        "node_modules/**",
        ".next/**",
        "tests/**",
        "**/*.config.{ts,js,mjs,cjs}",
        "**/*.d.ts",
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "./src"),
      "@/app": path.resolve(rootDir, "./src/app"),
      "@/domain": path.resolve(rootDir, "./src/domain"),
      "@/application": path.resolve(rootDir, "./src/application"),
      "@/infrastructure": path.resolve(rootDir, "./src/infrastructure"),
      "@/lib": path.resolve(rootDir, "./src/lib"),
      "@/config": path.resolve(rootDir, "./src/config"),
      "@/components": path.resolve(rootDir, "./src/components"),
      "@/tests": path.resolve(rootDir, "./tests"),
      // `server-only` throws on import outside a Next.js server runtime.
      // In Vitest we're in plain Node, so we stub it with an empty module.
      // This is the same pattern Next's own test setup recommends.
      "server-only": path.resolve(rootDir, "./tests/_stubs/server-only.ts"),
    },
  },
});
