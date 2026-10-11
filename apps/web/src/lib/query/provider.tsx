"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { ReactNode } from "react";

import { getQueryClient } from "./client";

/**
 * Provider TanStack Query (etap 4, faza 1). Montowany raz w root layoucie
 * obok `ThemeProvider` — widzą go też strony auth (faza 5) i cała strefa
 * `(app)`. Devtools tylko w development, żeby nie wyciekały do prod bundle.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      ) : null}
    </QueryClientProvider>
  );
}
