"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchPerformance } from "@/lib/api";

export function usePerformance() {
  return useQuery({
    queryKey: ["nova-performance"],
    queryFn: fetchPerformance,
    refetchInterval: 30_000,
  });
}