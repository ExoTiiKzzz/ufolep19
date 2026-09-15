"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dateInputValue, parisDayBounds } from "@/lib/format";
import { parisParts, parisWallClock } from "@/lib/rules/paris-time";

/**
 * Les trois champs d'une licence — numéro, début, fin — partagés par les formulaires de
 * création de licencié et par le renouvellement.
 *
 * Les dates sont préremplies sur la **saison sportive en cours** (1er septembre au 31 août),
 * qui est la validité de l'écrasante majorité des licences. C'est un défaut, pas une
 * contrainte : les deux champs restent librement modifiables.
 */
export function defaultSeasonBounds(now = Date.now()): { from: string; until: string } {
  const { year, month } = parisParts(now);
  const start = month >= 9 ? year : year - 1;
  return {
    from: dateInputValue(parisWallClock(start, 9, 1)),
    until: dateInputValue(parisWallClock(start + 1, 8, 31)),
  };
}

/**
 * Lit les trois champs d'un `FormData` et rend la licence, ou `null` si rien n'est saisi.
 *
 * Rend `"invalid"` quand le numéro est là mais pas les dates : mieux vaut une erreur
 * explicite qu'une fiche créée en silence sans droit de jouer.
 */
export function readLicenseFields(
  form: FormData,
  prefix = "",
): { number: string; validFrom: number; validUntil: number } | null | "invalid" {
  const number = String(form.get(`${prefix}licenseNumber`) ?? "").trim();
  const from = parisDayBounds(String(form.get(`${prefix}validFrom`) ?? ""), "start");
  const until = parisDayBounds(String(form.get(`${prefix}validUntil`) ?? ""), "end");
  if (number === "" && from === null && until === null) {
    return null;
  }
  if (number === "" || from === null || until === null) {
    return "invalid";
  }
  return { number, validFrom: from, validUntil: until };
}

export function LicenseFields({
  prefix = "",
  required = false,
  defaults = defaultSeasonBounds(),
}: {
  /** Préfixe des `name`, quand deux formulaires coexistent sur une page. */
  prefix?: string;
  required?: boolean;
  defaults?: { from: string; until: string };
}) {
  return (
    <>
      <div>
        <Label htmlFor={`${prefix}licenseNumber`}>Numéro de licence</Label>
        <Input
          id={`${prefix}licenseNumber`}
          name={`${prefix}licenseNumber`}
          className="mt-2"
          required={required}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}validFrom`}>Valide du</Label>
        <Input
          id={`${prefix}validFrom`}
          name={`${prefix}validFrom`}
          type="date"
          className="mt-2"
          required={required}
          defaultValue={defaults.from}
        />
      </div>
      <div>
        <Label htmlFor={`${prefix}validUntil`}>au</Label>
        <Input
          id={`${prefix}validUntil`}
          name={`${prefix}validUntil`}
          type="date"
          className="mt-2"
          required={required}
          defaultValue={defaults.until}
        />
      </div>
    </>
  );
}
