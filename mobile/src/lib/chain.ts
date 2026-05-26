import { useQuery } from "@tanstack/react-query";
import { api } from "./api/api";

export interface ChainConfig {
  enabled: boolean;
  name: string;
  chainId: number;
  factory: string | null;
  explorer: string | null;
}

export function useChainConfig() {
  return useQuery({
    queryKey: ["chain-config"],
    queryFn: () => api.get<ChainConfig>("/api/chain"),
    staleTime: 60 * 60 * 1000,
  });
}

export function explorerTx(explorer: string | null | undefined, hash: string | null | undefined): string | null {
  if (!explorer || !hash) return null;
  return `${explorer.replace(/\/$/, "")}/tx/${hash}`;
}

export function explorerAddress(explorer: string | null | undefined, address: string | null | undefined): string | null {
  if (!explorer || !address) return null;
  return `${explorer.replace(/\/$/, "")}/address/${address}`;
}
