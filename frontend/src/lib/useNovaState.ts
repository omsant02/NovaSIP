"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { fetchState } from "@/lib/api";

export function useNovaState() {
  const { address } = useAccount();
  return useQuery({
    queryKey: ["nova-state", address],
    queryFn: () => fetchState(address!),
    enabled: Boolean(address),
    refetchInterval: 15_000,
  });
}