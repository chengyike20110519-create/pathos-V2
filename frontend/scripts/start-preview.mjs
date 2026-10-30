import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import http from "node:http";

const PORT = 3002;

function listeningPids() {
  try {
    return execFileSync("lsof", ["-tiTCP:3002", "-sTCP:LISTEN"], { encoding: "utf8" })
      .trim().split(/\s+/).map(Number).filter(Number.isInteger);
  } catch {
    return [];
  }
}

function healthCheck() {
  return new Promise((resolve) => {
    const request = http.get({ hostname: "localhost", port: PORT, path: "/api/health", timeout: 5000 }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve(response.statusCode === 200 && parsed?.ok === true);
        } catch {
          resolve(false);
        }
      });
    });
    request.on("error", () => resolve(false));
    request.on("timeout", () => { request.destroy(); resolve(false); });
  });
}

const pids = listeningPids();
if (pids.length > 0 && await healthCheck()) {
  console.log(`[preview] PathOS is already healthy on http://localhost:${PORT}`);
  process.exit(0);
}

if (pids.length > 0) {
  console.warn(`[preview] removing ${pids.length} unresponsive listener(s) on port ${PORT} (pid ${pids.join(", ")})`);
  for (const pid of pids) {
    try { process.kill(pid, "SIGTERM"); } catch (error) {
      // A process can disappear between lsof and kill; only abort for a real
      // permission/OS failure, not for an already-closed stale PID.
      if (error && typeof error === "object" && "code" in error && (error).code === "ESRCH") continue;
      console.error(`[preview] cannot clear port ${PORT} (pid ${pid}): ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }
  const deadline = Date.now() + 3000;
  while (listeningPids().length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (listeningPids().length > 0) {
    console.error(`[preview] port ${PORT} is still occupied after cleanup; refusing to start a second server`);
    process.exit(1);
  }
}

const nextBin = resolve(process.cwd(), "node_modules/next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev", "--port", String(PORT)], {
  stdio: "inherit",
  shell: false,
  env: process.env,
});
child.on("error", (error) => {
  console.error(`[preview] cannot start Next.js: ${error.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
