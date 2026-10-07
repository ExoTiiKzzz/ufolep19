import { v } from "convex/values";

import { normalizeLicenseNumber, validateLicense } from "../lib/rules/license";
import { parisWallClock } from "../lib/rules/paris-time";
import { internalMutation } from "./_generated/server";

/**
 * Import de licenciés depuis l'export de la fédération (« Sortie complète Ufolep »).
 *
 * ```bash
 * npx convex run imports:licensees '{"rows":[…]}'
 * ```
 *
 * Fonction `internal` : lancée depuis la CLI, jamais exposée au client. Le CSV est lu hors de
 * Convex, et n'en arrive que ce que le modèle porte — club, nom, prénom, numéro et période de
 * licence. Adresse, téléphone, date de naissance restent dans l'export ; l'e-mail aussi,
 * puisqu'il créerait un compte et enverrait un message à chaque licencié.
 *
 * **Rejouable** : un numéro déjà connu rattache la ligne au joueur qui le porte, et une
 * période déjà enregistrée n'est pas réécrite. Un numéro inconnu crée une fiche — jamais de
 * rapprochement sur le nom, deux homonymes dans un club existent. Un club inconnu est créé,
 * sans salle : l'administrateur la renseigne ensuite.
 */
const row = v.object({
  clubName: v.string(),
  firstName: v.string(),
  lastName: v.string(),
  number: v.string(),
  /** Premier jour de validité, `AAAA-MM-JJ`, en heure de Paris. */
  validFrom: v.string(),
  /** Dernier jour de validité, `AAAA-MM-JJ` : couvert jusqu'au soir. */
  validUntil: v.string(),
});

function day(value: string, edge: "start" | "end"): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new Error(`Date attendue au format AAAA-MM-JJ, reçu « ${value} ».`);
  }
  const [, year, month, date] = match.map(Number);
  return edge === "start"
    ? parisWallClock(year, month, date, 0, 0, 0, 0)
    : parisWallClock(year, month, date, 23, 59, 59, 999);
}

export const licensees = internalMutation({
  args: { rows: v.array(row) },
  returns: v.object({
    clubsCreated: v.number(),
    playersCreated: v.number(),
    licensesAdded: v.number(),
    unchanged: v.number(),
    rejected: v.array(v.object({ number: v.string(), reason: v.string() })),
  }),
  handler: async (ctx, { rows }) => {
    const report = {
      clubsCreated: 0,
      playersCreated: 0,
      licensesAdded: 0,
      unchanged: 0,
      rejected: [] as { number: string; reason: string }[],
    };

    for (const line of rows) {
      const number = normalizeLicenseNumber(line.number);
      const clubName = line.clubName.trim();
      const firstName = line.firstName.trim();
      const lastName = line.lastName.trim();
      if (clubName === "" || firstName === "" || lastName === "") {
        report.rejected.push({ number, reason: "Club, nom ou prénom manquant." });
        continue;
      }
      const draft = {
        number,
        validFrom: day(line.validFrom, "start"),
        validUntil: day(line.validUntil, "end"),
      };

      const holder = await ctx.db
        .query("licenses")
        .withIndex("by_number", (q) => q.eq("number", number))
        .first();
      let playerId = holder?.playerId ?? null;

      if (playerId === null) {
        let club = await ctx.db
          .query("clubs")
          .withIndex("by_name", (q) => q.eq("name", clubName))
          .unique();
        if (club === null) {
          const clubId = await ctx.db.insert("clubs", { name: clubName, defaultVenue: "" });
          club = await ctx.db.get(clubId);
          report.clubsCreated++;
        }
        const invalid = validateLicense(draft, []);
        if (invalid !== null) {
          report.rejected.push({ number, reason: invalid });
          continue;
        }
        playerId = await ctx.db.insert("players", { clubId: club!._id, firstName, lastName });
        report.playersCreated++;
      }

      const others = await ctx.db
        .query("licenses")
        .withIndex("by_player", (q) => q.eq("playerId", playerId))
        .collect();
      if (
        others.some(
          (other) =>
            other.number === number &&
            other.validFrom === draft.validFrom &&
            other.validUntil === draft.validUntil,
        )
      ) {
        report.unchanged++;
        continue;
      }
      const invalid = validateLicense(draft, others);
      if (invalid !== null) {
        report.rejected.push({ number, reason: invalid });
        continue;
      }
      await ctx.db.insert("licenses", { playerId, ...draft });
      report.licensesAdded++;
    }

    return report;
  },
});
