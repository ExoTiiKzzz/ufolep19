"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { Id } from "@/convex/_generated/dataModel";
import { formatLabels } from "@/lib/labels";
import { DEFAULT_QUOTA, type ReinforcementQuota } from "@/lib/rules/reinforcement";
import type { ChampionshipFormat } from "@/lib/rules/score";

export type ChampionshipSettings = {
  name: string;
  circuitId: Id<"circuits">;
  level: number;
  format: ChampionshipFormat;
  reinforcementQuota: ReinforcementQuota | null;
};

/**
 * Réglages d'un championnat : trois axes indépendants, et non des cases « coupe » ou
 * « féminin » qui les mêleraient.
 *
 * - le **circuit** décide de l'unicité de la feuille verte ;
 * - le **niveau** décide du sens des renforts (1 = le plus fort) ;
 * - le **format** décide des règles de score et de classement.
 *
 * Le quota de renforts est propre au mixte : il admet des joueurs venus d'un niveau plus
 * fort, en nombre limité et pour compléter seulement.
 *
 * Partagé par la création et la modification. Convex revalide tout : le formulaire ne fait
 * que préremplir et annoncer.
 */
export function ChampionshipSettingsForm({
  circuits,
  initial,
  submitLabel,
  onSubmit,
  idPrefix = "",
  formatLocked = false,
}: {
  circuits: { _id: Id<"circuits">; name: string }[];
  initial?: Partial<ChampionshipSettings>;
  submitLabel: string;
  onSubmit: (settings: ChampionshipSettings, form: HTMLFormElement) => Promise<void>;
  idPrefix?: string;
  /** Le format ne change plus une fois des journées créées : on le dit plutôt que d'échouer. */
  formatLocked?: boolean;
}) {
  const [withQuota, setWithQuota] = useState(
    initial?.reinforcementQuota !== undefined && initial.reinforcementQuota !== null,
  );
  const quota = initial?.reinforcementQuota ?? DEFAULT_QUOTA;
  const id = (name: string) => `${idPrefix}${name}`;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const element = event.currentTarget;
        const form = new FormData(element);
        await onSubmit(
          {
            name: String(form.get("name")),
            circuitId: String(form.get("circuitId")) as Id<"circuits">,
            level: Number(form.get("level")),
            format: String(form.get("format")) as ChampionshipFormat,
            reinforcementQuota: withQuota
              ? {
                  maxPlayers: Number(form.get("maxPlayers")),
                  completeTo: Number(form.get("completeTo")),
                }
              : null,
          },
          element,
        );
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Label htmlFor={id("name")}>Nom</Label>
          <Input
            id={id("name")}
            name="name"
            className="mt-2"
            required
            defaultValue={initial?.name}
            placeholder="D1, Mixte, Coupe de Corrèze…"
          />
        </div>
        <div className="min-w-40">
          <Label htmlFor={id("circuitId")}>Circuit</Label>
          <Select
            id={id("circuitId")}
            name="circuitId"
            className="mt-2"
            required
            defaultValue={initial?.circuitId ?? ""}
          >
            <option value="">Choisir…</option>
            {circuits.map((circuit) => (
              <option key={circuit._id} value={circuit._id}>
                {circuit.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={id("level")}>Niveau</Label>
          <Input
            id={id("level")}
            name="level"
            type="number"
            min={1}
            className="mt-2 w-24"
            required
            defaultValue={String(initial?.level ?? 1)}
          />
        </div>
        <div className="min-w-56">
          <Label htmlFor={id("format")}>Format</Label>
          <Select
            id={id("format")}
            name="format"
            className="mt-2"
            defaultValue={initial?.format ?? "standard"}
            disabled={formatLocked}
          >
            {(Object.keys(formatLabels) as ChampionshipFormat[]).map((format) => (
              <option key={format} value={format}>
                {formatLabels[format]}
              </option>
            ))}
          </Select>
          {/* Un champ désactivé n'est pas envoyé : on reporte sa valeur. */}
          {formatLocked ? <input type="hidden" name="format" value={initial?.format} /> : null}
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Le circuit regroupe les championnats où un licencié n&apos;a qu&apos;une feuille verte :
        D1, D2, D3 et mixte partagent le même ; la coupe et le féminin ont chacun le leur.
        Niveau 1 = le plus fort : un joueur qui monte d&apos;un niveau est un renfort, signalé
        au-delà de 3 matchs.
        {formatLocked ? " Le format ne se change plus : des journées existent." : ""}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={withQuota}
            onChange={(event) => setWithQuota(event.target.checked)}
          />
          Admet des renforts venus d&apos;un niveau plus fort (mixte)
        </label>
        {withQuota ? (
          <>
            <div>
              <Label htmlFor={id("maxPlayers")}>Au plus</Label>
              <Input
                id={id("maxPlayers")}
                name="maxPlayers"
                type="number"
                min={1}
                className="mt-2 w-20"
                defaultValue={String(quota.maxPlayers)}
              />
            </div>
            <div>
              <Label htmlFor={id("completeTo")}>pour compléter à</Label>
              <Input
                id={id("completeTo")}
                name="completeTo"
                type="number"
                min={1}
                max={12}
                className="mt-2 w-20"
                defaultValue={String(quota.completeTo)}
              />
            </div>
          </>
        ) : null}
      </div>

      <Button type="submit" className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
