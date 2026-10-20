import { createServer } from "node:http";
import next from "next";

import nextConfig from "../next.config.mjs";

const port = Number(process.env.E2E_PORT ?? 3212);
const app = next({
  dev: true,
  conf: { ...nextConfig, distDir: "test-results/.next-e2e" },
});
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  void handle(req, res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`PathOS E2E server ready on http://127.0.0.1:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
