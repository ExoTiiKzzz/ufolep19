/**
 * Message affiché après la création d'une fiche de licencié.
 *
 * Le compte, l'envoi du message et le mot de passe provisoire se combinent en quatre cas.
 * Regroupés ici parce que trois écrans créent des licenciés — la page des clubs, la fiche
 * d'équipe et la page des licenciés — et qu'un mot de passe qui ne s'affiche qu'une fois ne
 * supporte pas d'être annoncé différemment selon l'écran.
 */
export type CreatedAccount = {
  email: string;
  temporaryPassword: string | null;
  linkedExisting: boolean;
  mail: { sent: boolean; error: string | null } | null;
};

/**
 * `done` décrit ce qui vient d'être fait — « Licencié créé. », « Joueur ajouté à
 * l'effectif. » — et le reste du message décrit le sort du compte.
 */
export function accountNotice(done: string, account: CreatedAccount | null): string {
  if (account === null) {
    return done;
  }
  if (account.linkedExisting) {
    return `${done} Rattaché au compte existant ${account.email}.`;
  }
  if (account.mail?.sent === true) {
    return `${done} Ses identifiants viennent de lui être envoyés à ${account.email}.`;
  }
  return (
    `${done} Compte créé pour ${account.email}, mais le message n'est pas parti ` +
    `(${account.mail?.error ?? "raison inconnue"}) : transmettez-lui son mot de passe ` +
    `provisoire ${account.temporaryPassword}, il ne sera plus affiché.`
  );
}
