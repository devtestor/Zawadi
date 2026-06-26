// Vercel entry: re-exports the Hono app via the Vercel adapter.
// The app itself lives in src/index.ts and is unchanged between Bun and Vercel.
import { handle } from "hono/vercel";
import { app } from "../src/index";

export const config = {
  runtime: "nodejs",
};

export default handle(app);
