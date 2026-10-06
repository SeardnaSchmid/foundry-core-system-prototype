/**
 * Provision and run a throwaway Foundry VTT instance in Docker for the e2e suite.
 *
 * The suite never touches the developer's own Foundry install or worlds. It
 * builds a disposable host directory that is bind-mounted as the container's
 * `/data`:
 *
 *   container_cache/foundryvtt-<version>.zip   the Foundry distribution
 *   Config/                                    licence + activation, kept between runs
 *   Data/worlds/tno-e2e/world.json             hand-written, 8 lines
 *   Data/systems/tno                           bind-mounted from this repo
 *
 * Foundry does the rest on first launch: it creates the world's LevelDB stores
 * and auto-creates a *passwordless Gamemaster* user. That is what keeps the
 * harness small — there is no world-creation UI to automate, no committed world
 * fixture, and no login credentials to manage.
 *
 * Getting the Foundry distribution into the container, in priority order:
 *   1. a zip already in `container_cache` (nothing to do)
 *   2. TNO_E2E_FOUNDRY_ZIP / a local install's zip, hard-linked into the cache
 *   3. FOUNDRY_USERNAME + FOUNDRY_PASSWORD, letting the image download it
 *
 * Locally that means (1) or (2): no Foundry credentials needed. In CI the cache
 * is restored by actions/cache and (3) is the cold-start fallback. Foundry
 * binaries are never committed to this repo.
 */

import { execFile as execFileCb } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCb);

export const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

export const CONTAINER_NAME = process.env.TNO_E2E_CONTAINER ?? 'tno-e2e';
export const FOUNDRY_VERSION = process.env.FOUNDRY_VERSION ?? '14.364';
// Pinned to FOUNDRY_VERSION: `release` drifts ahead and the image warns on a mismatch.
export const IMAGE = process.env.TNO_E2E_IMAGE ?? `felddy/foundryvtt:${FOUNDRY_VERSION}`;
export const PORT = Number(process.env.TNO_E2E_PORT ?? 30001);
export const BASE_URL = `http://localhost:${PORT}`;
export const WORLD_ID = 'tno-e2e';

/** Host directory bind-mounted as the container's /data. Cached between runs. */
export const HOST_DATA =
  process.env.TNO_E2E_DATA_PATH ?? path.join(os.homedir(), '.cache', 'tno-e2e', 'data');

const SOURCE_LICENSE = path.join(
  process.env.TNO_E2E_SOURCE_DATA_PATH ?? path.join(os.homedir(), '.local', 'share', 'FoundryVTT'),
  'Config',
  'license.json'
);

/**
 * Find a *signed* licence activation to hand the container.
 *
 * Foundry 13+ refuses to launch a world from a bare licence key — the log line
 * is "Software license requires signature" and the server sits on the setup
 * screen forever. The image cannot help: with FOUNDRY_LICENSE_KEY or account
 * credentials it still writes only the bare key. The signature comes from
 * activating in Foundry's own licence screen, so the suite reuses a
 * `license.json` that has been through it — a local install's, or in CI one
 * stored as a secret (TNO_E2E_SOURCE_DATA_PATH points at either).
 *
 * A signature is bound to the hostname it was issued for, so the container
 * must get that same hostname.
 *
 * @returns {{license: object, hostname: string}|null}
 */
function signedLicense() {
  if (!fs.existsSync(SOURCE_LICENSE)) return null;
  let license;
  try {
    license = JSON.parse(fs.readFileSync(SOURCE_LICENSE, 'utf8'));
  } catch {
    // Empty or broken — in CI, a missing FOUNDRY_LICENSE_JSON secret writes an
    // empty file. Treated like no activation, so start() names the cause.
    return null;
  }
  if (!license?.signature || !license.host) return null;
  return { license, hostname: license.host };
}

/** Locate a Foundry zip on this machine to seed the container cache from. */
function findLocalZip() {
  if (process.env.TNO_E2E_FOUNDRY_ZIP) return process.env.TNO_E2E_FOUNDRY_ZIP;
  const candidates = [
    path.join(os.homedir(), 'Apps', `FoundryVTT-Linux-${FOUNDRY_VERSION}.zip`),
    path.join(os.homedir(), 'Downloads', `FoundryVTT-Linux-${FOUNDRY_VERSION}.zip`),
    path.join(os.homedir(), 'Apps', `FoundryVTT-${FOUNDRY_VERSION}.zip`),
    path.join(os.homedir(), 'Downloads', `FoundryVTT-${FOUNDRY_VERSION}.zip`),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/** Query the container's Foundry for its status. Returns null while unreachable. */
export async function status() {
  try {
    const res = await fetch(`${BASE_URL}/api/status`, { signal: AbortSignal.timeout(2000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Rebuild the disposable world, leaving the licence and release cache intact.
 *
 * The world is wiped on every run so each suite starts from an identical, empty
 * world; specs can therefore assume a clean slate rather than cleaning up after
 * themselves. `Config/` and `container_cache/` deliberately survive, so repeat
 * runs neither re-download 250MB nor re-activate the licence.
 */
export function provision() {
  const cacheDir = path.join(HOST_DATA, 'container_cache');
  const worldDir = path.join(HOST_DATA, 'Data', 'worlds', WORLD_ID);

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(path.join(HOST_DATA, 'Config'), { recursive: true });
  fs.mkdirSync(path.join(HOST_DATA, 'Data', 'systems'), { recursive: true });
  fs.mkdirSync(path.join(HOST_DATA, 'Data', 'modules'), { recursive: true });

  fs.rmSync(worldDir, { recursive: true, force: true });
  fs.mkdirSync(worldDir, { recursive: true });

  // A container killed mid-run (`docker rm -f`, an interrupted test) leaves this
  // behind, and Foundry then refuses to start with "already locked by another
  // process". Clearing it makes the harness recover on its own instead of
  // needing a manual cleanup after every crashed run.
  fs.rmSync(path.join(HOST_DATA, 'Config', 'options.json.lock'), { recursive: true, force: true });

  // Reuse an existing activation when there is one, so local runs need no
  // Foundry account credentials at all.
  const signed = signedLicense();
  if (signed) {
    fs.writeFileSync(
      path.join(HOST_DATA, 'Config', 'license.json'),
      JSON.stringify(signed.license, null, 2)
    );
  }

  // Bind-mount target for the repo. Must exist, and must be a real directory
  // rather than a symlink: the container resolves paths in its own namespace.
  fs.mkdirSync(path.join(HOST_DATA, 'Data', 'systems', 'tno'), { recursive: true });

  seedReleaseCache(cacheDir);

  const major = String(parseInt(FOUNDRY_VERSION, 10));
  const system = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'system.json'), 'utf8'));
  fs.writeFileSync(
    path.join(worldDir, 'world.json'),
    `${JSON.stringify(
      {
        title: 'TNO E2E',
        system: 'tno',
        id: WORLD_ID,
        coreVersion: FOUNDRY_VERSION,
        compatibility: { minimum: major, verified: major },
        systemVersion: system.version,
        description: 'Disposable world for the e2e suite. Recreated on every run.',
        flags: {},
      },
      null,
      2
    )}\n`
  );

  // The container always runs as uid:gid 1000:1000 regardless of who owns the
  // bind-mounted host directory (e.g. the GitHub Actions runner user does not
  // have uid 1000), so it cannot write under a normal 0755 tree. Opening
  // permissions up is simpler and more portable than chown, which would
  // require root.
  chmodRecursive(HOST_DATA, 0o777);
}

/** Recursively chmod a directory tree, since fs.mkdirSync's mode is subject to umask. */
function chmodRecursive(dir, mode) {
  fs.chmodSync(dir, mode);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) chmodRecursive(entryPath, mode);
    else fs.chmodSync(entryPath, mode);
  }
}

/**
 * Put a Foundry release zip where the image expects it, if we can find one.
 * Hard-links to avoid a second 250MB copy, falling back to a real copy when the
 * source sits on a different filesystem.
 */
function seedReleaseCache(cacheDir) {
  const target = path.join(cacheDir, `foundryvtt-${FOUNDRY_VERSION}.zip`);
  if (fs.existsSync(target)) return;

  const source = findLocalZip();
  if (!source) return; // fall through to credential-based download

  try {
    fs.linkSync(source, target);
  } catch {
    fs.copyFileSync(source, target);
  }
}

async function docker(args, opts = {}) {
  return execFile('docker', args, { maxBuffer: 10 * 1024 * 1024, ...opts });
}

/** Remove any container left behind by an interrupted run. */
export async function removeContainer() {
  try {
    await docker(['rm', '-f', CONTAINER_NAME]);
  } catch {
    // not running; nothing to remove
  }
}

/**
 * Start the container and resolve once the world is live.
 * @returns {Promise<string>} the container id
 */
export async function start() {
  await removeContainer();

  // Note: CONTAINER_PRESERVE_CONFIG is deliberately NOT set. It also suppresses
  // the options.json update, which is how FOUNDRY_WORLD is applied — with it on,
  // the server starts but never launches the world.
  const env = {
    FOUNDRY_VERSION,
    FOUNDRY_WORLD: WORLD_ID,
    FOUNDRY_ADMIN_KEY: 'tno-e2e',
    FOUNDRY_TELEMETRY: 'false',
    FOUNDRY_UPNP: 'false',
    // Foundry's invitation links read `addresses`, which stays null until a
    // call to api.foundryvtt.com/ip returns. A join that lands first throws
    // "Cannot read properties of null (reading 'local')" from
    // getInvitationLinks, the client receives an empty world and never reaches
    // `ready`. Without discovery the addresses are set from the local hostname
    // straight away.
    FOUNDRY_IP_DISCOVERY: 'false',
    FOUNDRY_LOCAL_HOSTNAME: 'localhost',
  };

  const cached = fs.existsSync(path.join(HOST_DATA, 'container_cache', `foundryvtt-${FOUNDRY_VERSION}.zip`));
  const hasCredentials = !!(process.env.FOUNDRY_USERNAME && process.env.FOUNDRY_PASSWORD);

  const signed = signedLicense();
  if (!signed) {
    throw new Error(
      `No signed Foundry activation at ${SOURCE_LICENSE}. Activate a Foundry install once (the ` +
        'suite reuses its Config/license.json), or point TNO_E2E_SOURCE_DATA_PATH at a directory ' +
        'whose Config/license.json is signed. A bare licence key is not enough.'
    );
  }
  // provision() already wrote the activation and the image leaves an existing
  // license.json alone. The hostname must match the one it was signed for.
  const hostname = signed.hostname;
  // Credentials only serve the release download; licensing never needs them.
  if (hasCredentials) {
    env.FOUNDRY_USERNAME = process.env.FOUNDRY_USERNAME;
    env.FOUNDRY_PASSWORD = process.env.FOUNDRY_PASSWORD;
  }

  if (!cached && !hasCredentials) {
    throw new Error(
      `No Foundry release cached at ${HOST_DATA}/container_cache/foundryvtt-${FOUNDRY_VERSION}.zip ` +
        `and no FOUNDRY_USERNAME/FOUNDRY_PASSWORD to download one. Point TNO_E2E_FOUNDRY_ZIP at a ` +
        `local Foundry ${FOUNDRY_VERSION} zip, or set the credentials.`
    );
  }

  const args = [
    'run', '--detach',
    '--name', CONTAINER_NAME,
    '--hostname', hostname,
    '--publish', `${PORT}:30000`,
    '--volume', `${HOST_DATA}:/data`,
    // The code under test is the working tree itself: no build, no packaging,
    // so a failing spec can be re-run against an edit immediately.
    '--volume', `${REPO_ROOT}:/data/Data/systems/tno:ro`,
  ];
  for (const [k, v] of Object.entries(env)) args.push('--env', `${k}=${v}`);
  args.push(IMAGE);

  const { stdout } = await docker(args);
  const id = stdout.trim();

  // A cold cache means the image has to download the ~250MB Foundry release
  // and fetch a signed licence before the world can even start loading, which
  // routinely blows past 180s in CI. A warm cache skips both, so it stays
  // fast for the common case.
  const readyTimeoutMs = cached ? 180_000 : 400_000;

  const deadline = Date.now() + readyTimeoutMs;
  while (Date.now() < deadline) {
    const s = await status();
    if (s?.active && s.world === WORLD_ID) return id;

    const { stdout: state } = await docker(['inspect', '-f', '{{.State.Running}}', CONTAINER_NAME]);
    if (state.trim() !== 'true') {
      const logs = await startupLogs();
      throw new Error(`Foundry container exited early:\n${logs}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  const logs = await startupLogs();
  await removeContainer();
  throw new Error(`Foundry container was not ready within ${readyTimeoutMs / 1000}s:\n${logs}`);
}

/**
 * The container's log without the readiness poll's noise: every /api/status
 * call logs "Created client session", so a plain `--tail` holds nothing else
 * and hides why the world never came up.
 */
async function startupLogs() {
  const { stdout } = await docker(['logs', CONTAINER_NAME]);
  return stdout
    .split('\n')
    .filter((line) => !line.includes('Created client session'))
    .slice(-200)
    .join('\n');
}

/** Dump recent container logs, for diagnosing a failed start. */
export async function logs(tail = 60) {
  try {
    const { stdout } = await docker(['logs', '--tail', String(tail), CONTAINER_NAME]);
    return stdout;
  } catch {
    return '';
  }
}
