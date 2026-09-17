/** Currency values in integer cents, avoiding floating-point euro arithmetic. */
export const MONEY_CURRENCIES = Object.freeze([
  Object.freeze({
    key: 'templeOr',
    label: 'TNO.Money.Currency.Or',
    medium: 'TNO.Money.Medium.Or',
    icon: 'fa-money-bill',
    cents: 100,
    approximate: false,
  }),
  Object.freeze({
    key: 'imperialQian',
    label: 'TNO.Money.Currency.ImperialQian',
    medium: 'TNO.Money.Medium.ImperialQian',
    icon: 'fa-microchip',
    cents: 1,
    approximate: false,
  }),
  Object.freeze({
    key: 'orNior',
    label: 'TNO.Money.Currency.OrNior',
    medium: 'TNO.Money.Medium.OrNior',
    icon: 'fa-qrcode',
    cents: 50,
    approximate: false,
  }),
  Object.freeze({
    key: 'orOdur',
    label: 'TNO.Money.Currency.OrOdur',
    medium: 'TNO.Money.Medium.OrOdur',
    icon: 'fa-coins',
    cents: 20,
    approximate: true,
  }),
  Object.freeze({
    key: 'orForseti',
    label: 'TNO.Money.Currency.OrForseti',
    medium: 'TNO.Money.Medium.OrForseti',
    icon: 'fa-money-bill-wave',
    cents: 10,
    approximate: true,
  }),
]);

/** Coerce an authored wallet value to a non-negative whole currency unit. */
export function normalizeMoneyAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0;
}

/**
 * Build the currency rows and derived euro total used by the character sheet.
 * The actor stores only native balances; conversions are always recomputed.
 */
export function prepareWallet(money = {}) {
  const rows = MONEY_CURRENCIES.map((currency) => {
    const amount = normalizeMoneyAmount(money?.[currency.key]);
    return {
      ...currency,
      amount,
      euroCents: amount * currency.cents,
    };
  });
  const totalCents = rows.reduce((sum, row) => sum + row.euroCents, 0);

  return {
    rows,
    presentRows: rows.filter((row) => row.amount > 0),
    totalCents,
    approximate: rows.some((row) => row.approximate && row.amount > 0),
  };
}
