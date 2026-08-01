#!/usr/bin/env node
// Launches the local Foundry VTT install headlessly (no Electron UI) against
// the user's data directory, which symlinks `Data/systems/tno` to this repo.
// Override paths via env vars if your install lives elsewhere.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const appPath = process.env.FOUNDRY_APP_PATH
  ?? path.join(os.homedir(), "Apps/FoundryVTT_v14/resources/app");
const dataPath = process.env.FOUNDRY_DATA_PATH
  ?? path.join(os.homedir(), ".local/share/FoundryVTT");
const port = process.env.FOUNDRY_PORT ?? "30000";
const world = process.env.FOUNDRY_WORLD ?? "tno-test";

const mainScript = path.join(appPath, "main.mjs");
if (!existsSync(mainScript)) {
  console.error(`Foundry entry point not found at ${mainScript}`);
  console.error("Set FOUNDRY_APP_PATH to your Foundry install's resources/app directory.");
  process.exit(1);
}

function isPortInUse(checkPort) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port: Number(checkPort), host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

if (await isPortInUse(port)) {
  console.error(`Port ${port} is already in use — is another Foundry instance already running?`);
  process.exit(1);
}

const args = [mainScript, `--dataPath=${dataPath}`, `--port=${port}`, "--noupdate"];
if (world) args.push(`--world=${world}`);

const child = spawn("node", args, { stdio: "inherit" });

// Make sure the Foundry process never outlives this wrapper: forward
// termination signals, and as a last resort kill it on our own exit.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown || child.exitCode !== null) return;
  shuttingDown = true;
  child.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => shutdown(signal));
}
process.on("exit", () => shutdown("SIGTERM"));

child.on("exit", (code, signal) => {
  shuttingDown = true;
  process.exit(code ?? (signal ? 1 : 0));
});
