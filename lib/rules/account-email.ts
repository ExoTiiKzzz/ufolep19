/**
 * Contenu du message annonçant la création d'un compte.
 *
 * Module pur : le texte se relit et se teste sans rien envoyer.
 */
export type AccountEmail = { subject: string; text: string; html: string };

/**
 * Pourquoi la personne reçoit un mot de passe : son compte vient d'être créé, ou un
 * administrateur vient de remplacer un mot de passe perdu.
 */
export type AccountEmailKind = "created" | "reset";

const INTRO: Record<AccountEmailKind, string> = {
  created:
    "Un compte vient de vous être créé sur la plateforme de volley de l'UFOLEP 19. " +
    "Il vous permet de consulter vos équipes, votre calendrier et vos résultats.",
  reset:
    "Un administrateur vient de vous attribuer un nouveau mot de passe sur la plateforme de " +
    "volley de l'UFOLEP 19. L'ancien ne fonctionne plus.",
};

const SUBJECT: Record<AccountEmailKind, string> = {
  created: "Votre compte pour les championnats de volley UFOLEP 19",
  reset: "Votre nouveau mot de passe pour les championnats de volley UFOLEP 19",
};

const CHANGE_IT =
  "Ce mot de passe est provisoire : une fois connecté, remplacez-le depuis « Mon compte ».";

/** Échappe le texte inséré dans la version HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function accountCreatedEmail({
  name,
  email,
  password,
  siteUrl,
  kind = "created",
}: {
  name: string;
  email: string;
  password: string;
  siteUrl: string;
  kind?: AccountEmailKind;
}): AccountEmail {
  const loginUrl = `${siteUrl.replace(/\/$/, "")}/connexion`;
  const greeting = name.trim() === "" ? "Bonjour," : `Bonjour ${name.trim()},`;

  const lines = [
    greeting,
    "",
    INTRO[kind],
    "",
    `Adresse de connexion : ${loginUrl}`,
    `Identifiant : ${email}`,
    `Mot de passe : ${password}`,
    "",
    CHANGE_IT,
    "",
    ...(kind === "created"
      ? [
          "Si vous n'attendiez pas ce message, vous pouvez l'ignorer : sans connexion, le compte reste inutilisé.",
          "",
        ]
      : []),
    "L'UFOLEP 19",
  ];

  return {
    subject: SUBJECT[kind],
    text: lines.join("\n"),
    html:
      `<p>${escapeHtml(greeting)}</p>` +
      `<p>${escapeHtml(INTRO[kind])}</p>` +
      "<ul>" +
      `<li>Adresse de connexion : <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></li>` +
      `<li>Identifiant : ${escapeHtml(email)}</li>` +
      `<li>Mot de passe : <strong>${escapeHtml(password)}</strong></li>` +
      "</ul>" +
      `<p>${escapeHtml(CHANGE_IT)}</p>` +
      (kind === "created"
        ? "<p>Si vous n'attendiez pas ce message, vous pouvez l'ignorer : sans connexion, le " +
          "compte reste inutilisé.</p>"
        : "") +
      "<p>L'UFOLEP 19</p>",
  };
}
