import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

/** Ce que rendent `players.listByClub`, `roster.listByTeam` et consorts. */
export type LicenseStatus = {
  number: string | null;
  validFrom: number | null;
  validUntil: number | null;
  isValid: boolean;
};

/**
 * Numéro de licence et validité, en une ligne.
 *
 * Une licence périmée est **montrée** plutôt que masquée : « 1234, expirée le 31 août »
 * se corrige, un tiret laisse croire que le licencié n'en a jamais eu. Le mot « expirée »
 * accompagne la couleur, qui ne porte donc jamais seule.
 */
export function LicenseBadge({
  license,
  className,
}: {
  license: LicenseStatus;
  className?: string;
}) {
  if (license.number === null) {
    return (
      <Badge variant="destructive" className={className}>
        sans licence
      </Badge>
    );
  }
  return (
    <span className={className}>
      <span className="text-muted-foreground">{license.number}</span>{" "}
      {license.isValid ? (
        <Badge variant="muted">
          jusqu&apos;au {license.validUntil === null ? "?" : formatDate(license.validUntil)}
        </Badge>
      ) : (
        <Badge variant="destructive">
          expirée
          {license.validUntil === null ? "" : ` le ${formatDate(license.validUntil)}`}
        </Badge>
      )}
    </span>
  );
}
