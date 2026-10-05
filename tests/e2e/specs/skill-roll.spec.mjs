/**
 * The skill roll, per `docs/design/player-roll-workflows.md`: sheet → skill →
 * roll dialog → Roll. The most-used workflow of the system.
 *
 * The threshold arithmetic and the bonus clamp live in the unit suite. What only
 * a real Foundry answers is the wiring: that the skill row opens a dialog built
 * on that skill and its attribute, that a situational step reaches the
 * threshold, and that the card the dice land on carries the skill and the
 * attribute the post-failure XP claim will credit.
 *
 * Fingerfertigkeit 4 + Schwerter 5 = 9, plus one +3 step = 12. Every die on 10.
 */
import { test, expect, createCharacter, lastMessage, openSheet, pinDice } from '../fixtures.mjs';

const SKILL = {
  fin: 4,
  swords: 5,
  base: 9,
  bonus: 3,
  threshold: 12,
  face: 10,
};

test('a skill row rolls its skill and attribute, plus the situational step', async ({ world }) => {
  const { page } = world;

  const { id } = await createCharacter(page, {
    abilities: { fin: SKILL.fin },
    skills: { swords: SKILL.swords },
  });

  const sheet = await openSheet(page, id);
  await sheet.locator('.skill-info[data-skill="swords"]').click();

  // The window's id carries the appId, so the form's own class is the handle.
  const dialog = page.locator('form.tno-roll-dialog');
  await expect(dialog).toBeVisible();

  // Nothing is required before a plain skill roll: it is ready on open.
  const threshold = dialog.locator('[data-role="threshold"]');
  await expect(threshold).toHaveText(`≤ ${SKILL.base}`);

  await dialog.locator(`.tno-bonus-step[data-delta="${SKILL.bonus}"]`).click();
  await expect(threshold).toHaveText(`≤ ${SKILL.threshold}`);

  await pinDice(page, SKILL.face);
  await dialog.locator('button[type="submit"]').click();
  await expect(dialog).toBeHidden();

  const card = page.locator('.chat-scroll .chat-message').last();
  await expect(card).toBeVisible();

  const flags = await lastMessage(page);
  expect(flags).toMatchObject({
    threshold: SKILL.threshold,
    bonus: SKILL.bonus,
    outcome: 'success',
    skillKey: 'swords',
    attributeKey: 'fin',
  });
  // A success offers no edge action: there is nothing to troubleshoot.
  await expect(card.locator('.tno-edge-views')).toHaveCount(0);

  expect(world.errors, 'no uncaught page errors during a skill roll').toEqual([]);
});
