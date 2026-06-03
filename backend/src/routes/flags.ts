import { Hono } from "hono";
import { auth } from "../auth";
import { allFlagsFor } from "../lib/flags";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const router = new Hono<{ Variables: Variables }>();

// GET /api/flags - returns the flag map for the current viewer.
router.get("/", async (c) => {
  const user = c.get("user");
  const flags = await allFlagsFor(user?.id);
  return c.json({ data: flags });
});

export { router as flagsRouter };
