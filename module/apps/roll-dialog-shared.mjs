import { TNO_ADVANTAGE, TNO_ADVANTAGE_GLYPH } from '../helpers/dice.mjs';

/**
 * Build the advantage/disadvantage option list for the roll-type picker,
 * shared by both the full roll dialog and the bare base-dice dialog so the
 * two never drift apart.
 * @returns {Array<{value: number, label: string, glyph: string, isDefault: boolean}>}
 */
export function advantageOptions() {
  return Object.entries(TNO_ADVANTAGE).map(([key, value]) => ({
    value,
    label: game.i18n.localize(`TNO.Advantage.${key.charAt(0).toUpperCase()}${key.slice(1)}`),
    glyph: TNO_ADVANTAGE_GLYPH[value],
    isDefault: value === TNO_ADVANTAGE.none,
  }));
}

/**
 * Wire a button-based radiogroup to its hidden form input. Both the roll-type
 * picker and the attribute heatmap use this one interaction pattern: one tab
 * stop, roving focus, arrow-key selection and synchronized `aria-checked`.
 *
 * @param {object} options
 * @param {HTMLElement} options.group  Element carrying `role="radiogroup"`.
 * @param {HTMLInputElement} options.input  Hidden input that owns the value.
 * @param {(value: string) => void} [options.onSelect]
 * @returns {(value: number|string) => void}  A programmatic select function.
 */
export function bindRadioGroup({ group, input, onSelect } = {}) {
  if (!group || !input) return () => {};
  const options = [...group.querySelectorAll('[role="radio"][data-value]')];
  if (!options.length) return () => {};
  if (!options.some((option) => option.getAttribute('aria-checked') === 'true')) options[0].tabIndex = 0;

  const select = (value) => {
    const selectedValue = String(value);
    input.value = selectedValue;
    for (const option of options) {
      const selected = option.dataset.value === selectedValue;
      option.classList.toggle('active', selected);
      option.setAttribute('aria-checked', selected ? 'true' : 'false');
      option.tabIndex = selected ? 0 : -1;
    }
    onSelect?.(selectedValue);
  };

  for (const option of options) {
    option.addEventListener('click', (event) => {
      event.preventDefault();
      select(option.dataset.value);
    });
  }

  group.addEventListener('keydown', (event) => {
    const direction = {
      ArrowLeft: -1,
      ArrowUp: -1,
      ArrowRight: 1,
      ArrowDown: 1,
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    const current = Math.max(0, options.findIndex((option) => option.getAttribute('aria-checked') === 'true'));
    const nextIndex = Math.min(options.length - 1, Math.max(0, current + direction));
    const next = options[nextIndex];
    select(next.dataset.value);
    next.focus();
  });

  return select;
}
