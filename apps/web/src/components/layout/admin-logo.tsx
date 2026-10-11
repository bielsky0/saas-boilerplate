import { site } from "@/lib/site";

/**
 * Sidebar brand mark (etap 4, faza 2). SVG adapted from AdminCN's logo;
 * wordmark is our product name from `lib/site.ts`, not the template's.
 */
export function AdminLogo({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <svg
        width="1em"
        height="1em"
        viewBox="0 0 328 329"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        className="[&_rect]:fill-sidebar [&_rect:first-child]:fill-primary text-[32px]"
      >
        <rect y="0.5" width="328" height="328" rx="164" fill="black" className="dark:fill-white" />
        <path
          d="M165.018 72.3008V132.771C165.018 152.653 148.9 168.771 129.018 168.771H70.2288"
          stroke="white"
          strokeWidth="20"
          className="dark:stroke-black"
        />
        <path
          d="M166.627 265.241L166.627 204.771C166.627 184.889 182.744 168.771 202.627 168.771L261.416 168.771"
          stroke="white"
          strokeWidth="20"
          className="dark:stroke-black"
        />
      </svg>
      <span className="flex flex-col items-start">
        <span className="text-nowrap text-lg font-semibold">{site.name}</span>
      </span>
    </span>
  );
}
