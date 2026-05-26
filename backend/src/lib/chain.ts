import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  keccak256,
  toBytes,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "../env";
import { logger } from "./logger";
import { escrowFactoryAbi } from "./chain-abi";

// Tiny custodial relayer + read client. Disabled (no-op) unless every
// required CHAIN_* var is set AND CHAIN_ENABLED=true. Failures are logged
// but never bubble — the on-chain anchor is a best-effort audit trail, not
// the source of truth.

const enabled =
  env.CHAIN_ENABLED &&
  !!env.CHAIN_RPC_URL &&
  !!env.CHAIN_PRIVATE_KEY &&
  !!env.CHAIN_ESCROW_FACTORY &&
  env.CHAIN_ESCROW_FACTORY.startsWith("0x");

const chain = enabled
  ? defineChain({
      id: env.CHAIN_ID,
      name: env.CHAIN_NAME,
      nativeCurrency: { name: "Token", symbol: "TKN", decimals: 18 },
      rpcUrls: { default: { http: [env.CHAIN_RPC_URL] } },
      blockExplorers: env.CHAIN_EXPLORER_BASE_URL
        ? { default: { name: "explorer", url: env.CHAIN_EXPLORER_BASE_URL } }
        : undefined,
    })
  : null;

const account = enabled ? privateKeyToAccount(env.CHAIN_PRIVATE_KEY as Hex) : null;

const publicClient = chain ? createPublicClient({ chain, transport: http(env.CHAIN_RPC_URL) }) : null;
const walletClient = chain && account
  ? createWalletClient({ chain, account, transport: http(env.CHAIN_RPC_URL) })
  : null;

const FACTORY = env.CHAIN_ESCROW_FACTORY as Address;

export function isChainEnabled(): boolean {
  return !!enabled;
}

// Pseudonymous on-chain address for a Zawadi user id. Deterministic, never
// holds funds — just a label so the chain shows who agreed to what.
export function pseudonymForUser(userId: string): Address {
  const hash = keccak256(toBytes(`zawadi-user:${userId}`));
  // Last 20 bytes -> address
  return (`0x${hash.slice(-40)}`) as Address;
}

// 32-byte representation of a trade id (uuid string -> keccak256).
export function tradeIdToBytes32(tradeId: string): Hex {
  return keccak256(toBytes(`zawadi-trade:${tradeId}`));
}

// Convert an ISO currency code (e.g. "USD") into bytes3 left-padded.
export function currencyToBytes3(code: string): Hex {
  const ascii = (code || "USD").toUpperCase().padEnd(3, "\0").slice(0, 3);
  return toHex(new TextEncoder().encode(ascii)) as Hex;
}

export function txExplorerUrl(hash: Hex | string): string | null {
  if (!env.CHAIN_EXPLORER_BASE_URL) return null;
  return `${env.CHAIN_EXPLORER_BASE_URL.replace(/\/$/, "")}/tx/${hash}`;
}

async function write(fn: string, args: readonly unknown[]): Promise<Hex | null> {
  if (!enabled || !walletClient || !publicClient) return null;
  try {
    const { request } = await publicClient.simulateContract({
      address: FACTORY,
      abi: escrowFactoryAbi,
      functionName: fn as any,
      args: args as any,
      account: account!,
    });
    const hash = await walletClient.writeContract(request);
    logger.info("chain tx", { fn, hash });
    return hash;
  } catch (e) {
    logger.warn("chain tx failed", { fn, err: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export interface CreateAgreementOpts {
  tradeId: string;
  buyerUserId: string;
  sellerUserId: string;
  amount: number;
  currency: string;
  termsHash?: string | null;
}

export async function createAgreement(opts: CreateAgreementOpts): Promise<Hex | null> {
  const termsHash: Hex = opts.termsHash
    ? (opts.termsHash.startsWith("0x") ? (opts.termsHash as Hex) : (`0x${opts.termsHash}` as Hex))
    : (("0x" + "00".repeat(32)) as Hex);
  return write("create", [
    tradeIdToBytes32(opts.tradeId),
    pseudonymForUser(opts.buyerUserId),
    pseudonymForUser(opts.sellerUserId),
    BigInt(opts.amount),
    currencyToBytes3(opts.currency),
    termsHash,
  ]);
}

export async function signBuyer(tradeId: string): Promise<Hex | null> {
  return write("signBuyer", [tradeIdToBytes32(tradeId)]);
}
export async function signSeller(tradeId: string): Promise<Hex | null> {
  return write("signSeller", [tradeIdToBytes32(tradeId)]);
}
export async function markFunded(tradeId: string): Promise<Hex | null> {
  return write("markFunded", [tradeIdToBytes32(tradeId)]);
}
export async function markDelivered(tradeId: string): Promise<Hex | null> {
  return write("markDelivered", [tradeIdToBytes32(tradeId)]);
}
export async function markCompleted(tradeId: string): Promise<Hex | null> {
  return write("markCompleted", [tradeIdToBytes32(tradeId)]);
}
export async function markDisputed(tradeId: string): Promise<Hex | null> {
  return write("markDisputed", [tradeIdToBytes32(tradeId)]);
}
export async function markRefunded(tradeId: string): Promise<Hex | null> {
  return write("markRefunded", [tradeIdToBytes32(tradeId)]);
}
export async function markCancelled(tradeId: string): Promise<Hex | null> {
  return write("markCancelled", [tradeIdToBytes32(tradeId)]);
}
