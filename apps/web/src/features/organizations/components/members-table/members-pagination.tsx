"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";

/**
 * Client-side pagination footer (etap 4, faza 4). Member lists are small, so
 * paging happens in memory (no URL, no navigation — navigation-free by design,
 * cf. the headless-shell one-transition limit). Previous/Next buttons, not
 * links: there is no page address to deep-link.
 */
export function MembersPagination({
  showingFrom,
  showingTo,
  total,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  showing,
}: {
  showingFrom: number;
  showingTo: number;
  total: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
  showing: (args: { from: number; to: number; total: number }) => string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-6 py-4 max-sm:flex-col md:max-lg:flex-col">
      <p className="text-muted-foreground whitespace-nowrap text-sm" aria-live="polite">
        {showing({ from: showingFrom, to: showingTo, total })}
      </p>
      <Pagination>
        <Button
          className="disabled:pointer-events-none disabled:opacity-50"
          variant="ghost"
          onClick={onPrevious}
          disabled={!canPrevious}
          aria-label={previousLabel}
        >
          <ChevronLeftIcon aria-hidden="true" />
          {previousLabel}
        </Button>
        <Button
          className="disabled:pointer-events-none disabled:opacity-50"
          variant="ghost"
          onClick={onNext}
          disabled={!canNext}
          aria-label={nextLabel}
        >
          {nextLabel}
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </Pagination>
    </div>
  );
}
