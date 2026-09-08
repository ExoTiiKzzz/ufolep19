import * as React from "react";

import { cn } from "@/lib/utils";

// Variante sans Radix : un `<label>` natif suffit ici, et évite une dépendance de plus.
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-sm leading-none font-medium select-none", className)}
      {...props}
    />
  );
}

export { Label };
