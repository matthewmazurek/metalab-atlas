/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border font-sans text-xs font-medium w-fit whitespace-nowrap shrink-0 gap-1 [&>svg]:size-3 [&>svg]:pointer-events-none transition-colors overflow-hidden px-2.5 py-0.5",
  {
    variants: {
      variant: {
        default:
          "border-primary/25 bg-primary/8 text-foreground [a&]:hover:bg-primary/12",
        secondary:
          "border-border/60 bg-muted/70 text-muted-foreground [a&]:hover:bg-muted [a&]:hover:text-foreground",
        info:
          "border-status-running/50 bg-status-running/15 text-status-running dark:border-status-running/40 dark:bg-status-running/20 dark:text-status-running",
        success:
          "border-status-success/50 bg-status-success/15 text-status-success dark:border-status-success/40 dark:bg-status-success/20 dark:text-status-success",
        warning:
          "border-status-warning/50 bg-status-warning/15 text-status-warning dark:border-status-warning/40 dark:bg-status-warning/20 dark:text-status-warning",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive [a&]:hover:bg-destructive/15 dark:border-destructive/40 dark:bg-destructive/20 dark:text-destructive",
        outline:
          "border-border bg-transparent text-muted-foreground [a&]:hover:bg-muted/50 [a&]:hover:text-foreground",
        ghost:
          "border-transparent bg-transparent text-muted-foreground [a&]:hover:bg-muted/50 [a&]:hover:text-foreground",
        link:
          "border-transparent bg-transparent text-primary [a&]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
