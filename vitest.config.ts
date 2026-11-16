import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/protocol", "packages/host-core", "apps/server", "apps/web"],
  },
});
