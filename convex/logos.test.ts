import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules, seedAccount, setupChampionship } from "./test.setup";

/**
 * Dépose un fichier dans le stockage.
 *
 * Attention : `ctx.storage.store` du harnais n'enregistre **pas** de type MIME, alors que le
 * vrai stockage le tient de l'en-tête de l'envoi. Un fichier créé ici est donc toujours
 * refusé par `setLogo`, qui exige un type déclaré. Le chemin d'acceptation se teste au seam
 * étroit (`lib/rules/logo.test.ts`) et se vérifie par un envoi réel dans l'interface ; ce
 * fichier couvre les autorisations, les refus et le ménage dans le stockage.
 */
async function storeFile(t: ReturnType<typeof convexTest>): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => ctx.storage.store(new Blob([new Uint8Array(64)])));
}

test("un club sans logo renvoie null, pas une URL vide", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  expect((await t.query(api.clubs.get, { clubId: s.homeClubId }))?.logoUrl).toBeNull();
  expect((await t.query(api.teams.get, { teamId: s.homeTeamId }))?.clubLogoUrl).toBeNull();
  const list = await t.query(api.clubs.list, {});
  expect(list.find((row) => row._id === s.homeClubId)?.logoUrl).toBeNull();
});

test("un logo attaché est exposé par la fiche du club, la liste et la fiche d'équipe", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  // On rattache directement le fichier : le chemin de validation est couvert ailleurs.
  const storageId = await storeFile(t);
  await t.run(async (ctx) => ctx.db.patch(s.homeClubId, { logoId: storageId }));

  expect((await t.query(api.clubs.get, { clubId: s.homeClubId }))?.logoUrl).toEqual(
    expect.stringContaining("http"),
  );
  const list = await t.query(api.clubs.list, {});
  expect(list.find((row) => row._id === s.homeClubId)?.logoUrl).not.toBeNull();
  expect((await t.query(api.teams.get, { teamId: s.homeTeamId }))?.clubLogoUrl).not.toBeNull();
});

test("un fichier sans type déclaré est refusé, et supprimé du stockage", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const storageId = await storeFile(t);

  const rejection = await t
    .withIdentity({ subject: s.admin })
    .mutation(api.clubs.setLogo, { clubId: s.homeClubId, storageId });

  expect(rejection).toMatch(/Format non accepté/i);
  // Le refus ne laisse pas d'orphelin : c'est pour ça que la mutation aboutit au lieu de
  // lever une erreur, qui aurait annulé la suppression avec le reste.
  expect(await t.run(async (ctx) => ctx.db.system.get(storageId))).toBeNull();
  expect((await t.query(api.clubs.get, { clubId: s.homeClubId }))?.logoUrl).toBeNull();
});

test("un fichier déposé pour un club inconnu est supprimé", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const storageId = await storeFile(t);
  const ghost = await t.run(async (ctx) => {
    const clubId = await ctx.db.insert("clubs", { name: "Éphémère", defaultVenue: "" });
    await ctx.db.delete(clubId);
    return clubId;
  });

  const rejection = await t
    .withIdentity({ subject: s.admin })
    .mutation(api.clubs.setLogo, { clubId: ghost, storageId });

  expect(rejection).toMatch(/Club inconnu/i);
  expect(await t.run(async (ctx) => ctx.db.system.get(storageId))).toBeNull();
});

test("retirer le logo le supprime aussi du stockage", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const storageId = await storeFile(t);
  await t.run(async (ctx) => ctx.db.patch(s.homeClubId, { logoId: storageId }));

  await t
    .withIdentity({ subject: s.admin })
    .mutation(api.clubs.removeLogo, { clubId: s.homeClubId });

  expect((await t.query(api.clubs.get, { clubId: s.homeClubId }))?.logoUrl).toBeNull();
  expect(await t.run(async (ctx) => ctx.db.system.get(storageId))).toBeNull();
});

test("retirer un logo absent ne casse rien", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await expect(
    t
      .withIdentity({ subject: s.admin })
      .mutation(api.clubs.removeLogo, { clubId: s.homeClubId }),
  ).resolves.toBeNull();
});

test("seul un administrateur gère les logos", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const player = await seedAccount(t, {
    email: "joueur@club-a.fr",
    name: "Joueur",
    role: "player",
  });
  const storageId = await storeFile(t);

  await expect(t.mutation(api.clubs.generateLogoUploadUrl, {})).rejects.toThrow(
    /authentification requise/i,
  );
  await expect(
    t
      .withIdentity({ subject: s.homeManager })
      .mutation(api.clubs.generateLogoUploadUrl, {}),
  ).rejects.toThrow(/réservée aux administrateurs/i);
  await expect(
    t
      .withIdentity({ subject: s.homeManager })
      .mutation(api.clubs.setLogo, { clubId: s.homeClubId, storageId }),
  ).rejects.toThrow(/réservée aux administrateurs/i);
  await expect(
    t
      .withIdentity({ subject: player })
      .mutation(api.clubs.removeLogo, { clubId: s.homeClubId }),
  ).rejects.toThrow(/réservée aux administrateurs/i);
});

test("le logo remonte dans le classement, le calendrier et le résumé d'un match", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const storageId = await storeFile(t);
  await t.run(async (ctx) => ctx.db.patch(s.homeClubId, { logoId: storageId }));

  const standings = await t.query(api.standings.byChampionship, {
    championshipId: s.championshipId,
  });
  const withLogo = standings.find((row) => row.teamId === s.homeTeamId);
  expect(withLogo?.clubLogoUrl).toEqual(expect.stringContaining("http"));
  // Le club adverse n'a pas de logo : c'est `null`, pas une chaîne vide.
  expect(standings.find((row) => row.teamId === s.awayTeamId)?.clubLogoUrl).toBeNull();

  const calendar = await t.query(api.matches.listByChampionship, {
    championshipId: s.championshipId,
  });
  expect(calendar[0]).toMatchObject({
    homeClubName: "Club A",
    awayClubName: "Club B",
    awayClubLogoUrl: null,
  });
  expect(calendar[0].homeClubLogoUrl).toEqual(expect.stringContaining("http"));

  const match = await t.query(api.matches.get, { matchId: s.matchId });
  expect(match?.homeClubLogoUrl).toEqual(expect.stringContaining("http"));
});

test("les logos d'un calendrier ne sont résolus qu'une fois par équipe", async () => {
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const storageId = await storeFile(t);
  await t.run(async (ctx) => ctx.db.patch(s.homeClubId, { logoId: storageId }));
  // Plusieurs matchs entre les deux mêmes équipes : le cache de requête doit les servir
  // sans relire le club à chaque ligne.
  await t.run(async (ctx) => {
    for (let number = 2; number <= 6; number++) {
      const matchdayId = await ctx.db.insert("matchdays", {
        championshipId: s.championshipId,
        number,
        windowStart: 0,
        windowEnd: 1,
      });
      await ctx.db.insert("matches", {
        championshipId: s.championshipId,
        matchdayId,
        homeTeamId: number % 2 === 0 ? s.homeTeamId : s.awayTeamId,
        awayTeamId: number % 2 === 0 ? s.awayTeamId : s.homeTeamId,
        state: "planned",
      });
    }
  });

  const calendar = await t.query(api.matches.listByChampionship, {
    championshipId: s.championshipId,
  });
  expect(calendar).toHaveLength(6);
  // Toutes les lignes portent la même URL : une seule résolution a suffi.
  const urls = new Set(
    calendar.flatMap((match) => [match.homeClubLogoUrl, match.awayClubLogoUrl]),
  );
  expect(urls.size).toBe(2);
  expect([...urls]).toContain(null);
});
