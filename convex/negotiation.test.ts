import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";

import { endOfDayBefore } from "../lib/rules/paris-time";
import { TACIT_DELAY_MS } from "../lib/rules/tacit";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  BEFORE_WINDOW,
  forceConfirmed,
  modules,
  seedAccount,
  setupChampionship,
  SLOT_AT,
  WINDOW_END,
} from "./test.setup";

afterEach(() => {
  vi.useRealTimers();
});

/** Pose l'horloge des tests, faux timers activés pour piloter les tâches programmées. */
function at(instant: number) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(instant));
}

const VENUE = "Gymnase du Coiroux";

test("parcours nominal : le receveur propose, le visiteur valide", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  const { tacitDeadline } = await t
    .withIdentity({ subject: s.homeManager })
    .mutation(api.negotiation.proposeSlot, {
      matchId: s.matchId,
      at: SLOT_AT,
      venue: VENUE,
    });
  expect(tacitDeadline).toBe(BEFORE_WINDOW + TACIT_DELAY_MS);
  expect((await t.query(api.matches.get, { matchId: s.matchId }))?.state).toBe("awaitingSlot");

  await t
    .withIdentity({ subject: s.awayManager })
    .mutation(api.negotiation.acceptSlot, { matchId: s.matchId });

  const match = await t.query(api.matches.get, { matchId: s.matchId });
  expect(match?.state).toBe("confirmed");
  expect(match?.slot).toEqual({ at: SLOT_AT, venue: VENUE });
});

test("le visiteur ne peut pas proposer de créneau", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await expect(
    t.withIdentity({ subject: s.awayManager }).mutation(api.negotiation.proposeSlot, {
      matchId: s.matchId,
      at: SLOT_AT,
      venue: VENUE,
    }),
  ).rejects.toThrow(/pas la main/i);
});

test("un refus renvoie le match en attente de proposition, et la proposition reste dans l'historique", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const asHome = t.withIdentity({ subject: s.homeManager });
  await asHome.mutation(api.negotiation.proposeSlot, {
    matchId: s.matchId,
    at: SLOT_AT,
    venue: VENUE,
  });

  await t
    .withIdentity({ subject: s.awayManager })
    .mutation(api.negotiation.rejectSlot, { matchId: s.matchId });

  expect((await t.query(api.matches.get, { matchId: s.matchId }))?.state).toBe("planned");

  // Nouvelle proposition possible, et les deux restent lisibles.
  await asHome.mutation(api.negotiation.proposeSlot, {
    matchId: s.matchId,
    at: SLOT_AT + 86_400_000,
    venue: VENUE,
  });
  const history = await asHome.query(api.negotiation.history, { matchId: s.matchId });
  expect(history.proposals.map((proposal) => proposal.status)).toEqual(["pending", "rejected"]);
});

test("un créneau hors de la fenêtre de la journée est refusé", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.negotiation.proposeSlot, {
      matchId: s.matchId,
      at: WINDOW_END + 86_400_000,
      venue: VENUE,
    }),
  ).rejects.toThrow(/fenêtre de dates/i);
});

test("un créneau déjà passé est refusé", async () => {
  at(SLOT_AT + 86_400_000);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.negotiation.proposeSlot, {
      matchId: s.matchId,
      at: SLOT_AT,
      venue: VENUE,
    }),
  ).rejects.toThrow(/déjà passé/i);
});

test("un responsable étranger au match est rejeté", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const stranger = await seedAccount(t, {
    email: "autre@club-c.fr",
    name: "Responsable Club C",
    role: "manager",
  });

  await expect(
    t.withIdentity({ subject: stranger }).mutation(api.negotiation.proposeSlot, {
      matchId: s.matchId,
      at: SLOT_AT,
      venue: VENUE,
    }),
  ).rejects.toThrow(/responsable d'aucune des deux équipes/i);
});

test("un compte joueur n'a aucun droit d'écriture sur un match", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  const player = await seedAccount(t, {
    email: "joueur@club-a.fr",
    name: "Joueur",
    role: "player",
  });

  await expect(
    t.withIdentity({ subject: player }).mutation(api.negotiation.proposeSlot, {
      matchId: s.matchId,
      at: SLOT_AT,
      venue: VENUE,
    }),
  ).rejects.toThrow(/responsable d'aucune des deux équipes/i);
});

test("un responsable qui gère les deux équipes ne valide pas sa propre proposition", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await t
    .withIdentity({ subject: s.admin })
    .mutation(api.teams.addManager, { teamId: s.awayTeamId, userId: s.homeManager });
  const asHome = t.withIdentity({ subject: s.homeManager });
  await asHome.mutation(api.negotiation.proposeSlot, {
    matchId: s.matchId,
    at: SLOT_AT,
    venue: VENUE,
  });

  await expect(
    asHome.mutation(api.negotiation.acceptSlot, { matchId: s.matchId }),
  ).rejects.toThrow(/votre propre proposition/i);

  // La validation revient alors à l'administrateur.
  await t
    .withIdentity({ subject: s.admin })
    .mutation(api.negotiation.acceptSlot, { matchId: s.matchId });
  expect((await t.query(api.matches.get, { matchId: s.matchId }))?.state).toBe("confirmed");
});

test("une proposition sans réponse est confirmée à l'échéance", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await t.withIdentity({ subject: s.homeManager }).mutation(api.negotiation.proposeSlot, {
    matchId: s.matchId,
    at: SLOT_AT,
    venue: VENUE,
  });

  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const match = await t.query(api.matches.get, { matchId: s.matchId });
  expect(match?.state).toBe("confirmed");
  expect(match?.slot).toEqual({ at: SLOT_AT, venue: VENUE });
  const history = await t
    .withIdentity({ subject: s.homeManager })
    .query(api.negotiation.history, { matchId: s.matchId });
  expect(history.proposals[0].status).toBe("tacit");
});

test("une réponse explicite avant l'échéance annule la confirmation tacite", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await t.withIdentity({ subject: s.homeManager }).mutation(api.negotiation.proposeSlot, {
    matchId: s.matchId,
    at: SLOT_AT,
    venue: VENUE,
  });

  await t
    .withIdentity({ subject: s.awayManager })
    .mutation(api.negotiation.rejectSlot, { matchId: s.matchId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  // Le refus tient : la tâche annulée n'a pas confirmé le créneau dans son dos.
  expect((await t.query(api.matches.get, { matchId: s.matchId }))?.state).toBe("planned");
});

test("l'échéance est plafonnée à la veille du créneau", async () => {
  // Proposition trois jours avant le match : 7 jours dépasseraient la date du match.
  at(SLOT_AT - 3 * 86_400_000);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  const { tacitDeadline } = await t
    .withIdentity({ subject: s.homeManager })
    .mutation(api.negotiation.proposeSlot, { matchId: s.matchId, at: SLOT_AT, venue: VENUE });

  expect(tacitDeadline).toBe(endOfDayBefore(SLOT_AT));
  expect(tacitDeadline as number).toBeLessThan(SLOT_AT);
});

test("aucune échéance quand le créneau laisse moins de 24 h pour réagir", async () => {
  at(SLOT_AT - 12 * 3_600_000);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  const { tacitDeadline } = await t
    .withIdentity({ subject: s.homeManager })
    .mutation(api.negotiation.proposeSlot, { matchId: s.matchId, at: SLOT_AT, venue: VENUE });
  expect(tacitDeadline).toBeNull();

  // Rien ne se déclenche tout seul : la validation explicite devient obligatoire.
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect((await t.query(api.matches.get, { matchId: s.matchId }))?.state).toBe("awaitingSlot");
});

test("la validation tacite ne s'applique jamais après la date du match", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await t.withIdentity({ subject: s.homeManager }).mutation(api.negotiation.proposeSlot, {
    matchId: s.matchId,
    at: SLOT_AT,
    venue: VENUE,
  });
  const proposalId = await t.run(async (ctx) => {
    const proposals = await ctx.db.query("slotProposals").collect();
    return proposals[0]._id;
  });

  // Deuxième barrière : on force la tâche alors que le match est passé.
  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));
  await t.mutation(internal.negotiation.applyTacitSlot, { matchId: s.matchId, proposalId });

  expect((await t.query(api.matches.get, { matchId: s.matchId }))?.state).toBe("awaitingSlot");
});

test("une tâche d'échéance dont l'annulation aurait échoué reste sans effet", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await t.withIdentity({ subject: s.homeManager }).mutation(api.negotiation.proposeSlot, {
    matchId: s.matchId,
    at: SLOT_AT,
    venue: VENUE,
  });
  const proposalId = await t.run(async (ctx) => {
    const proposals = await ctx.db.query("slotProposals").collect();
    return proposals[0]._id;
  });
  await t
    .withIdentity({ subject: s.awayManager })
    .mutation(api.negotiation.rejectSlot, { matchId: s.matchId });

  await t.mutation(internal.negotiation.applyTacitSlot, { matchId: s.matchId, proposalId });

  expect((await t.query(api.matches.get, { matchId: s.matchId }))?.state).toBe("planned");
});

test("un report demandé et accepté renvoie le match en négociation", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });

  await t.withIdentity({ subject: s.homeManager }).mutation(api.negotiation.requestPostponement, {
    matchId: s.matchId,
    reason: "Gymnase fermé pour dégât des eaux.",
  });
  await t
    .withIdentity({ subject: s.awayManager })
    .mutation(api.negotiation.respondToPostponement, { matchId: s.matchId, accept: true });

  const match = await t.query(api.matches.get, { matchId: s.matchId });
  expect(match?.state).toBe("planned");
  expect(match?.slot).toBeUndefined();
});

test("un report refusé laisse le créneau en place", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });
  await t.withIdentity({ subject: s.homeManager }).mutation(api.negotiation.requestPostponement, {
    matchId: s.matchId,
    reason: "Effectif décimé.",
  });

  await t
    .withIdentity({ subject: s.awayManager })
    .mutation(api.negotiation.respondToPostponement, { matchId: s.matchId, accept: false });

  const match = await t.query(api.matches.get, { matchId: s.matchId });
  expect(match?.state).toBe("confirmed");
  expect(match?.slot?.at).toBe(SLOT_AT);
  const history = await t
    .withIdentity({ subject: s.homeManager })
    .query(api.negotiation.history, { matchId: s.matchId });
  expect(history.postponements[0].status).toBe("rejected");
});

test("le demandeur ne peut pas accepter son propre report", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });
  const asHome = t.withIdentity({ subject: s.homeManager });
  await asHome.mutation(api.negotiation.requestPostponement, {
    matchId: s.matchId,
    reason: "Effectif décimé.",
  });

  await expect(
    asHome.mutation(api.negotiation.respondToPostponement, {
      matchId: s.matchId,
      accept: true,
    }),
  ).rejects.toThrow(/votre propre demande/i);
});

test("un motif est obligatoire pour demander un report", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });

  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.negotiation.requestPostponement, {
      matchId: s.matchId,
      reason: "   ",
    }),
  ).rejects.toThrow(/motif du report/i);
});

test("l'administrateur impose un report sans accord de l'adversaire", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });

  await t.withIdentity({ subject: s.admin }).mutation(api.negotiation.imposePostponement, {
    matchId: s.matchId,
    reason: "Épidémie de grippe dans le département.",
  });

  expect((await t.query(api.matches.get, { matchId: s.matchId }))?.state).toBe("planned");
});

test("un responsable ne peut pas imposer de report", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });

  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.negotiation.imposePostponement, {
      matchId: s.matchId,
      reason: "Ça m'arrange.",
    }),
  ).rejects.toThrow(/réservée aux administrateurs/i);
});

test("aucun report n'est possible après l'heure du match", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);
  await forceConfirmed(t, { matchId: s.matchId, proposedBy: s.homeManager });

  vi.setSystemTime(new Date(SLOT_AT + 3_600_000));

  await expect(
    t.withIdentity({ subject: s.homeManager }).mutation(api.negotiation.requestPostponement, {
      matchId: s.matchId,
      reason: "Trop tard.",
    }),
  ).rejects.toThrow(/heure du match est passée/i);
  await expect(
    t.withIdentity({ subject: s.admin }).mutation(api.negotiation.imposePostponement, {
      matchId: s.matchId,
      reason: "Trop tard aussi.",
    }),
  ).rejects.toThrow(/heure du match est passée/i);
});

test("le tableau de bord liste ce qui attend chaque responsable", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  // Au départ, c'est au receveur de proposer.
  const homeTodo = await t
    .withIdentity({ subject: s.homeManager })
    .query(api.matches.myTodo, {});
  expect(homeTodo.map((row) => row.action)).toEqual(["proposeSlot"]);

  await t.withIdentity({ subject: s.homeManager }).mutation(api.negotiation.proposeSlot, {
    matchId: s.matchId,
    at: SLOT_AT,
    venue: VENUE,
  });

  const awayTodo = await t
    .withIdentity({ subject: s.awayManager })
    .query(api.matches.myTodo, {});
  expect(awayTodo[0].action).toBe("respondSlot");
  expect(awayTodo[0].deadline).toBe(BEFORE_WINDOW + TACIT_DELAY_MS);

  // Le receveur, lui, n'a plus rien à faire : il attend.
  expect(
    (await t.withIdentity({ subject: s.homeManager }).query(api.matches.myTodo, {}))[0].action,
  ).toBe("waiting");
});

test("l'historique de négociation est réservé aux responsables du match", async () => {
  at(BEFORE_WINDOW);
  const t = convexTest(schema, modules);
  const s = await setupChampionship(t);

  await expect(
    t.query(api.negotiation.history, { matchId: s.matchId }),
  ).rejects.toThrow(/authentification requise/i);
});
