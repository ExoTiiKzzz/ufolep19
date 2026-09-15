import { convexTest, type TestConvex } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { parisWallClock } from "../lib/rules/paris-time";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  forceConfirmed,
  modules,
  seedBothRosters,
  setupChampionship,
  SLOT_AT,
  VALID_SETS,
} from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

/** Le créneau des tests tombe le 10 janvier 2026 à 20 h, heure de Paris. */
const DAY_BEFORE_MATCH = parisWallClock(2026, 1, 9, 23, 59, 59, 999);
const MATCH_DAY_END = parisWallClock(2026, 1, 10, 23, 59, 59, 999);

/** Remplace la licence d'un joueur, pour poser le cas à vérifier. */
async function setLicense(
  t: TestConvex<typeof schema>,
  playerId: Id<"players">,
  { number, validFrom, validUntil }: { number: string; validFrom: number; validUntil: number },
) {
  await t.run(async (ctx) => {
    for (const row of await ctx.db
      .query("licenses")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.insert("licenses", { playerId, number, validFrom, validUntil });
  });
}

/** Un match confirmé, prêt à recevoir sa feuille, avec les deux effectifs. */
async function playedMatch(t: TestConvex<typeof schema>) {
  const s = await setupChampionship(t);
  const rosters = await seedBothRosters(t, s);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));
  return { s, rosters };
}

const submit = (
  t: TestConvex<typeof schema>,
  s: { matchId: Id<"matches">; homeManager: string },
  home: Id<"players">[],
  away: Id<"players">[],
) =>
  t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: home,
    awayLineup: away,
  });

test("une licence expirée la veille du match interdit d'aligner le joueur", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);

  // « Valable jusqu'au 9 septembre : le 10 il ne doit plus pouvoir jouer », transposé au
  // créneau des tests — licence close la veille au soir du match.
  await setLicense(t, rosters.home[0], {
    number: "PERIMEE-1",
    validFrom: Date.UTC(2025, 6, 1),
    validUntil: DAY_BEFORE_MATCH,
  });

  await expect(submit(t, s, rosters.home.slice(0, 3), rosters.away.slice(0, 3))).rejects.toThrow(
    /licence de .* ne couvre pas la date du match/i,
  );

  // Les autres joueurs, eux, passent : c'est bien la licence qui bloque, pas la feuille.
  await expect(submit(t, s, rosters.home.slice(1, 4), rosters.away.slice(0, 3))).resolves.toBeDefined();
});

test("une licence qui couvre le jour même autorise l'alignement, même à la dernière heure", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);

  await setLicense(t, rosters.home[0], {
    number: "JUSTE-A-TEMPS",
    validFrom: Date.UTC(2025, 6, 1),
    validUntil: MATCH_DAY_END,
  });

  await expect(submit(t, s, rosters.home.slice(0, 3), rosters.away.slice(0, 3))).resolves.toBeDefined();
});

test("la validité se juge à la date du match, pas à celle de la saisie", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);

  await setLicense(t, rosters.home[0], {
    number: "EXPIREE-DEPUIS",
    validFrom: Date.UTC(2025, 6, 1),
    validUntil: MATCH_DAY_END,
  });

  // La feuille est transcrite un mois plus tard, la licence a expiré entre-temps. Le joueur
  // était régulièrement licencié le jour où il a joué : la feuille doit passer.
  vi.setSystemTime(new Date(Date.UTC(2026, 1, 10, 12, 0)));
  await expect(submit(t, s, rosters.home.slice(0, 3), rosters.away.slice(0, 3))).resolves.toBeDefined();
});

test("un joueur sans aucune licence est refusé, avec un message qui le dit", async () => {
  const t = convexTest(schema, modules);
  const { s, rosters } = await playedMatch(t);

  await t.run(async (ctx) => {
    for (const row of await ctx.db
      .query("licenses")
      .withIndex("by_player", (q) => q.eq("playerId", rosters.home[0]))
      .collect()) {
      await ctx.db.delete(row._id);
    }
  });

  await expect(submit(t, s, rosters.home.slice(0, 3), rosters.away.slice(0, 3))).rejects.toThrow(
    /n'a aucune licence/i,
  );
});

test("un renouvellement change le numéro et garde le précédent dans l'historique", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const { home } = await seedBothRosters(t, s);
  const playerId = home[0];
  const asManager = t.withIdentity({ subject: s.homeManager });

  await setLicense(t, playerId, {
    number: "ANCIEN-1",
    validFrom: parisWallClock(2025, 9, 1),
    validUntil: parisWallClock(2026, 8, 31, 23, 59, 59, 999),
  });
  await asManager.mutation(api.licenses.add, {
    playerId,
    number: "NOUVEAU-1",
    validFrom: parisWallClock(2026, 9, 1),
    validUntil: parisWallClock(2027, 8, 31, 23, 59, 59, 999),
  });

  const history = await asManager.query(api.licenses.listByPlayer, { playerId });
  expect(history.map((row) => row.number)).toEqual(["NOUVEAU-1", "ANCIEN-1"]);

  // La fiche montre la licence de la date du jour, pas la dernière saisie.
  vi.setSystemTime(new Date(parisWallClock(2026, 1, 15)));
  const fiche = await asManager.query(api.players.get, { playerId });
  expect(fiche?.license).toMatchObject({ number: "ANCIEN-1", isValid: true });
});

test("une reconduction sous le même numéro est acceptée", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const { home } = await seedBothRosters(t, s);
  const playerId = home[0];

  await setLicense(t, playerId, {
    number: "MEME-NUMERO",
    validFrom: parisWallClock(2025, 9, 1),
    validUntil: parisWallClock(2026, 8, 31, 23, 59, 59, 999),
  });
  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.licenses.add, {
      playerId,
      number: "MEME-NUMERO",
      validFrom: parisWallClock(2026, 9, 1),
      validUntil: parisWallClock(2027, 8, 31, 23, 59, 59, 999),
    }),
  ).resolves.toBeDefined();
});

test("une période qui chevauche une licence existante est refusée", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const { home } = await seedBothRosters(t, s);
  const playerId = home[0];

  await setLicense(t, playerId, {
    number: "EN-COURS",
    validFrom: parisWallClock(2025, 9, 1),
    validUntil: parisWallClock(2026, 8, 31, 23, 59, 59, 999),
  });
  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.licenses.add, {
      playerId,
      number: "AUTRE",
      validFrom: parisWallClock(2026, 6, 1),
      validUntil: parisWallClock(2027, 8, 31),
    }),
  ).rejects.toThrow(/chevauche/i);
});

test("un numéro déjà attribué à un autre licencié est refusé, en le nommant", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const { home } = await seedBothRosters(t, s);

  await setLicense(t, home[0], {
    number: "UNIQUE-1",
    validFrom: parisWallClock(2025, 9, 1),
    validUntil: parisWallClock(2026, 8, 31, 23, 59, 59, 999),
  });
  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.licenses.add, {
      playerId: home[1],
      number: "UNIQUE-1",
      validFrom: parisWallClock(2026, 9, 1),
      validUntil: parisWallClock(2027, 8, 31),
    }),
  ).rejects.toThrow(/Le numéro de licence UNIQUE-1 est déjà attribué à Joueuse1 Nom1\./);
});

test("un numéro alphanumérique ne se dédouble pas sur la casse", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const { home } = await seedBothRosters(t, s);
  const asManager = t.withIdentity({ subject: s.homeManager });

  await asManager.mutation(api.licenses.add, {
    playerId: home[0],
    number: "  ab-1234-cd  ",
    validFrom: parisWallClock(2026, 9, 1),
    validUntil: parisWallClock(2027, 8, 31),
  });

  // Rangé en majuscules, espaces rognés : un numéro porte des lettres, mais la casse n'y
  // distingue rien, et l'écran doit montrer partout la même chose.
  expect(
    (await asManager.query(api.licenses.listByPlayer, { playerId: home[0] })).map(
      (row) => row.number,
    ),
  ).toContain("AB-1234-CD");

  // La même carte, saisie autrement pour quelqu'un d'autre, est bien refusée. Sans
  // normalisation à l'écriture, l'égalité exacte de l'index `by_number` laisserait passer
  // le doublon et l'invariant « un numéro, un seul licencié » tomberait sans bruit.
  await expect(
    asManager.mutation(api.licenses.add, {
      playerId: home[1],
      number: "AB-1234-CD",
      validFrom: parisWallClock(2026, 9, 1),
      validUntil: parisWallClock(2027, 8, 31),
    }),
  ).rejects.toThrow(/déjà attribué à Joueuse1 Nom1/);
});

test("la gestion des licences est réservée aux responsables du club", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const { home } = await seedBothRosters(t, s);

  await expect(
    t.withIdentity({ subject: s.awayManager }).mutation(api.licenses.add, {
      playerId: home[0],
      number: "INTRUS-1",
      validFrom: parisWallClock(2026, 9, 1),
      validUntil: parisWallClock(2027, 8, 31),
    }),
  ).rejects.toThrow(/ne gérez aucune équipe de ce club/i);

  await expect(
    t.query(api.licenses.listByPlayer, { playerId: home[0] }),
  ).rejects.toThrow(/authentification requise/i);
});

test("l'effectif signale la validité à la date du match qu'on prépare", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const { home } = await seedBothRosters(t, s);

  await setLicense(t, home[0], {
    number: "PERIMEE-2",
    validFrom: Date.UTC(2025, 6, 1),
    validUntil: DAY_BEFORE_MATCH,
  });

  const roster = await t
    .withIdentity({ subject: s.homeManager })
    .query(api.roster.listByTeam, { teamId: s.homeTeamId, at: SLOT_AT });
  const flagged = roster.find((row) => row._id === home[0]);
  expect(flagged?.license).toMatchObject({ number: "PERIMEE-2", isValid: false });

  // La veille, la même licence est encore bonne.
  const earlier = await t
    .withIdentity({ subject: s.homeManager })
    .query(api.roster.listByTeam, { teamId: s.homeTeamId, at: DAY_BEFORE_MATCH - 3_600_000 });
  expect(earlier.find((row) => row._id === home[0])?.license.isValid).toBe(true);
});
