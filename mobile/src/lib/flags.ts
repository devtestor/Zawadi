import { useQuery } from "@tanstack/react-query";
import { api } from "./api/api";

export function useFlags() {
  return useQuery({
    queryKey: ["flags"],
    queryFn: () => api.get<Record<string, boolean>>("/api/flags"),
    staleTime: 60_000,
  });
}

export function useFlag(key: string): boolean {
  const { data } = useFlags();
  return !!data?.[key];
}
