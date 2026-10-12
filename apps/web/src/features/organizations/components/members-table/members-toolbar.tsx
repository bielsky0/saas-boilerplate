"use client";

import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

/**
 * Search + rows-per-page toolbar (etap 4, faza 4). Layout ported from
 * AdminCN's `user-table-toolbar`; the template's `InputGroup` doesn't exist
 * in our `ui/`, so search is a plain `Input` with an icon.
 */
export function MembersToolbar({
  search,
  searchLabel,
  searchPlaceholder,
  rowsPerPage,
  rowsPerPageLabel,
  onSearch,
  onRowsPerPageChange,
}: {
  search: string;
  searchLabel: string;
  searchPlaceholder: string;
  rowsPerPage: number;
  rowsPerPageLabel: string;
  onSearch: (value: string) => void;
  onRowsPerPageChange: (value: number) => void;
}) {
  return (
    <div className="flex gap-4 p-6 max-sm:flex-col sm:items-center sm:justify-between">
      <div className="max-w-2xs relative w-full">
        <SearchIcon
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
        />
        <Input
          id="search-members"
          aria-label={searchLabel}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={searchPlaceholder}
          type="search"
          className="pl-9"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-between">
        <Select
          value={String(rowsPerPage)}
          onValueChange={(value) => onRowsPerPageChange(Number(value))}
        >
          <SelectTrigger className="w-fit whitespace-nowrap" aria-label={rowsPerPageLabel}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROWS_PER_PAGE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
