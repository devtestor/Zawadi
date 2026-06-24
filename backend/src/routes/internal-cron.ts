import { Hono } from "hono";
import { runHoldingTick } from "../lib/holding-scanner";
import { runWebhookTick } from "../lib/webhooks";
import { runSavedSearchScan, runDailyDigest } from "../lib/saved-search-scanner";
import { runAuctionTick } from "../lib/auction-scanner";
import { logger } from "../lib/logger";

const router = new Hono();

router.use("*", async (c, next) => {
  const secret = process.env.CRON_SECRET || "";
  const header = c.req.header("authorization") || "";
  if (!secret || header !== `Bearer ${secret}`) {
    return c.json({ error: { message: "unauthorized" } }, 401);
  }
  await next();
});

const jobs: Record<string, () => Promise<void>> = {
  webhooks: runWebhookTick,
  holding: runHoldingTick,
  "saved-search": runSavedSearchScan,
  "daily-digest": runDailyDigest,
  auction: runAuctionTick,
};

router.get("/:job", async (c) => {
  const name = c.req.param("job");
  const job = jobs[name];
  if (!job) return c.json({ error: { message: "unknown job" } }, 404);
  const start = Date.now();
  try {
    await job();
    const ms = Date.now() - start;
    logger.info("cron ok", { job: name, ms });
    return c.json({ ok: true, job: name, ms });
  } catch (e) {
    logger.error("cron failed", { job: name, err: e instanceof Error ? e.message : String(e) });
    return c.json({ error: { message: "cron failed" } }, 500);
  }
});

export { router as internalCronRouter };
