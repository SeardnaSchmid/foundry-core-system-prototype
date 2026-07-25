import { removeContainer } from './foundry-container.mjs';

/**
 * Tear the container down unless the developer asked to keep it.
 *
 * `TNO_E2E_KEEP=1` leaves it running so the next run reuses it (see
 * global-setup) and so a failed world can be inspected in a browser.
 */
export default async function globalTeardown() {
  if (process.env.TNO_E2E_KEEP) {
    console.log('[e2e] TNO_E2E_KEEP set — leaving the Foundry container running');
    return;
  }
  await removeContainer();
}
