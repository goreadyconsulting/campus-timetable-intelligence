"use client";
import { DataProvider } from "@/components/data-context";
export function Providers({ children }: { children: React.ReactNode }) {
  return <DataProvider>{children}</DataProvider>;
}
