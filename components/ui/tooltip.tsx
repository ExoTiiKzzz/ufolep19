import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Infobulle sans dépendance : affichée au survol et au focus clavier de son déclencheur.
 *
 * `align="end"` cale la bulle sur le bord droit du déclencheur : centrée, elle déborderait
 * d'un conteneur qui défile, comme la dernière colonne d'un tableau.
 *
 * Elle ne fait qu'illustrer : le déclencheur porte lui-même son nom accessible
 * (`aria-label`), la bulle est donc masquée aux lecteurs d'écran pour ne pas le lire deux fois.
 */
function Tooltip({
  label,
  children,
  side = "top",
  align = "center",
  className,
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "center" | "end";
  className?: string;
}) {
  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      {children}
      <span
        aria-hidden
        className={cn(
          "bg-foreground text-background pointer-events-none absolute z-50 rounded-md px-2 py-1 text-xs whitespace-nowrap opacity-0 shadow-sm transition-opacity",
          "group-focus-within/tooltip:opacity-100 group-hover/tooltip:opacity-100",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          align === "center" ? "left-1/2 -translate-x-1/2" : "right-0",
        )}
      >
        {label}
      </span>
    </span>
  );
}

export { Tooltip };
