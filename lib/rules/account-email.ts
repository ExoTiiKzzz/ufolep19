/**
 * Contenu du message annonçant la création d'un compte.
 *
 * Module pur : le texte se relit et se teste sans rien envoyer.
 */
export type AccountEmail = { subject: string; text: string; html: string };

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
}: {
  name: string;
  email: string;
  password: string;
  siteUrl: string;
}): AccountEmail {
  const loginUrl = `${siteUrl.replace(/\/$/, "")}/connexion`;
  const greeting = name.trim() === "" ? "Bonjour," : `Bonjour ${name.trim()},`;

  const lines = [
    greeting,
    "",
    "Un compte vient de vous être créé sur la plateforme de volley de l'UFOLEP 19.",
    "Il vous permet de consulter vos équipes, votre calendrier et vos résultats.",
    "",
    `Adresse de connexion : ${loginUrl}`,
    `Identifiant : ${email}`,
    `Mot de passe : ${password}`,
    "",
    "Ce mot de passe vous est transmis tel quel : conservez ce message, il ne sera pas renvoyé.",
    "",
    "Si vous n'attendiez pas ce message, vous pouvez l'ignorer : sans connexion, le compte reste inutilisé.",
    "",
    "L'UFOLEP 19",
  ];

  return {
    subject: "Votre compte pour les championnats de volley UFOLEP 19",
    text: lines.join("\n"),
    html:
      `<p>${escapeHtml(greeting)}</p>` +
      "<p>Un compte vient de vous être créé sur la plateforme de volley de l'UFOLEP 19. " +
      "Il vous permet de consulter vos équipes, votre calendrier et vos résultats.</p>" +
      "<ul>" +
      `<li>Adresse de connexion : <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></li>` +
      `<li>Identifiant : ${escapeHtml(email)}</li>` +
      `<li>Mot de passe : <strong>${escapeHtml(password)}</strong></li>` +
      "</ul>" +
      "<p>Ce mot de passe vous est transmis tel quel : conservez ce message, il ne sera pas " +
      "renvoyé.</p>" +
      "<p>Si vous n'attendiez pas ce message, vous pouvez l'ignorer : sans connexion, le compte " +
      "reste inutilisé.</p>" +
      "<p>L'UFOLEP 19</p>",
  };
}
