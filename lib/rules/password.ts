/**
 * Mots de passe délivrés par la plateforme.
 *
 * Tout compte créé depuis l'interface reçoit un mot de passe **généré**, jamais choisi par
 * l'administrateur : il n'a rien à retenir, et la personne le remplace depuis « Mon compte ».
 * Seule la commande d'amorçage prend un mot de passe en argument.
 */

/** Longueur minimale d'un mot de passe choisi par son titulaire. */
export const MIN_PASSWORD_LENGTH = 8;

/** Lettres et chiffres retenus : sans les glyphes qu'on confond en recopiant (0/O, 1/l/I). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * Mot de passe provisoire lisible : quatre groupes de quatre caractères, par exemple
 * `K7QM-3XPA-WN8D-R2TF`.
 */
export function temporaryPassword(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]);
  return [0, 4, 8, 12].map((start) => chars.slice(start, start + 4).join("")).join("-");
}

/** Motif de refus d'un nouveau mot de passe, ou `null` s'il convient. */
export function passwordProblem(password: string): string | null {
  return password.length < MIN_PASSWORD_LENGTH
    ? `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`
    : null;
}
