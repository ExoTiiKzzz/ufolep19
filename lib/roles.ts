/** Libellés français des rôles de compte. Le code manipule les identifiants anglais. */
export const roleLabels = {
  admin: "Administrateur",
  manager: "Responsable d'équipe",
  player: "Joueur",
} as const;

export type Role = keyof typeof roleLabels;
