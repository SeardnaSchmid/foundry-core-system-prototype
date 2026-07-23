import { TNO_ADVANTAGE, TNO_ADVANTAGE_ABBR, describeAdvantage } from '../helpers/dice.mjs';

/**
 * Build the advantage/disadvantage option list for the roll-type picker,
 * shared by both the full roll dialog and the bare base-dice dialog so the
 * two never drift apart.
 * @returns {Array<{value: number, label: string, abbr: string, isDefault: boolean}>}
 */
export function advantageOptions() {
  return Object.entries(TNO_ADVANTAGE).map(([key, value]) => ({
    value,
    label: game.i18n.localize(`TNO.Advantage.${key.charAt(0).toUpperCase()}${key.slice(1)}`),
    abbr: TNO_ADVANTAGE_ABBR[value],
    isDefault: value === TNO_ADVANTAGE.none,
  }));
}

/**
 * Wire up an advantage-picker radiogroup rendered from advantage-picker.hbs:
 * click + Left/Right arrow-key selection, aria-checked/roving-tabindex sync,
 * and a live "which dice this rolls" consequence line.
 *
 * @param {JQuery|HTMLElement} html   The dialog's rendered root.
 * @param {(value: number) => void} [onChange]  Extra callback after a change
 *   (e.g. to refresh a threshold preview). The picker itself never touches
 *   the threshold, since the roll type does not change it.
 * @returns {(value: number|string) => void}  A programmatic select function.
 */
export function bindAdvantagePicker(html, onChange) {
  const root = html instanceof jQuery ? html[0] : html;
  const group = root.querySelector('.tno-advantage-group');
  const input = root.querySelector('input[name="advantage"]');
  const consequence = root.querySelector('.tno-advantage-effect');
  if (!group || !input) return () => {};

  const options = [...group.querySelectorAll('.tno-advantage-option')];

  const select = (value) => {
    const str = String(value);
    input.value = str;
    for (const opt of options) {
      const on = opt.dataset.value === str;
      opt.classList.toggle('active', on);
      opt.setAttribute('aria-checked', on ? 'true' : 'false');
      opt.tabIndex = on ? 0 : -1;
    }
    if (consequence) consequence.textContent = describeAdvantage(Number(value));
    onChange?.(Number(value));
  };

  for (const opt of options) {
    opt.addEventListener('click', (ev) => {
      ev.preventDefault();
      select(opt.dataset.value);
    });
  }

  group.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    const current = options.findIndex((o) => o.getAttribute('aria-checked') === 'true');
    const dir = ev.key === 'ArrowRight' ? 1 : -1;
    const next = options[Math.clamp(current + dir, 0, options.length - 1)];
    select(next.dataset.value);
    next.focus();
  });

  return select;
}
