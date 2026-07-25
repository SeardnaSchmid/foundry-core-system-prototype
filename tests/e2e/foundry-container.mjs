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
 * Locally that means (1) or (2): no Foundry credentials needed, just the licence
 * key. In CI the cache is restored by actions/cache and (3) is the cold-start
 * fallback. Foundry binaries are never committed to this repo.
 */

import { execFile as execFileCb } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCb);

export const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

export const IMAGE = process.env.TNO_E2E_IMAGE ?? 'felddy/foundryvtt:release';
export const CONTAINER_NAME = process.env.TNO_E2E_CONTAINER ?? 'tno-e2e';
export const FOUNDRY_VERSION = process.env.FOUNDRY_VERSION ?? '14.364';
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
 * screen forever. A signature is obtained either by authenticating against
 * Foundry's servers (what the image does with FOUNDRY_USERNAME/PASSWORD) or by
 * reusing an activation that already exists.
 *
 * A signature is bound to the hostname it was issued for, so when we reuse a
 * local activation we must also give the container that same hostname.
 *
 * @returns {{license: object, hostname: string}|null}
 */
function signedLicense() {
  if (process.env.TNO_E2E_FORCE_ACTIVATION) return null;
  if (!fs.existsSync(SOURCE_LICENSE)) return null;
  const license = JSON.parse(fs.readFileSync(SOURCE_LICENSE, 'utf8'));
  if (!license.signature || !license.host) return null;
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
    // Without a local hostname Foundry cannot build an invitation URL and
    // throws "Cannot read properties of null (reading 'local')" from
    // getInvitationLinks while a client is joining.
    FOUNDRY_LOCAL_HOSTNAME: 'localhost',
  };

  const cached = fs.existsSync(path.join(HOST_DATA, 'container_cache', `foundryvtt-${FOUNDRY_VERSION}.zip`));
  const hasCredentials = !!(process.env.FOUNDRY_USERNAME && process.env.FOUNDRY_PASSWORD);

  const signed = signedLicense();
  let hostname = 'tno-e2e';
  if (signed) {
    // provision() already wrote the activation and the image leaves an existing
    // license.json alone, so no Foundry account is involved. The hostname must
    // match the one the activation was signed for.
    hostname = signed.hostname;
  } else {
    // No activation to reuse (the CI case). The image has to fetch a signed one,
    // and that needs an authenticated session — note this is required even when
    // the release zip is already cached, because it is the *licence* being
    // fetched here, not the download.
    if (!process.env.FOUNDRY_LICENSE_KEY || !hasCredentials) {
      throw new Error(
        'No signed Foundry activation available. Either install Foundry locally (the suite reuses ' +
          'its activation), or set FOUNDRY_LICENSE_KEY, FOUNDRY_USERNAME and FOUNDRY_PASSWORD so the ' +
          'container can activate one itself.'
      );
    }
    env.FOUNDRY_LICENSE_KEY = process.env.FOUNDRY_LICENSE_KEY;
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

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const s = await status();
    if (s?.active && s.world === WORLD_ID) return id;

    const { stdout: state } = await docker(['inspect', '-f', '{{.State.Running}}', CONTAINER_NAME]);
    if (state.trim() !== 'true') {
      const { stdout: logs } = await docker(['logs', '--tail', '40', CONTAINER_NAME]);
      throw new Error(`Foundry container exited early:\n${logs}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  const { stdout: logs } = await docker(['logs', '--tail', '40', CONTAINER_NAME]);
  await removeContainer();
  throw new Error(`Foundry container was not ready within 180s:\n${logs}`);
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
