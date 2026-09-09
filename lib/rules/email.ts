/**
 * Normalisation et contrôle d'une adresse e-mail.
 *
 * Module pur : l'adresse d'un licencié sert de clé de rapprochement avec un compte, et deux
 * écritures différentes de la même adresse créeraient deux comptes.
 */

/** L'adresse en forme canonique (sans espaces, en minuscules), ou `null` si elle est vide. */
export function normalizeEmail(raw: string | undefined): string | null {
  const trimmed = (raw ?? "").trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}

/**
 * Contrôle volontairement sommaire : une adresse non vide, sans espace, avec une arobase
 * encadrée de texte et un point dans le domaine. Valider finement une adresse est illusoire ;
 * seul un envoi réel prouve qu'elle existe.
 */
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
