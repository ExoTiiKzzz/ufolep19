import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { insertChampionship, modules, seedAccount, WINDOW_END, WINDOW_START } from "./test.setup";

type T = TestConvex<typeof schema>;

/**
 * Une coupe de 6 équipes : tableau de 8 places, 3 tours. Au tour 1, 2 places vides,
 * donc 2 exempts et 2 matchs.
 */
async function setupCup(t: T, teamCount = 6) {
  const admin = await seedAccount(t, { email: "comite@ufolep19.fr", name: "Comité", role: "admin" });
  const ids = await t.run(async (ctx) => {
    const seasonId = await ctx.db.insert("seasons", { label: "2026-2027", isCurrent: true });
    const championshipId = await insertChampionship(ctx, {
      seasonId,
      name: "Coupe de Corrèze",
      format: "tableau",
    });
    const clubId = await ctx.db.insert("clubs", { name: "Club", defaultVenue: "Gymnase" });
    const teams: Id<"teams">[] = [];
    for (let i = 1; i <= teamCount; i++) {
      teams.push(
        await ctx.db.insert("teams", { clubId, seasonId, championshipId, name: `Équipe ${i}` }),
      );
    }
    const tours: Id<"matchdays">[] = [];
    for (let number = 1; number <= 3; number++) {
      tours.push(
        await ctx.db.insert("matchdays", {
          championshipId,
          number,
          windowStart: WINDOW_START,
          windowEnd: WINDOW_END,
        }),
      );
    }
    return { seasonId, championshipId, clubId, teams, tours };
  });
  return { admin, ...ids, as: t.withIdentity({ subject: admin }) };
}

/** Termine un match en donnant la victoire à `winner`, sans passer par la feuille. */
async function finish(t: T, matchId: Id<"matches">, winner: Id<"teams">) {
  await t.run(async (ctx) => {
    const match = (await ctx.db.get(matchId))!;
    const homeWins = match.homeTeamId === winner;
    await ctx.db.patch(matchId, {
      state: "completed",
      result: {
        winnerTeamId: winner,
        homeSets: homeWins ? 3 : 0,
        awaySets: homeWins ? 0 : 3,
        homePoints: homeWins ? 75 : 0,
        awayPoints: homeWins ? 0 : 75,
      },
    });
  });
}

test("le plan du tour 1 annonce 2 exempts et 2 matchs pour 6 équipes", async () => {
  const t = convexTest(schema, modules);
  const cup = await setupCup(t);
  const plan = await cup.as.query(api.bracket.tourPlan, { matchdayId: cup.tours[0] });
  expect(plan).toMatchObject({ round: 1, rounds: 3, bracketSize: 8, teamCount: 6 });
  expect(plan.groups).toHaveLength(1);
  expect(plan.groups[0]).toMatchObject({
    label: "places 1 à 8",
    real: 6,
    byesRequired: 2,
    matchesRequired: 2,
  });
  expect(plan.groups[0].available).toHaveLength(6);
});

test("le nombre d'exempts et de matchs d'un groupe est imposé, le choix est libre", async () => {
  const t = convexTest(schema, modules);
  const { as, tours, teams } = await setupCup(t);
  await as.mutation(api.bracket.declareBye, { matchdayId: tours[0], teamId: teams[5] });
  await as.mutation(api.bracket.declareBye, { matchdayId: tours[0], teamId: teams[2] });
  await expect(
    as.mutation(api.bracket.declareBye, { matchdayId: tours[0], teamId: teams[0] }),
  ).rejects.toThrow(/a déjà ses 2 exempt/);

  await as.mutation(api.matches.create, {
    matchdayId: tours[0],
    homeTeamId: teams[0],
    awayTeamId: teams[1],
  });
  await as.mutation(api.matches.create, {
    matchdayId: tours[0],
    homeTeamId: teams[3],
    awayTeamId: teams[4],
  });
  const plan = await as.query(api.bracket.tourPlan, { matchdayId: tours[0] });
  expect(plan.groups[0].available).toHaveLength(0);
});

test("un groupe qui a tous ses matchs refuse le suivant, et rappelle les exempts manquants", async () => {
  const t = convexTest(schema, modules);
  const { as, tours, teams } = await setupCup(t);
  await as.mutation(api.matches.create, { matchdayId: tours[0], homeTeamId: teams[0], awayTeamId: teams[1] });
  await as.mutation(api.matches.create, { matchdayId: tours[0], homeTeamId: teams[2], awayTeamId: teams[3] });
  await expect(
    as.mutation(api.matches.create, { matchdayId: tours[0], homeTeamId: teams[4], awayTeamId: teams[5] }),
  ).rejects.toThrow(/a déjà ses 2 match\(s\) au tour 1 : il lui reste 2 exempt/);
});

test("une équipe ne s'engage qu'une fois par tour", async () => {
  const t = convexTest(schema, modules);
  const { as, tours, teams } = await setupCup(t);
  await as.mutation(api.bracket.declareBye, { matchdayId: tours[0], teamId: teams[0] });
  await expect(
    as.mutation(api.matches.create, { matchdayId: tours[0], homeTeamId: teams[0], awayTeamId: teams[1] }),
  ).rejects.toThrow(/Équipe 1 est déjà engagée au tour 1/);
});

/** Joue le tour 1 : exempts 5 et 6, Équipe 1 bat 2, Équipe 3 bat 4. */
async function playRoundOne(t: T, cup: Awaited<ReturnType<typeof setupCup>>) {
  const { as, tours, teams } = cup;
  await as.mutation(api.bracket.declareBye, { matchdayId: tours[0], teamId: teams[4] });
  await as.mutation(api.bracket.declareBye, { matchdayId: tours[0], teamId: teams[5] });
  const first = await as.mutation(api.matches.create, {
    matchdayId: tours[0],
    homeTeamId: teams[0],
    awayTeamId: teams[1],
  });
  const second = await as.mutation(api.matches.create, {
    matchdayId: tours[0],
    homeTeamId: teams[2],
    awayTeamId: teams[3],
  });
  return { first: first.matchId, second: second.matchId };
}

test("un match du tour 2 attend que le tour 1 des deux équipes soit terminé", async () => {
  const t = convexTest(schema, modules);
  const cup = await setupCup(t);
  const { first } = await playRoundOne(t, cup);
  await expect(
    cup.as.mutation(api.matches.create, {
      matchdayId: cup.tours[1],
      homeTeamId: cup.teams[0],
      awayTeamId: cup.teams[4],
    }),
  ).rejects.toThrow(/Le match du tour 1 de Équipe 1 n'est pas terminé/);
  await finish(t, first, cup.teams[0]);
  await expect(
    cup.as.mutation(api.matches.create, {
      matchdayId: cup.tours[1],
      homeTeamId: cup.teams[0],
      awayTeamId: cup.teams[4],
    }),
  ).resolves.toBeDefined();
});

test("deux équipes de groupes différents ne se rencontrent pas", async () => {
  const t = convexTest(schema, modules);
  const cup = await setupCup(t);
  const { first } = await playRoundOne(t, cup);
  await finish(t, first, cup.teams[0]);
  // Équipe 1 a gagné (places 1 à 4), Équipe 2 a perdu (places 5 à 8).
  await expect(
    cup.as.mutation(api.matches.create, {
      matchdayId: cup.tours[1],
      homeTeamId: cup.teams[0],
      awayTeamId: cup.teams[1],
    }),
  ).rejects.toThrow(/dispute les places 1 à 4, Équipe 2 les places 5 à 8/);
});

test("un tour hors du tableau est refusé", async () => {
  const t = convexTest(schema, modules);
  const cup = await setupCup(t);
  const fourth = await t.run(async (ctx) =>
    ctx.db.insert("matchdays", {
      championshipId: cup.championshipId,
      number: 4,
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
    }),
  );
  await expect(
    cup.as.mutation(api.bracket.declareBye, { matchdayId: fourth, teamId: cup.teams[0] }),
  ).rejects.toThrow(/se joue en 3 tours/);
});

test("le tableau se fige au premier engagement du tour 1", async () => {
  const t = convexTest(schema, modules);
  const cup = await setupCup(t);
  await cup.as.mutation(api.bracket.declareBye, { matchdayId: cup.tours[0], teamId: cup.teams[0] });
  await expect(
    cup.as.mutation(api.teams.create, {
      clubId: cup.clubId,
      championshipId: cup.championshipId,
      name: "Retardataire",
    }),
  ).rejects.toThrow(/tableau est figé/);
  await expect(cup.as.mutation(api.teams.remove, { teamId: cup.teams[3] })).rejects.toThrow(
    /tableau est figé/,
  );
});

test("le classement suit les parcours, jusqu'aux places de 1 à 6", async () => {
  const t = convexTest(schema, modules);
  const cup = await setupCup(t);
  const { as, tours, teams } = cup;
  const { first, second } = await playRoundOne(t, cup);
  await finish(t, first, teams[0]);
  await finish(t, second, teams[3]);

  const afterOne = await t.query(api.bracket.standings, { championshipId: cup.championshipId });
  expect(afterOne.rows.map((row) => `${row.team.name}: ${row.label}`)).toEqual([
    "Équipe 1: places 1 à 4",
    "Équipe 4: places 1 à 4",
    "Équipe 5: places 1 à 4",
    "Équipe 6: places 1 à 4",
    "Équipe 2: places 5 à 8",
    "Équipe 3: places 5 à 8",
  ]);

  // Tour 2. Places 1 à 4 : 4 équipes, aucun exempt. Places 5 à 8 : 2 équipes, 2 exempts.
  const plan = await as.query(api.bracket.tourPlan, { matchdayId: tours[1] });
  expect(plan.groups.map((group) => [group.label, group.byesRequired, group.matchesRequired])).toEqual([
    ["places 1 à 4", 0, 2],
    ["places 5 à 8", 2, 0],
  ]);
  const a = await as.mutation(api.matches.create, { matchdayId: tours[1], homeTeamId: teams[0], awayTeamId: teams[3] });
  const b = await as.mutation(api.matches.create, { matchdayId: tours[1], homeTeamId: teams[4], awayTeamId: teams[5] });
  await as.mutation(api.bracket.declareBye, { matchdayId: tours[1], teamId: teams[1] });
  await as.mutation(api.bracket.declareBye, { matchdayId: tours[1], teamId: teams[2] });
  await finish(t, a.matchId, teams[0]);
  await finish(t, b.matchId, teams[5]);

  // Tour 3 : 1-2 (Équipes 1 et 6), 3-4 (4 et 5), 5-6 (2 et 3), 7-8 vide.
  const c = await as.mutation(api.matches.create, { matchdayId: tours[2], homeTeamId: teams[0], awayTeamId: teams[5] });
  const d = await as.mutation(api.matches.create, { matchdayId: tours[2], homeTeamId: teams[3], awayTeamId: teams[4] });
  const e = await as.mutation(api.matches.create, { matchdayId: tours[2], homeTeamId: teams[1], awayTeamId: teams[2] });
  await finish(t, c.matchId, teams[5]);
  await finish(t, d.matchId, teams[3]);
  await finish(t, e.matchId, teams[2]);

  const final = await t.query(api.bracket.standings, { championshipId: cup.championshipId });
  expect(final.rows.map((row) => `${row.from} ${row.team.name} ${row.path.join("-")}`)).toEqual([
    "1 Équipe 6 bye-won-won",
    "2 Équipe 1 won-won-lost",
    "3 Équipe 4 won-lost-won",
    "4 Équipe 5 bye-lost-lost",
    "5 Équipe 3 lost-bye-won",
    "6 Équipe 2 lost-bye-lost",
  ]);
  expect(final.rows.every((row) => row.final)).toBe(true);
});

test("un litige ne fait avancer personne", async () => {
  const t = convexTest(schema, modules);
  const cup = await setupCup(t);
  const { first } = await playRoundOne(t, cup);
  await t.run(async (ctx) => ctx.db.patch(first, { state: "disputed" }));
  const standings = await t.query(api.bracket.standings, { championshipId: cup.championshipId });
  const one = standings.rows.find((row) => row.team.name === "Équipe 1")!;
  expect(one).toMatchObject({ label: "places 1 à 8", path: [] });
});

test("un vainqueur ne change plus une fois le tour suivant engagé", async () => {
  const t = convexTest(schema, modules);
  const cup = await setupCup(t);
  const { first } = await playRoundOne(t, cup);
  await t.run(async (ctx) =>
    ctx.db.insert("matchSheets", {
      matchId: first,
      sets: [
        { home: 25, away: 10 },
        { home: 25, away: 10 },
        { home: 25, away: 10 },
      ],
      submittedBy: cup.admin,
      status: "validated",
    }),
  );
  await finish(t, first, cup.teams[0]);
  await cup.as.mutation(api.matches.create, {
    matchdayId: cup.tours[1],
    homeTeamId: cup.teams[0],
    awayTeamId: cup.teams[4],
  });
  await expect(
    cup.as.mutation(api.sheets.correct, {
      matchId: first,
      sets: [
        { home: 10, away: 25 },
        { home: 10, away: 25 },
        { home: 10, away: 25 },
      ],
    }),
  ).rejects.toThrow(/déjà engagée au tour 2 sur ce résultat/);
});

test("une exemption s'annule, tant que l'équipe n'est pas engagée au tour suivant", async () => {
  const t = convexTest(schema, modules);
  const { as, tours, teams } = await setupCup(t);
  const five = await as.mutation(api.bracket.declareBye, { matchdayId: tours[0], teamId: teams[4] });
  const six = await as.mutation(api.bracket.declareBye, { matchdayId: tours[0], teamId: teams[5] });
  await as.mutation(api.bracket.cancelBye, { byeId: six });
  await as.mutation(api.bracket.declareBye, { matchdayId: tours[0], teamId: teams[5] });

  // Les deux exempts se retrouvent au tour 2, places 1 à 4.
  await as.mutation(api.matches.create, {
    matchdayId: tours[1],
    homeTeamId: teams[4],
    awayTeamId: teams[5],
  });
  await expect(as.mutation(api.bracket.cancelBye, { byeId: five })).rejects.toThrow(
    /Équipe 5 est déjà engagée au tour 2 sur cette exemption/,
  );
});

test("un groupe sans place vide n'a pas d'exempt", async () => {
  const t = convexTest(schema, modules);
  const { as, tours, teams } = await setupCup(t);
  await as.mutation(api.bracket.declareBye, { matchdayId: tours[0], teamId: teams[4] });
  // Places 1 à 4 au tour 2 : 2 exempts et 2 vainqueurs, groupe complet.
  await expect(
    as.mutation(api.bracket.declareBye, { matchdayId: tours[1], teamId: teams[4] }),
  ).rejects.toThrow(/aucune place vide/);
});

test("un tableau n'a pas de matchs retour", async () => {
  const t = convexTest(schema, modules);
  const cup = await setupCup(t);
  await cup.as.mutation(api.matches.create, {
    matchdayId: cup.tours[0],
    homeTeamId: cup.teams[0],
    awayTeamId: cup.teams[1],
  });
  await expect(
    cup.as.mutation(api.matches.mirrorMatchday, {
      sourceMatchdayId: cup.tours[0],
      targetMatchdayId: cup.tours[1],
    }),
  ).rejects.toThrow(/pas de matchs retour/);
});

test("seul l'administrateur déclare un exempt ou lit le plan", async () => {
  const t = convexTest(schema, modules);
  const cup = await setupCup(t);
  const manager = await seedAccount(t, { email: "resp@club.fr", name: "Resp", role: "manager" });
  const as = t.withIdentity({ subject: manager });
  await expect(
    as.mutation(api.bracket.declareBye, { matchdayId: cup.tours[0], teamId: cup.teams[0] }),
  ).rejects.toThrow(/réservée aux administrateurs/);
  await expect(as.query(api.bracket.tourPlan, { matchdayId: cup.tours[0] })).rejects.toThrow(
    /réservée aux administrateurs/,
  );
});
