import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Variante native de `Select`, sans Radix : un `<select>` suffit pour les listes de ce
 * projet (clubs, équipes, rôles) et évite une dépendance de plus.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "border-input bg-background h-9 w-full rounded-md border px-3 text-sm outline-none",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
