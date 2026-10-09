import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Tests unitaires du routage des paiements (src/lib/orchestrator/*.test.ts).
// Lancer : npx vitest run
export default defineConfig({
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    test: { include: ["src/**/*.test.ts"], environment: "node", passWithNoTests: false },
});
