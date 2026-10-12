"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { fetchRobinhood } from "@/lib/api";

export function useRobinhood() {
  const { address } = useAccount();
  return useQuery({
    queryKey: ["rh-status", address],
    queryFn: () => fetchRobinhood(address!),
    enabled: Boolean(address),
    refetchInterval: 15_000,
  });
}