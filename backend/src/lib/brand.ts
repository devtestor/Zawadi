// Alcurry brand mark for server-rendered HTML pages (browser surfaces only —
// email clients strip inline SVG, so don't use this in emails/receipts).
// The peak doubles as a rooftop (Property), a mountain (Land / Mining), and the
// "A" of Alcurry. Matches mobile/public/favicon.svg.
export function alcurryMark(size = 40, stroke = "#D4A843"): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Alcurry"><path d="M14 49 L32 16 L50 49" fill="none" stroke="${stroke}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 40 L43 40" stroke="${stroke}" stroke-width="7" stroke-linecap="round"/></svg>`;
}
