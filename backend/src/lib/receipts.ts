import { prisma } from "../prisma";
import { sendEmail } from "./email";
import { logger } from "./logger";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c,
  );
}

function fmt(amountMinor: number, currency: string): string {
  const isInteger = ["RWF", "UGX", "TZS", "JPY", "KRW", "CLP", "VND"].includes(currency.toUpperCase());
  const major = isInteger ? amountMinor : amountMinor / 100;
  return `${currency.toUpperCase()} ${major.toLocaleString("en-US", {
    minimumFractionDigits: isInteger ? 0 : 2,
    maximumFractionDigits: isInteger ? 0 : 2,
  })}`;
}

// Stable, human-readable receipt number based on trade id.
function receiptNumber(tradeId: string): string {
  const year = new Date().getUTCFullYear();
  return `ZAW-${year}-${tradeId.slice(-8).toUpperCase()}`;
}

export interface ReceiptData {
  tradeId: string;
  number: string;
  html: string;
  text: string;
}

export async function buildReceiptForTrade(tradeId: string): Promise<ReceiptData | null> {
  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
    include: {
      listing: { select: { id: true, title: true, country: true, city: true } },
      buyer: { select: { id: true, name: true, email: true } },
      seller: { select: { id: true, name: true, email: true, businessName: true } },
    },
  });
  if (!trade || trade.status !== "completed") return null;

  const number = receiptNumber(trade.id);
  const subtotal = trade.amount - trade.feeAmount - trade.taxAmount;
  const completedAt = trade.completedAt ?? new Date();

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${number}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; background:#0A0A0F; color:#fff; padding:32px; }
  .card { max-width: 560px; margin: 0 auto; background:#12121A; border:1px solid #1E1E2A; border-radius:16px; overflow:hidden; }
  .header { padding:24px; border-bottom:1px solid #1E1E2A; }
  .h1 { color:#D4A843; font-size:22px; font-weight:900; margin:0; }
  .sub { color:#888; font-size:12px; margin-top:4px; }
  .section { padding:20px 24px; border-bottom:1px solid #1E1E2A; }
  .row { display:flex; justify-content:space-between; margin:6px 0; font-size:14px; }
  .row .k { color:#888; }
  .row .v { color:#fff; font-weight:600; }
  .total { font-size:18px; font-weight:900; color:#D4A843; }
  .pill { display:inline-block; background:#1E1E0A; color:#D4A843; padding:4px 10px; border-radius:10px; font-size:11px; font-weight:800; }
</style>
</head><body>
<div class="card">
  <div class="header">
    <img src="https://alcurry.app/logo_alcurry_dark.png" alt="Alcurry" width="124" height="32" style="display:block;margin:0 0 4px;border:0" />
    <p class="sub">Receipt #${number} · ${completedAt.toUTCString()}</p>
    <p style="margin-top:10px"><span class="pill">PAID</span></p>
  </div>
  <div class="section">
    <p style="color:#888;font-size:11px;letter-spacing:1px;margin:0 0 6px">LISTING</p>
    <p style="margin:0;font-weight:700">${escapeHtml(trade.listing.title)}</p>
    <p style="color:#666;font-size:12px;margin:4px 0 0">${[trade.listing.city, trade.listing.country].filter(Boolean).map(escapeHtml).join(", ")}</p>
  </div>
  <div class="section">
    <p style="color:#888;font-size:11px;letter-spacing:1px;margin:0 0 6px">PARTIES</p>
    <div class="row"><span class="k">Buyer</span><span class="v">${escapeHtml(trade.buyer.name)} &lt;${escapeHtml(trade.buyer.email)}&gt;</span></div>
    <div class="row"><span class="k">Seller</span><span class="v">${escapeHtml(trade.seller.businessName ?? trade.seller.name)}</span></div>
  </div>
  <div class="section">
    <p style="color:#888;font-size:11px;letter-spacing:1px;margin:0 0 6px">AMOUNTS</p>
    <div class="row"><span class="k">Subtotal (to seller)</span><span class="v">${fmt(subtotal, trade.currency)}</span></div>
    <div class="row"><span class="k">Platform fee</span><span class="v">${fmt(trade.feeAmount, trade.currency)}</span></div>
    ${trade.taxAmount > 0
      ? `<div class="row"><span class="k">VAT (${(trade.taxRateBps / 100).toFixed(1)}% of fee)</span><span class="v">${fmt(trade.taxAmount, trade.currency)}</span></div>`
      : ""}
    <div class="row" style="border-top:1px solid #1E1E2A; padding-top:10px; margin-top:10px;">
      <span class="k">Total charged to buyer</span><span class="v total">${fmt(trade.amount, trade.currency)}</span>
    </div>
  </div>
  <div class="section" style="border-bottom:0">
    <p style="color:#666;font-size:11px;line-height:16px;margin:0">
      Trade ID: ${trade.id}<br/>
      Funded ${trade.fundedAt?.toISOString() ?? "—"} · Delivered ${trade.deliveredAt?.toISOString() ?? "—"} · Completed ${trade.completedAt?.toISOString() ?? "—"}
    </p>
  </div>
</div>
</body></html>`;

  const text = [
    `Alcurry Receipt ${number}`,
    `Trade ${trade.id} — ${trade.listing.title}`,
    `Total charged to buyer: ${fmt(trade.amount, trade.currency)}`,
    `Platform fee: ${fmt(trade.feeAmount, trade.currency)}`,
    trade.taxAmount > 0 ? `VAT: ${fmt(trade.taxAmount, trade.currency)}` : "",
    `Subtotal to seller: ${fmt(subtotal, trade.currency)}`,
    `Completed ${trade.completedAt?.toISOString() ?? ""}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { tradeId, number, html, text };
}

export async function emailReceiptToParties(tradeId: string): Promise<void> {
  try {
    const r = await buildReceiptForTrade(tradeId);
    if (!r) return;
    const trade = await prisma.trade.findUnique({
      where: { id: tradeId },
      select: { buyer: { select: { email: true } }, seller: { select: { email: true } } },
    });
    if (!trade) return;
    await sendEmail({
      to: trade.buyer.email,
      subject: `Your Alcurry receipt ${r.number}`,
      text: r.text,
      html: r.html,
    });
    await sendEmail({
      to: trade.seller.email,
      subject: `Alcurry sale receipt ${r.number}`,
      text: r.text,
      html: r.html,
    });
  } catch (e) {
    logger.warn("receipt email failed", { tradeId, err: e instanceof Error ? e.message : String(e) });
  }
}
