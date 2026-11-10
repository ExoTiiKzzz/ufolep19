import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";
import {
  BEFORE_WINDOW,
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

const AFTER_SLOT = SLOT_AT + 3_600_000;

/** Un match confirmé, horloge posée une heure après le créneau : il aurait dû se jouer. */
async function pastConfirmedMatch(t: ReturnType<typeof convexTest>) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(BEFORE_WINDOW));
  const s = await setupChampionship(t);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });
  vi.setSystemTime(new Date(AFTER_SLOT));
  return s;
}

test("un match annulé le jour même se signale reporté après l'heure, l'adversaire confirmant", async () => {
  const t = convexTest(schema, modules);
  const s = await pastConfirmedMatch(t);

  await t.withIdentity({ subject: s.awayManager }).mutation(api.negotiation.requestPostponement, {
    matchId: s.matchId,
    reason: "Gymnase fermé à notre arrivée.",
  });
  await t
    .withIdentity({ subject: s.homeManager })
    .mutation(api.negotiation.respondToPostponement, { matchId: s.matchId, accept: true });

  const match = await t.query(api.matches.get, { matchId: s.matchId });
  expect(match?.state).toBe("planned");
  expect(match?.slot).toBeUndefined();
  expect(match?.postponement).toEqual({ previousAt: SLOT_AT });
});

test("l'administrateur impose un report après l'heure du match", async () => {
  const t = convexTest(schema, modules);
  const s = await pastConfirmedMatch(t);

  await t.withIdentity({ subject: s.admin }).mutation(api.negotiation.imposePostponement, {
    matchId: s.matchId,
    reason: "Neige sur le plateau de Millevaches.",
  });

  const match = await t.query(api.matches.get, { matchId: s.matchId });
  expect(match?.state).toBe("planned");
  expect(match?.postponement).toEqual({ previousAt: SLOT_AT });
});

test("le bilan d'une équipe garde la trace du report une fois le match reprogrammé", async () => {
  const t = convexTest(schema, modules);
  const s = await pastConfirmedMatch(t);
  await t.withIdentity({ subject: s.admin }).mutation(api.negotiation.imposePostponement, {
    matchId: s.matchId,
    reason: "Neige.",
  });
  const newSlot = SLOT_AT + 14 * 86_400_000;
  await t.withIdentity({ subject: s.admin }).mutation(api.negotiation.fixSlot, {
    matchId: s.matchId,
    at: newSlot,
    venue: "Gymnase du Coiroux",
  });

  const [match] = await t.query(api.teams.matches, { teamId: s.homeTeamId });
  expect(match.state).toBe("confirmed");
  expect(match.slot?.at).toBe(newSlot);
  expect(match.postponement).toEqual({ previousAt: SLOT_AT });
});

test("un match jamais reporté n'en porte aucune mention, ni un report refusé", async () => {
  const t = convexTest(schema, modules);
  const s = await pastConfirmedMatch(t);
  expect((await t.query(api.matches.get, { matchId: s.matchId }))?.postponement).toBeUndefined();

  await t.withIdentity({ subject: s.awayManager }).mutation(api.negotiation.requestPostponement, {
    matchId: s.matchId,
    reason: "Effectif décimé.",
  });
  await t
    .withIdentity({ subject: s.homeManager })
    .mutation(api.negotiation.respondToPostponement, { matchId: s.matchId, accept: false });

  const match = await t.query(api.matches.get, { matchId: s.matchId });
  expect(match?.state).toBe("confirmed");
  expect(match?.postponement).toBeUndefined();
});

test("le calendrier public dit qu'un match est reporté, jamais pourquoi", async () => {
  const t = convexTest(schema, modules);
  const s = await pastConfirmedMatch(t);
  await t.withIdentity({ subject: s.admin }).mutation(api.negotiation.imposePostponement, {
    matchId: s.matchId,
    reason: "Motif interne au comité.",
  });

  const calendar = await t.query(api.matches.listByChampionship, {
    championshipId: s.championshipId,
  });
  expect(calendar[0].postponement).toEqual({ previousAt: SLOT_AT });
  expect(JSON.stringify(calendar)).not.toContain("Motif interne");
});

test("une feuille saisie pendant une demande de report la rend sans objet", async () => {
  const t = convexTest(schema, modules);
  const s = await pastConfirmedMatch(t);
  const rosters = await seedBothRosters(t, s);
  await t.withIdentity({ subject: s.awayManager }).mutation(api.negotiation.requestPostponement, {
    matchId: s.matchId,
    reason: "Nous pensions le match annulé.",
  });

  // Le match s'est finalement joué : le receveur saisit la feuille sans répondre.
  await t.withIdentity({ subject: s.homeManager }).mutation(api.sheets.submit, {
    matchId: s.matchId,
    sets: VALID_SETS,
    homeLineup: rosters.home.slice(0, 6),
    awayLineup: rosters.away.slice(0, 6),
  });

  const history = await t
    .withIdentity({ subject: s.homeManager })
    .query(api.negotiation.history, { matchId: s.matchId });
  expect(history.postponements[0].status).toBe("cancelled");
  const todo = await t.withIdentity({ subject: s.homeManager }).query(api.matches.myTodo, {});
  expect(todo.map((row) => row.action)).not.toContain("respondPostponement");
});

test("un forfait rend sans objet une demande de report en attente", async () => {
  const t = convexTest(schema, modules);
  const s = await pastConfirmedMatch(t);
  await t.withIdentity({ subject: s.homeManager }).mutation(api.negotiation.requestPostponement, {
    matchId: s.matchId,
    reason: "Gymnase fermé.",
  });

  await t.withIdentity({ subject: s.admin }).mutation(api.sheets.forfeit, {
    matchId: s.matchId,
    forfeitingTeamId: s.awayTeamId,
  });

  const history = await t
    .withIdentity({ subject: s.admin })
    .query(api.negotiation.history, { matchId: s.matchId });
  expect(history.postponements[0].status).toBe("cancelled");
});
