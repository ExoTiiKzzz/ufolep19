/**
 * Règles de validité d'une licence.
 *
 * Module pur : aucune dépendance à Convex ni à React, pour que la combinatoire des
 * périodes soit testable directement.
 *
 * Une licence porte un **numéro** et une **période de validité**. Un joueur en accumule
 * plusieurs au fil des saisons : la liste est un historique, jamais réécrit. Le numéro
 * peut changer d'une licence à l'autre, c'est même le cas courant d'un renouvellement.
 *
 * Deux invariants tiennent tout le reste :
 *
 * - les périodes d'un même joueur ne **se chevauchent jamais**, sans quoi « la licence du
 *   10 septembre » n'aurait pas de réponse unique ;
 * - une période peut en revanche manquer — un licencié qui s'interrompt une saison puis
 *   revient a un **trou**, et le modèle doit pouvoir le dire.
 */
export type LicensePeriod = {
  validFrom: number;
  /** Dernier instant de validité : la fin de la journée, pas son début. */
  validUntil: number;
};

export type LicenseDraft = LicensePeriod & { number: string };

/** Vrai si la licence couvre l'instant donné, bornes comprises. */
export function coversInstant(license: LicensePeriod, at: number): boolean {
  return license.validFrom <= at && at <= license.validUntil;
}

/** Vrai si deux périodes se recouvrent, ne serait-ce que d'un instant. */
export function periodsOverlap(a: LicensePeriod, b: LicensePeriod): boolean {
  return a.validFrom <= b.validUntil && b.validFrom <= a.validUntil;
}

/**
 * La licence qui couvre l'instant donné, ou `null`.
 *
 * C'est **la** question du modèle : un joueur peut-il être aligné sur ce match ? Elle se
 * pose à la date du match, jamais à la date de saisie — une feuille transcrite trois jours
 * plus tard ne doit pas rejeter un joueur régulièrement licencié le jour où il a joué.
 */
export function licenseCovering<T extends LicensePeriod>(licenses: T[], at: number): T | null {
  return licenses.find((license) => coversInstant(license, at)) ?? null;
}

/**
 * La licence la plus récente, valide ou non.
 *
 * Sert d'affichage par défaut : sur une fiche, mieux vaut montrer « licence 1234, expirée
 * le 31 août » qu'un blanc qui laisse croire que le licencié n'en a jamais eu.
 */
export function latestLicense<T extends LicensePeriod>(licenses: T[]): T | null {
  return licenses.reduce<T | null>(
    (best, license) => (best === null || license.validUntil > best.validUntil ? license : best),
    null,
  );
}

/** Numéro de licence normalisé : espaces rognés, casse d'origine conservée. */
export function normalizeLicenseNumber(value: string): string {
  return value.trim();
}

/**
 * Valide une licence à enregistrer, `others` étant les **autres** licences du joueur — la
 * licence en cours de correction en est donc exclue, sinon elle se chevaucherait elle-même.
 *
 * Rend le message d'erreur, ou `null` si tout va bien.
 */
export function validateLicense(draft: LicenseDraft, others: LicensePeriod[]): string | null {
  if (normalizeLicenseNumber(draft.number) === "") {
    return "Le numéro de licence est obligatoire.";
  }
  if (!Number.isFinite(draft.validFrom) || !Number.isFinite(draft.validUntil)) {
    return "Les dates de validité sont obligatoires.";
  }
  if (draft.validUntil < draft.validFrom) {
    return "La fin de validité ne peut pas précéder son début.";
  }
  if (others.some((other) => periodsOverlap(draft, other))) {
    return (
      "Cette période chevauche une licence déjà enregistrée pour ce joueur. " +
      "Corrigez d'abord la fin de validité de la précédente."
    );
  }
  return null;
}
