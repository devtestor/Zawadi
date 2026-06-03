// Per-country VAT/sales-tax basis points. These are nominal headline rates,
// not legal advice — wire your accountant's authoritative table here.
// Marketplaces that don't collect tax (because the seller is registered) can
// just leave this at 0 for the relevant country.

const TAX_BPS_BY_COUNTRY: Record<string, number> = {
  // 16% VAT
  Kenya: 1600,
  // 7.5% VAT (NG)
  Nigeria: 750,
  // 15% VAT (RSA)
  "South Africa": 1500,
  // 18% VAT (RW, UG, TZ)
  Rwanda: 1800,
  Uganda: 1800,
  Tanzania: 1800,
  // 14% VAT
  Egypt: 1400,
  Morocco: 2000,
  // Defaults — anywhere not in the table.
};

export function taxBpsForCountry(country?: string | null): number {
  if (!country) return 0;
  return TAX_BPS_BY_COUNTRY[country] ?? 0;
}

// Tax is applied on the seller side of the trade — buyer pays gross amount,
// platform takes a fee, government takes VAT on the fee. We model VAT on the
// platform fee, not on the gross trade, because the goods themselves are
// usually exempt (used vehicles, immovable property, etc).
export function computeTax(feeAmount: number, country?: string | null): { amount: number; bps: number } {
  const bps = taxBpsForCountry(country);
  if (bps <= 0) return { amount: 0, bps: 0 };
  return { amount: Math.floor((feeAmount * bps) / 10_000), bps };
}
