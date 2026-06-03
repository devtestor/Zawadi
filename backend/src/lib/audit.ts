import { prisma } from "../prisma";
import { logger } from "./logger";

// Append-only audit trail. Fire-and-forget — if the write fails we still log
// so the action isn't lost from the application log.
export async function audit(input: {
  actorId?: string | null;
  action: string;
  target?: string;
  targetId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        target: input.target ?? null,
        targetId: input.targetId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      },
    });
  } catch (e) {
    logger.warn("audit write failed", { action: input.action, err: e instanceof Error ? e.message : String(e) });
  }
}
