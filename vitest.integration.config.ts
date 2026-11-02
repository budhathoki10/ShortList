import path from "node:path";
import { defineConfig } from "vitest/config";
import { FREEMIUS_TEST_ENV } from "./tests/support/freemius";

export const FIXTURE_PORT = 4101;

// Runs the real database-backed services against a real MongoDB (see tests/support/mongo.ts) and a local fixture server.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // The real package throws outside React Server Components.
      "server-only": path.resolve(__dirname, "tests/integration/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      FIXTURE_BASE: `http://127.0.0.1:${FIXTURE_PORT}`,
      FETCH_ALLOW_PRIVATE_HOSTS: "1",
      ANTHROPIC_API_KEY: "fake-anthropic-key",
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${FIXTURE_PORT}/anthropic`,
      // Tests call the AI features back to back; the limit's own behaviour is covered in its own test.
      AI_CALLS_PER_MINUTE: "1000",
      AI_GLOBAL_PER_HOUR: "100000",
      ...FREEMIUS_TEST_ENV,
      APP_URL: "http://localhost:3000",
    },
  },
});
