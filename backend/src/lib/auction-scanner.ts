import { closeAuctionsOnce } from "../routes/bids";
import { logger } from "./logger";

const INTERVAL_MS = 60_000; // 1 minute

export async function runAuctionTick(): Promise<void> {
  const n = await closeAuctionsOnce();
  if (n > 0) logger.info("auctions closed", { count: n });
}

export function startAuctionScanner(): void {
  setTimeout(() => {
    runAuctionTick().catch((e) => logger.warn("auction close failed", { err: String(e) }));
  }, 15_000);
  setInterval(() => {
    runAuctionTick().catch((e) => logger.warn("auction close failed", { err: String(e) }));
  }, INTERVAL_MS);
}
