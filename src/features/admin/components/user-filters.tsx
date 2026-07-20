import { Button, Input, Label } from "@/components/ui";
import { USER_STATUSES, type UserListQuery } from "../schema";

/**
 * User list filters (spec 6.2 — search by email, registration date, status).
 *
 * A plain GET form with zero client JavaScript. The filter state lives in the URL,
 * so it is refresh-safe, shareable, back-button-correct, and survives with JS off
 * — the same principle as deriving the active academy from the request host rather than
 * hidden session state (spec 3.5).
 *
 * The status control is a NATIVE <select>, not the Radix `Select` primitive:
 * `Select` is a client component whose value only reaches a GET form through
 * hidden-input bubbling. That is a client boundary and a subtle dependency to buy
 * a prettier dropdown on a support tool.
 */
export function UserFilters({ query }: { query: UserListQuery }) {
  return (
    <form method="GET" action="/admin/users" className="flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1">
        <Label htmlFor="admin-q">Search</Label>
        <Input
          id="admin-q"
          name="q"
          type="search"
          defaultValue={query.q}
          placeholder="Email or name"
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="admin-status">Status</Label>
        <select
          id="admin-status"
          name="status"
          defaultValue={query.status}
          className="border-input bg-background ring-offset-background focus-visible:ring-ring mt-1.5 h-9 rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {USER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status === "all" ? "All statuses" : status}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="admin-from">Registered from</Label>
        <Input
          id="admin-from"
          name="from"
          type="date"
          defaultValue={query.from}
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="admin-to">to</Label>
        <Input id="admin-to" name="to" type="date" defaultValue={query.to} className="mt-1.5" />
      </div>

      <Button type="submit" variant="secondary">
        Filter
      </Button>
    </form>
  );
}
