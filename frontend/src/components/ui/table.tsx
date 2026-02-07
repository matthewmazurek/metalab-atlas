"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/** Wrapper for table: white card, border, rounded corners. Use for list-style tables. */
function TableContainer({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-container"
      className={cn(
        "overflow-x-auto rounded-xl border border-border/60 bg-card shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom font-sans text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b bg-muted/10", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "bg-muted/50 border-t font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

interface TableRowProps extends React.ComponentProps<"tr"> {
  /** When set, applies subtle staggered fade-in animation (use for list-style tables). */
  rowIndex?: number;
}

function TableRow({ className, rowIndex, style, ...props }: TableRowProps) {
  const animate = rowIndex !== undefined;
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "hover:bg-muted/40 data-[state=selected]:bg-muted/70 data-[state=focused]:bg-brand/5 data-[state=focused]:outline-2 data-[state=focused]:outline data-[state=focused]:-outline-offset-2 data-[state=focused]:outline-brand/40 border-b transition-colors duration-150",
        animate && "animate-row-in",
        className
      )}
      style={
        animate
          ? { ...style, animationDelay: `${rowIndex * 25}ms` }
          : style
      }
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "font-sans text-muted-foreground/90 h-10 px-3 text-left align-middle text-xs font-semibold whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("font-sans text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableContainer,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
