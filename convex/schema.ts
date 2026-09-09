import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Rôle d'un compte. Attribut **unique** : pas de cumul. Les droits d'un responsable
 * sur un match découlent de son rattachement d'équipe, jamais du seul rôle.
 */
export const role = v.union(v.literal("player"), v.literal("manager"), v.literal("admin"));

/** État d'un match. Voir le cycle de vie dans AGENTS.md. */
export const matchState = v.union(
  v.literal("planned"), // Planifié : pas de créneau proposé
  v.literal("awaitingSlot"), // En attente : proposition soumise au visiteur
  v.literal("confirmed"), // Confirmé : créneau ferme
  v.literal("awaitingSheet"), // À valider : feuille soumise au visiteur
  v.literal("disputed"), // Litige : feuille contestée, arbitrage administrateur
  v.literal("completed"), // Terminé : entre au classement
);

/** Créneau : date + heure (un instant) et lieu. */
export const slot = v.object({
  at: v.number(),
  venue: v.string(),
});

/** Résultat d'un match terminé, agrégé une fois pour toutes à la clôture. */
export const matchResult = v.object({
  winnerTeamId: v.id("teams"),
  homeSets: v.number(),
  awaySets: v.number(),
  homePoints: v.number(),
  awayPoints: v.number(),
});

export default defineSchema({
  ...authTables,

  // Compte : identité de connexion. Reprend la table `users` de Convex Auth, augmentée
  // du rôle, requis. Distinct de la fiche Joueur, qui vit sans compte.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role,
    // Rattachement facultatif à une fiche Joueur : un compte peut consulter « ses »
    // matchs, mais une fiche Joueur n'a pas besoin de compte.
    playerId: v.optional(v.id("players")),
  })
    // Index attendus par Convex Auth.
    .index("email", ["email"])
    .index("phone", ["phone"])
    // Garde-fou du dernier administrateur, et listes filtrées par rôle.
    .index("by_role", ["role"]),

  // Saison : cycle annuel de compétition (ex. « 2025-2026 »). Regroupe les championnats.
  // Une seule saison porte `isCurrent` à un instant donné.
  seasons: defineTable({
    label: v.string(),
    isCurrent: v.boolean(),
  })
    .index("by_label", ["label"])
    .index("by_current", ["isCurrent"]),

  // Club : structure locale. Traverse les saisons. `defaultVenue` préremplit le lieu des
  // créneaux proposés par ses équipes quand elles reçoivent.
  clubs: defineTable({
    name: v.string(),
    defaultVenue: v.string(),
    // Logo du club, stocké dans le File Storage de Convex. Facultatif.
    logoId: v.optional(v.id("_storage")),
  }).index("by_name", ["name"]),

  // Joueur : fiche d'un licencié, rattachée à un club. Traverse les saisons. Existe sans
  // compte utilisateur : c'est une donnée d'effectif, pas un utilisateur.
  players: defineTable({
    clubId: v.id("clubs"),
    firstName: v.string(),
    lastName: v.string(),
    licenseNumber: v.string(),
    // Facultatif. Renseigné, il permet de créer un compte de consultation rattaché à la
    // fiche. Donnée personnelle : jamais renvoyée par une query publique.
    email: v.optional(v.string()),
  })
    .index("by_club", ["clubId"])
    .index("by_license", ["licenseNumber"])
    .index("by_email", ["email"]),

  // Championnat : compétition d'une saison, regroupant N équipes engagées.
  championships: defineTable({
    seasonId: v.id("seasons"),
    name: v.string(),
  }).index("by_season", ["seasonId"]),

  // Équipe : appartient à un club et à UNE SEULE saison, engagée dans un championnat.
  // `seasonId` est dérivé du championnat à la création, jamais fourni par l'appelant.
  teams: defineTable({
    clubId: v.id("clubs"),
    seasonId: v.id("seasons"),
    championshipId: v.id("championships"),
    name: v.string(),
  })
    .index("by_championship", ["championshipId"])
    .index("by_season", ["seasonId"])
    .index("by_club_and_season", ["clubId", "seasonId"]),

  // Effectif : appartenance d'un joueur à une équipe pour la saison.
  rosterEntries: defineTable({
    teamId: v.id("teams"),
    playerId: v.id("players"),
  })
    .index("by_team", ["teamId"])
    .index("by_player", ["playerId"])
    .index("by_team_and_player", ["teamId", "playerId"]),

  // Rattachement d'un compte responsable à une équipe. Un compte peut en gérer plusieurs.
  teamManagers: defineTable({
    teamId: v.id("teams"),
    userId: v.id("users"),
  })
    .index("by_team", ["teamId"])
    .index("by_user", ["userId"])
    .index("by_team_and_user", ["teamId", "userId"]),

  // Journée : regroupement numéroté de matchs, borné par une fenêtre de dates. Le créneau
  // d'un match doit tomber dans cette fenêtre, qui fait office de date butoir.
  matchdays: defineTable({
    championshipId: v.id("championships"),
    number: v.number(),
    windowStart: v.number(),
    windowEnd: v.number(),
  })
    .index("by_championship", ["championshipId"])
    .index("by_championship_and_number", ["championshipId", "number"]),

  // Match : rencontre entre un receveur et un visiteur du même championnat.
  matches: defineTable({
    championshipId: v.id("championships"),
    matchdayId: v.id("matchdays"),
    homeTeamId: v.id("teams"),
    awayTeamId: v.id("teams"),
    state: matchState,
    // Créneau ferme, présent dès que l'état est `confirmed` ou au-delà.
    slot: v.optional(slot),
    // Résultat, présent dès que l'état est `completed`.
    result: v.optional(matchResult),
    // Équipe déclarée forfait, le cas échéant.
    forfeitAgainst: v.optional(v.id("teams")),
    // Tâche programmée qui appliquera la validation tacite en cours.
    tacitJobId: v.optional(v.id("_scheduled_functions")),
  })
    .index("by_championship", ["championshipId"])
    .index("by_matchday", ["matchdayId"])
    .index("by_home_team", ["homeTeamId"])
    .index("by_away_team", ["awayTeamId"])
    .index("by_state", ["state"])
    .index("by_championship_and_state", ["championshipId", "state"]),

  // Proposition de créneau, soumise par le receveur. L'historique est append-only :
  // une proposition refusée est conservée.
  slotProposals: defineTable({
    matchId: v.id("matches"),
    at: v.number(),
    venue: v.string(),
    proposedBy: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("tacit"),
      v.literal("rejected"),
      v.literal("cancelled"),
    ),
    // Échéance de validation tacite. Absente si le créneau est trop proche : la
    // validation explicite du visiteur devient alors obligatoire.
    deadline: v.optional(v.number()),
    respondedAt: v.optional(v.number()),
  }).index("by_match", ["matchId"]),

  // Demande de report d'un match confirmé.
  postponementRequests: defineTable({
    matchId: v.id("matches"),
    requestedBy: v.id("users"),
    reason: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("imposed"),
    ),
  }).index("by_match", ["matchId"]),

  // Feuille de match : score par set et compositions des deux équipes. Unique par match,
  // transcrite par le receveur, validée en bloc par le visiteur.
  matchSheets: defineTable({
    matchId: v.id("matches"),
    sets: v.array(v.object({ home: v.number(), away: v.number() })),
    submittedBy: v.id("users"),
    status: v.union(v.literal("pending"), v.literal("validated"), v.literal("disputed")),
    deadline: v.optional(v.number()),
    disputeReason: v.optional(v.string()),
    // Renseigné quand un administrateur arbitre ou corrige la feuille.
    settledBy: v.optional(v.id("users")),
  }).index("by_match", ["matchId"]),

  // Composition : un joueur aligné pour une équipe sur un match. `matchdayId` est
  // dénormalisé pour rendre indexable la détection des cumuls sur une même journée.
  lineupEntries: defineTable({
    matchId: v.id("matches"),
    matchdayId: v.id("matchdays"),
    teamId: v.id("teams"),
    playerId: v.id("players"),
  })
    .index("by_match", ["matchId"])
    .index("by_match_and_team", ["matchId", "teamId"])
    .index("by_matchday", ["matchdayId"])
    .index("by_player_and_matchday", ["playerId", "matchdayId"]),
});
