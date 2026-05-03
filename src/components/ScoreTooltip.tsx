import { useState, useEffect, type ReactNode } from "react";
import { Popover as PopoverPrimitive, Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Tooltip adapté à chaque device :
 *   - Desktop (hover: hover) → Popover ancré au trigger, ouverture au survol
 *   - Mobile/tactile (hover: none) → Dialog centré avec backdrop, ouvert au tap
 *     (animation identique à la popup "Comment ça marche")
 */
export function ScoreTooltip({
  children,
  content,
  contentClassName = "",
}: {
  children: ReactNode;
  content: ReactNode;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isHoverCapable, setIsHoverCapable] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    setIsHoverCapable(mq.matches);
    const handler = () => setIsHoverCapable(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ────────── Mobile : Dialog centré ──────────
  if (!isHoverCapable) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger asChild>
          <span className="inline-block cursor-pointer">{children}</span>
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              "fixed inset-0 z-50 bg-black/50",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "duration-200"
            )}
          />
          <DialogPrimitive.Content
            onOpenAutoFocus={(e) => e.preventDefault()}
            className={cn(
              "fixed top-[50%] left-[50%] z-50 -translate-x-1/2 -translate-y-1/2",
              "bg-popover text-popover-foreground rounded-md border shadow-lg outline-none",
              "w-[calc(100%-2rem)] max-w-sm",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              "duration-200",
              contentClassName
            )}
          >
            {content}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  // ────────── Desktop : Popover ancré au trigger ──────────
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>
        <span
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="inline-block cursor-help"
        >
          {children}
        </span>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            "z-50 bg-popover text-popover-foreground rounded-md border shadow-md outline-none",
            "animate-in fade-in-0 zoom-in-95 duration-200",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            "data-[side=top]:slide-in-from-bottom-2 data-[side=bottom]:slide-in-from-top-2",
            "data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2",
            contentClassName
          )}
        >
          {content}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
