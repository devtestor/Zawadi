import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma";
import { env } from "../env";

// Money is in integer minor units. Cross-currency operations must be FX'd by
// the caller before reaching this layer.

export interface PostEntry {
  walletId: string;
  kind:
    | "deposit"
    | "withdraw"
    | "transfer_in"
    | "transfer_out"
    | "escrow_hold"
    | "escrow_release"
    | "escrow_refund"
    | "fee"
    | "boost";
  amount: number; // positive credits, negative debits
  currency: string;
  refType?: "trade" | "topup" | "boost" | "external";
  refId?: string;
  description?: string;
}

type Tx = Prisma.TransactionClient | PrismaClient;

export async function getOrCreateWallet(userId: string, currency = env.WALLET_DEFAULT_CURRENCY) {
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.wallet.create({ data: { userId, currency } });
}

// Atomic post: applies the ledger entry AND updates the wallet's running
// balance/pending-* fields inside the same transaction. Throws on insufficient
// funds. Must be called inside a Prisma transaction when chaining multiple
// posts to keep them all-or-nothing.
export async function postEntry(tx: Tx, entry: PostEntry): Promise<void> {
  const wallet = await tx.wallet.findUnique({ where: { id: entry.walletId } });
  if (!wallet) throw new Error("Wallet not found");
  if (wallet.currency !== entry.currency) {
    throw new Error(`Currency mismatch: wallet=${wallet.currency} entry=${entry.currency}`);
  }

  let balanceDelta = 0;
  let pendingDebitDelta = 0;
  let pendingCreditDelta = 0;

  switch (entry.kind) {
    case "deposit":
    case "transfer_in":
    case "escrow_release":
      balanceDelta = entry.amount;
      if (entry.amount < 0) throw new Error(`${entry.kind} must be positive`);
      break;
    case "withdraw":
    case "transfer_out":
    case "fee":
    case "boost":
      balanceDelta = -Math.abs(entry.amount);
      if (wallet.balance + balanceDelta < 0) throw new Error("Insufficient funds");
      break;
    case "escrow_hold":
      // Buyer-side: move from balance into pendingDebit, same wallet.
      balanceDelta = -Math.abs(entry.amount);
      pendingDebitDelta = Math.abs(entry.amount);
      if (wallet.balance + balanceDelta < 0) throw new Error("Insufficient funds");
      break;
    case "escrow_refund":
      // Buyer-side: release the hold back to spendable balance.
      balanceDelta = Math.abs(entry.amount);
      pendingDebitDelta = -Math.abs(entry.amount);
      break;
    default:
      throw new Error(`Unknown entry kind ${entry.kind as string}`);
  }

  await tx.walletTxn.create({
    data: {
      walletId: entry.walletId,
      kind: entry.kind,
      amount: entry.amount,
      currency: entry.currency,
      refType: entry.refType ?? null,
      refId: entry.refId ?? null,
      description: entry.description ?? null,
    },
  });
  await tx.wallet.update({
    where: { id: entry.walletId },
    data: {
      balance: { increment: balanceDelta },
      pendingDebit: { increment: pendingDebitDelta },
      pendingCredit: { increment: pendingCreditDelta },
    },
  });
}

// Convenience: top-up a wallet (e.g. after a successful Pesapal payment).
export async function creditDeposit(userId: string, amount: number, currency: string, refId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    const id = wallet?.id ?? (await tx.wallet.create({ data: { userId, currency } })).id;
    await postEntry(tx, {
      walletId: id,
      kind: "deposit",
      amount,
      currency,
      refType: "topup",
      refId,
      description: "Wallet top-up",
    });
  });
}

export function feeAmount(amount: number): number {
  return Math.floor((amount * env.PLATFORM_FEE_BPS) / 10_000);
}
