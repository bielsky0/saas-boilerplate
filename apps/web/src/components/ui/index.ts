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
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "./dropdown-menu";
export { Pagination, PaginationLink } from "./pagination";
export { Toaster, toast } from "./sonner";
export { Avatar, AvatarImage, AvatarFallback } from "./avatar";
export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
} from "./progress";
export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./breadcrumb";
export { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./collapsible";
export { Separator } from "./separator";
export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "./sheet";
export { Skeleton } from "./skeleton";
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./tooltip";
export {
  SidebarProvider,
  Sidebar,
  SidebarInset,
  SidebarTrigger,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "./sidebar";
