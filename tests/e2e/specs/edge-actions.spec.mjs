/**
 * The edge actions on a failed roll's chat card, per
 * `docs/design/workflows/problem-solving-prd.md`.
 *
 * They exist nowhere but on a rendered card: `chat.mjs` rebuilds them from
 * `flags.tno` on every `renderChatMessageHTML`, and every action writes back to
 * that same message. Eligibility and cost are unit-tested; what this spec pins
 * is that each control is reachable, does its one thing to the actor and the
 * flags, and that the card redraws into its terminal state afterwards.
 *
 * The example character rolls Schwerter 5 on Fingerfertigkeit 3: threshold 8.
 * Dice are pinned so the failure, and every reroll after it, is decided here.
 */
import { ABILITIES, test, expect, createCharacter, lastMessage, localize, openSheet, pinDice } from '../fixtures.mjs';

const FAIL = 15;
const PASS = 5;

/** Roll Schwerter through the sheet, pinned to fail, and return its card. */
async function failedSwordsRoll(page, system = {}) {
  const { id } = await createCharacter(page, {
    abilities: ABILITIES,
    skills: { swords: 5 },
    system,
  });
  const sheet = await openSheet(page, id);
  await sheet.locator('.skill-info[data-skill="swords"]').click();

  const dialog = page.locator('.tno-roll-dialog');
  await expect(dialog).toBeVisible();
  await pinDice(page, FAIL);
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toHaveCount(0);

  // The sidebar starts collapsed, which leaves only the toast on screen. The
  // edge controls are clicked in the log, where a player reaches for them.
  await page.evaluate(async () => {
    await ui.sidebar.changeTab('chat', 'primary');
    ui.sidebar.expand();
  });
  const card = page.locator('.chat-scroll .chat-message').last();
  await expect(card.locator('.tno-edge-views')).toBeVisible();
  expect((await lastMessage(page)).outcome).toBe('failure');

  const actor = (path) => page.evaluate(
    ([id, path]) => foundry.utils.getProperty(game.actors.get(id), path), [id, path]
  );
  return { card, actor };
}

test('the lesson learned banks one XP on the skill and closes the claim', async ({ world }) => {
  const { page } = world;
  const { card, actor } = await failedSwordsRoll(page);

  const claim = card.locator('[data-edge-action="xpSkill"]');
  await expect(card.locator('[data-edge-action="xpAttribute"]')).toBeVisible();
  await claim.click();

  await expect.poll(() => actor('system.skills.swords.xp')).toBe(1);
  await expect(card.locator('.tno-new-attempt-stamp')).toBeVisible();
  await expect(card.locator('.tno-xp-claim-button')).toHaveCount(0);
  // Claiming commits the roll: no way back into the troubleshoot view.
  await expect(card.locator('.tno-edge-toggle')).toHaveCount(0);

  expect(world.errors, 'no uncaught page errors claiming XP').toEqual([]);
});

test('a retry spends one edge point and puts the reroll on the same card', async ({ world }) => {
  const { page } = world;
  const { card, actor } = await failedSwordsRoll(page);
  const { summary } = await localize(page, { summary: 'TNO.Edge.SummaryRetry' });
  const before = await page.evaluate(() => game.messages.size);

  await card.locator('.tno-edge-toggle').click();
  await card.locator('[data-edge-action="retry"]').click();
  // Retry is armed, not fired: a confirm step stands between it and the point.
  const run = card.locator('.tno-edge-retry-run');
  await expect(run).toBeVisible();
  expect(await actor('system.problemSolving.spent')).toBe(0);

  await pinDice(page, PASS);
  await run.click();

  await expect.poll(() => actor('system.problemSolving.spent')).toBe(1);
  await expect(card.locator('.tno-edge-result.success')).toBeVisible();
  await expect(card.locator('.tno-edge-summary-line')).toHaveText(summary);
  // The XP claim is forfeit once a reroll has been taken.
  await expect(card.locator('.tno-xp-claim-button')).toHaveCount(0);
  // In place: no second card in the log.
  expect(await page.evaluate(() => game.messages.size)).toBe(before);

  expect(world.errors, 'no uncaught page errors during a retry').toEqual([]);
});

test('trial and error rerolls for free until the first success', async ({ world }) => {
  const { page } = world;
  const { card, actor } = await failedSwordsRoll(page);

  await card.locator('.tno-edge-toggle').click();
  await card.locator('[data-edge-action="trialError"]').click();

  const tracker = card.locator('.tno-find-flaw-tracker');
  const reroll = tracker.locator('.tno-find-flaw-reroll');
  await expect(tracker).toBeVisible();

  // Still pinned to fail: the attempt is logged and the tracker stays open.
  await reroll.click();
  await expect(tracker.locator('.tno-find-flaw-attempt.failure')).toHaveCount(1);

  await pinDice(page, PASS);
  await reroll.click();
  await expect(tracker.locator('.tno-find-flaw-attempt.success')).toHaveCount(1);
  await expect(reroll).toHaveCount(0);
  await expect(tracker.locator('.tno-find-flaw-pip.filled')).toHaveCount(2);

  const { edge } = await lastMessage(page);
  expect(edge.findFlaw).toMatchObject({ used: 2, active: false });
  expect(await actor('system.problemSolving.spent')).toBe(0);

  expect(world.errors, 'no uncaught page errors during trial and error').toEqual([]);
});

test('a successful post-mortem refunds one spent edge point', async ({ world }) => {
  const { page } = world;
  // With a full pool there is nothing to refund, and the row is disabled.
  const { card, actor } = await failedSwordsRoll(page, { problemSolving: { spent: 1 } });

  await card.locator('.tno-edge-toggle').click();
  await card.locator('[data-edge-action="postMortem"]').click();

  // The analysis forfeits the XP whatever it rolls, so it asks first.
  const confirm = page.locator('.application.dialog button[data-action="yes"]');
  await expect(confirm).toBeVisible();
  await pinDice(page, PASS);
  await confirm.click();

  await expect.poll(() => actor('system.problemSolving.spent')).toBe(0);
  await expect(card.locator('.tno-edge-result.success')).toBeVisible();
  await expect(card.locator('.tno-xp-claim-button')).toHaveCount(0);

  expect(world.errors, 'no uncaught page errors during a post-mortem').toEqual([]);
});
