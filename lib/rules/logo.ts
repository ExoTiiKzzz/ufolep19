/**
 * Règles d'acceptation d'un logo de club.
 *
 * Module pur : la validation porte sur les métadonnées du fichier déposé, et se teste
 * directement — le harnais de test Convex n'enregistre pas de type MIME, alors que le vrai
 * stockage le tient de l'en-tête de l'envoi.
 */

/** Un logo s'affiche en vignette : il n'a aucune raison d'être lourd. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Types d'image acceptés.
 *
 * SVG volontairement exclu : un SVG peut embarquer du script, et un fichier déposé par un
 * utilisateur n'a pas à être servi tel quel.
 */
export const ACCEPTED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * Le motif de refus d'un fichier, ou `null` s'il est acceptable.
 *
 * Un type absent est refusé : sans type déclaré, rien ne dit que le fichier est une image.
 */
export function rejectLogo({
  contentType,
  size,
}: {
  contentType?: string;
  size: number;
}): string | null {
  if (contentType === undefined || !ACCEPTED_LOGO_TYPES.includes(contentType)) {
    return "Format non accepté : le logo doit être un PNG, un JPEG, un WebP ou un GIF.";
  }
  if (size > MAX_LOGO_BYTES) {
    return `Fichier trop lourd (${Math.round(size / 1024)} ko) : 2 Mo au maximum.`;
  }
  return null;
}
