import { cn } from "@/lib/utils";

/**
 * Logo d'un club, ou ses initiales à défaut.
 *
 * Une image manquante ne doit pas laisser un trou dans la mise en page : les initiales
 * tiennent la même place.
 */
export function ClubLogo({
  name,
  logoUrl,
  size = 40,
  className,
}: {
  name: string;
  logoUrl: string | null;
  size?: number;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

  if (logoUrl === null) {
    return (
      <span
        aria-hidden
        className={cn(
          "bg-muted text-muted-foreground inline-flex shrink-0 items-center justify-center rounded-md text-xs font-semibold",
          className,
        )}
        style={{ width: size, height: size }}
      >
        {initials}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- les logos viennent du stockage
    // Convex, dont le domaine n'a pas à être déclaré à l'optimiseur d'images.
    <img
      src={logoUrl}
      alt={`Logo de ${name}`}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-md object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
