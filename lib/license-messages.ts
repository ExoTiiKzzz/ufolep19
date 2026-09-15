/**
 * Message unique du formulaire de licence, partagé par les trois écrans de création.
 *
 * Une licence se saisit en bloc : un numéro sans dates ne dit pas jusqu'à quand il vaut, et
 * des dates sans numéro ne désignent rien. Le tout-ou-rien est donc explicite, plutôt que
 * silencieusement complété.
 */
export const LICENSE_FIELDS_ERROR =
  "Une licence demande un numéro et ses deux dates de validité. " +
  "Laissez les trois champs vides pour créer la fiche sans licence.";
