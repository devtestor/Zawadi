import { closeAuctionsOnce } from "../routes/bids";
import { logger } from "./logger";

const INTERVAL_MS = 60_000; // 1 minute

export function startAuctionScanner(): void {
  setTimeout(() => {
    closeAuctionsOnce()
      .then((n) => n > 0 && logger.info("auctions closed", { count: n }))
      .catch((e) => logger.warn("auction close failed", { err: String(e) }));
  }, 15_000);
  setInterval(() => {
    closeAuctionsOnce()
      .then((n) => n > 0 && logger.info("auctions closed", { count: n }))
      .catch((e) => logger.warn("auction close failed", { err: String(e) }));
  }, INTERVAL_MS);
}
