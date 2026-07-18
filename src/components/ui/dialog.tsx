"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Button, type buttonVariants } from "./button";
import type { VariantProps } from "class-variance-authority";

/**
 * Dialog primitives (spec §7.1). Wraps Radix Dialog — focus trap, scroll lock,
 * `Escape`/overlay-close, and ARIA for free. `ConfirmDialog` is the reusable
 * confirmation pattern gating destructive actions (delete org, remove/leave
 * member, revoke invite) so they are never one-click (spec §6.2 spirit).
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Content
        className={cn(
          "border-border bg-card text-card-foreground fixed top-1/2 left-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-6 shadow-lg",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="focus:ring-ring absolute top-4 right-4 rounded-sm opacity-60 transition-opacity hover:opacity-100 focus:ring-2 focus:outline-none">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg leading-none font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

/**
 * Confirmation dialog for a destructive action. `trigger` opens it; confirming
 * either submits a form or invokes `onConfirm`.
 *
 * Note the dialog content is portaled to `document.body`, so a confirm button of
 * `type="submit"` is *outside* the form element in the DOM. Pass `confirmForm`
 * with the form's `id` — the HTML `form` attribute associates a submit button
 * with a form anywhere in the document, which is what makes server-action forms
 * work from inside the portal.
 *
 * `body` renders between the description and the footer, for the case where
 * confirming needs INPUT rather than just assent — impersonation's mandatory
 * reason (spec 6.4) is the motivating one. Fields passed here need the same
 * `form={id}` attribute as the confirm button, and for exactly the same reason:
 * the portal puts them outside the form too. Keep the server-side validation as
 * the real gate — a portaled input's native validation bubble has nothing to
 * anchor to once the dialog closes.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmVariant = "destructive",
  onConfirm,
  confirmForm,
  disabled,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: VariantProps<typeof buttonVariants>["variant"];
  onConfirm?: () => void;
  confirmForm?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {body}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            variant={confirmVariant}
            type={confirmForm ? "submit" : "button"}
            form={confirmForm}
            disabled={disabled}
            onClick={() => {
              onConfirm?.();
              setOpen(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
