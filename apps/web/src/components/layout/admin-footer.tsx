import Link from "next/link";

/**
 * Tenant-shell footer (etap 4, faza 2). Ported from AdminCN's `Footer`.
 *
 * The `shadcn/studio` attribution link STAYS — the template is MIT-licensed
 * and requires it. Everything else is unchanged.
 */
export function AdminFooter() {
  return (
    <footer>
      <div className="text-muted-foreground max-w-360 mx-auto flex size-full items-center justify-between gap-3 px-4 py-3 max-sm:flex-col sm:gap-6 sm:px-6">
        <p className="text-balance text-sm max-sm:text-center">
          {`©${new Date().getFullYear()}`}{" "}
          <Link
            href="https://shadcnstudio.com"
            target="_blank"
            className="text-primary hover:underline"
          >
            shadcn/studio
          </Link>
          , Made for better web design
        </p>
        <div className="flex items-center gap-5 max-sm:hidden">
          <Link
            href="https://shadcnstudio.com/license"
            target="_blank"
            className="text-muted-foreground hover:text-foreground text-sm transition duration-300"
          >
            License
          </Link>
          <Link
            href="https://shadcnstudio.com/templates/admin-dashboard"
            target="_blank"
            className="text-muted-foreground hover:text-foreground text-sm transition duration-300"
          >
            More Dashboards
          </Link>
          <Link
            href="https://shadcnstudio.com/docs/documentation-admin/getting-started"
            target="_blank"
            className="text-muted-foreground hover:text-foreground text-sm transition duration-300"
          >
            Documentation
          </Link>
          <Link
            href="https://shadcnstudio.com/support"
            target="_blank"
            className="text-muted-foreground hover:text-foreground text-sm transition duration-300"
          >
            Support
          </Link>
        </div>
      </div>
    </footer>
  );
}
