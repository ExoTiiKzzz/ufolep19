import { ConvexError } from "convex/values";

/**
 * Message lisible d'une erreur remontée par Convex.
 *
 * Une `ConvexError` levée par une mutation arrive au client enrobée : le message brut porte
 * le nom de la fonction, l'identifiant de requête et le fichier source, ce qui noie la
 * phrase destinée à l'utilisateur. La donnée utile est dans `.data` — c'est elle qu'on
 * affiche, et le reste reste dans la console pour le diagnostic.
 */
export function errorMessage(caught: unknown, fallback = "Action impossible."): string {
  if (caught instanceof ConvexError) {
    return typeof caught.data === "string" ? caught.data : fallback;
  }
  if (caught instanceof Error) {
    return caught.message;
  }
  return fallback;
}
