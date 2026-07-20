/**
 * Design-system primitives (spec §7.1 — headless, shadcn/ui-style components).
 *
 * Low-level, token-driven UI primitives so a theme change means editing tokens
 * (`src/app/globals.css`), not every component. Every primitive composes classes
 * through `cn()` and, where it has variants, `cva` — copy that shape when adding
 * a new primitive.
 */

export { Button, buttonVariants } from "./button";
export { Input } from "./input";
export { Textarea } from "./textarea";
export { Label, FormField, FormMessage } from "./field";
export { Badge, badgeVariants } from "./badge";
export { Alert, AlertTitle, AlertDescription, alertVariants } from "./alert";
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./card";
export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./table";
export { Select, SelectValue, SelectTrigger, SelectContent, SelectItem } from "./select";
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  ConfirmDialog,
} from "./dialog";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "./dropdown-menu";
export { Pagination, PaginationLink } from "./pagination";
export { Toaster, toast } from "./sonner";
