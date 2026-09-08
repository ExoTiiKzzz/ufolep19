import { generateKeyPairSync } from "node:crypto";

import { defineConfig } from "vitest/config";

// Convex Auth signe ses jetons en RS256 et lit la clé dans l'environnement. En
// production elle vit sur le déploiement (posée par `npx @convex-dev/auth`) ; en test on
// génère une paire éphémère à chaque exécution, ce qui rend le parcours de connexion
// vérifiable sans jamais stocker de secret dans le dépôt.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    env: {
      JWT_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      CONVEX_SITE_URL: "http://localhost:3000",
    },
  },
});
