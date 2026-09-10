/**
 * Recherche dans une liste de licenciés.
 *
 * Module pur. Deux exigences :
 *
 * - **insensible à la casse et aux accents** : personne ne tape « Pénicaut » avec son accent
 *   dans un champ de recherche, et un nom introuvable donne l'impression que la fiche n'existe
 *   pas ;
 * - **par mots, et par préfixe** : chaque mot cherché doit commencer un mot de la fiche. Une
 *   recherche par sous-chaîne fabriquait des faux positifs — « club b » trouvait les licenciés
 *   du Club A, parce que le « b » se trouve dans « club ».
 */
export type SearchablePlayer = {
  firstName: string;
  lastName: string;
  licenseNumber: string;
  email?: string | null;
  /** Nom du club, pour qu'un administrateur puisse filtrer sur un club. */
  clubName?: string;
};

/** Minuscules, sans accents. */
export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Découpe en mots sur tout ce qui n'est pas alphanumérique.
 *
 * Les séparateurs comptent : `camille.penicaut@club-a.fr` donne
 * `camille penicaut club a fr`, ce qui rend l'adresse cherchable morceau par morceau.
 */
export function tokenize(value: string): string[] {
  return fold(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
}

/**
 * Vrai si le licencié correspond au terme cherché.
 *
 * Chaque mot du terme doit commencer un mot de la fiche, dans n'importe quel ordre : « dur cam »
 * trouve Camille Durand.
 */
export function matchesPlayer(player: SearchablePlayer, term: string): boolean {
  const needles = tokenize(term);
  if (needles.length === 0) {
    return true;
  }
  const haystack = tokenize(
    [
      player.firstName,
      player.lastName,
      player.licenseNumber,
      player.email ?? "",
      player.clubName ?? "",
    ].join(" "),
  );
  return needles.every((needle) => haystack.some((word) => word.startsWith(needle)));
}
