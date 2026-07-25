/**
 * Provision and run a throwaway Foundry VTT instance for e2e tests.
 *
 * The e2e suite deliberately never touches the developer's own Foundry data
 * directory. Instead it builds a *second*, disposable `dataPath` containing
 * nothing but:
 *
 *   Config/license.json   (copied from the real install — same machine, same
 *   Config/admin.txt       licence, so no extra activation is needed)
 *   Data/systems/tno      -> symlink back to this repo, so the code under test
 *                            is the working tree, with no build step
 *   Data/worlds/tno-e2e/world.json
 *
 * Foundry fills in the rest on first launch: it creates the world's LevelDB
 * stores and — the part that makes this whole approach viable — auto-creates a
 * passwordless Gamemaster user, so the suite can join without any UI setup.
 *
 * Because the instance listens on its own port with its own dataPath, it can
 * run side by side with the developer's normal Foundry on :30000.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** Where the disposable dataPath lives. Override to relocate it. */
export const DATA_PATH =
  process.env.TNO_E2E_DATA_PATH ?? path.join(os.homedir(), '.cache', 'tno-e2e', 'foundry-data');

/** Foundry application directory (the one containing `resources/app/main.mjs`). */
export const FOUNDRY_APP = process.env.TNO_E2E_FOUNDRY_APP ?? path.join(os.homedir(), 'Apps', 'FoundryVTT_v14');

/** The developer's real dataPath, used only as the source of the licence files. */
export const SOURCE_DATA_PATH =
  process.env.TNO_E2E_SOURCE_DATA_PATH ?? path.join(os.homedir(), '.local', 'share', 'FoundryVTT');

export const PORT = Number(process.env.TNO_E2E_PORT ?? 30001);
export const BASE_URL = `http://localhost:${PORT}`;
export const WORLD_ID = 'tno-e2e';

/**
 * Ask a (possibly not-yet-running) Foundry for its status.
 * @returns {Promise<object|null>} The parsed `/api/status` payload, or null if unreachable.
 */
export async function status() {
  try {
    const res = await fetch(`${BASE_URL}/api/status`, { signal: AbortSignal.timeout(2000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Build the disposable dataPath from scratch.
 *
 * Always starts by deleting any previous one, so every run begins from an
 * identical world: no leftover actors, chat messages or settings from the last
 * suite. That is what lets the specs assume a clean slate instead of having to
 * defensively clean up after themselves.
 */
export function provisionDataPath() {
  const version = readCoreVersion();

  fs.rmSync(DATA_PATH, { recursive: true, force: true });
  fs.mkdirSync(path.join(DATA_PATH, 'Config'), { recursive: true });
  fs.mkdirSync(path.join(DATA_PATH, 'Data', 'systems'), { recursive: true });
  fs.mkdirSync(path.join(DATA_PATH, 'Data', 'modules'), { recursive: true });
  fs.mkdirSync(path.join(DATA_PATH, 'Data', 'worlds', WORLD_ID), { recursive: true });

  for (const file of ['license.json', 'admin.txt']) {
    const from = path.join(SOURCE_DATA_PATH, 'Config', file);
    if (!fs.existsSync(from)) {
      throw new Error(
        `Missing ${from}. The e2e suite copies the licence from your real Foundry install; ` +
          `set TNO_E2E_SOURCE_DATA_PATH if yours lives elsewhere.`
      );
    }
    fs.copyFileSync(from, path.join(DATA_PATH, 'Config', file));
  }

  // The system under test *is* the working tree — no packaging, no copy step,
  // so a failing spec can be re-run against an edit immediately.
  fs.symlinkSync(REPO_ROOT, path.join(DATA_PATH, 'Data', 'systems', 'tno'), 'dir');

  const system = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'system.json'), 'utf8'));
  fs.writeFileSync(
    path.join(DATA_PATH, 'Data', 'worlds', WORLD_ID, 'world.json'),
    `${JSON.stringify(
      {
        title: 'TNO E2E',
        system: 'tno',
        id: WORLD_ID,
        coreVersion: version,
        compatibility: { minimum: String(parseInt(version, 10)), verified: String(parseInt(version, 10)) },
        systemVersion: system.version,
        description: 'Disposable world for the e2e suite. Recreated on every run.',
        flags: {},
      },
      null,
      2
    )}\n`
  );
}

/** Read the installed core version so the generated world.json matches it. */
function readCoreVersion() {
  const pkgPath = path.join(FOUNDRY_APP, 'resources', 'app', 'package.json');
  if (!fs.existsSync(pkgPath)) {
    throw new Error(
      `Could not find Foundry at ${FOUNDRY_APP}. Set TNO_E2E_FOUNDRY_APP to your install directory.`
    );
  }
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
}

/**
 * Launch the instance and resolve once its world is live.
 * @returns {Promise<import('node:child_process').ChildProcess>}
 */
export async function start() {
  const logPath = path.join(DATA_PATH, 'e2e-server.log');
  const log = fs.openSync(logPath, 'w');

  const proc = spawn(
    path.join(FOUNDRY_APP, 'foundryvtt'),
    [
      `--dataPath=${DATA_PATH}`,
      `--port=${PORT}`,
      `--world=${WORLD_ID}`,
      '--noupnp',
      '--headless',
      '--adminKey=',
    ],
    { cwd: FOUNDRY_APP, stdio: ['ignore', log, log], detached: false }
  );
  proc.unref();

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const s = await status();
    if (s?.active && s.world === WORLD_ID) return proc;
    if (proc.exitCode !== null) {
      throw new Error(`Foundry exited early (code ${proc.exitCode}). See ${logPath}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill();
  throw new Error(`Foundry did not become ready within 60s. See ${logPath}`);
}

/** Stop a previously started instance. */
export async function stop(proc) {
  if (!proc || proc.exitCode !== null) return;
  proc.kill('SIGTERM');
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline && proc.exitCode === null) {
    await new Promise((r) => setTimeout(r, 200));
  }
  if (proc.exitCode === null) proc.kill('SIGKILL');
}
