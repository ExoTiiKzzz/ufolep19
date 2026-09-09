import { accountCreatedEmail } from "../lib/rules/account-email";

/**
 * Envoi de messages par l'API HTTP de Brevo.
 *
 * Pas de SMTP : les actions Convex tournent dans un runtime JavaScript sans accès TCP brut,
 * seule une API HTTP est possible.
 *
 * Trois variables sur le déploiement Convex :
 *
 * - `BREVO_API_KEY` — clé d'API transactionnelle ;
 * - `MAIL_SENDER_EMAIL` — expéditeur, sur un domaine vérifié chez Brevo ;
 * - `MAIL_SENDER_NAME` — facultatif, « UFOLEP 19 — Volley » par défaut.
 *
 * `SITE_URL`, déjà posée par l'outil de configuration de Convex Auth, fournit le lien de
 * connexion.
 */
export type MailResult = { sent: boolean; error: string | null };

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

/**
 * Envoie un message, ou explique pourquoi il n'est pas parti.
 *
 * Ne lève jamais : l'envoi d'un message ne doit pas faire échouer la création d'un compte.
 * L'appelant remonte le résultat à l'écran, pour que le comité sache s'il doit transmettre le
 * mot de passe autrement.
 */
/**
 * Configuration d'envoi, ou la liste de ce qui manque.
 *
 * Tout est vérifié d'un coup : un message qui ne nomme qu'une variable sur trois fait
 * recommencer le diagnostic à chaque fois.
 */
function mailConfig():
  | { ok: true; apiKey: string; sender: string; senderName: string; siteUrl: string }
  | { ok: false; error: string } {
  const required = {
    BREVO_API_KEY: process.env.BREVO_API_KEY,
    MAIL_SENDER_EMAIL: process.env.MAIL_SENDER_EMAIL,
    SITE_URL: process.env.SITE_URL,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined || value === "")
    .map(([name]) => name);
  if (missing.length > 0) {
    return {
      ok: false,
      error:
        `Envoi impossible : ${missing.join(", ")} ` +
        `${missing.length > 1 ? "manquantes" : "manquante"} sur le déploiement Convex.`,
    };
  }
  return {
    ok: true,
    apiKey: required.BREVO_API_KEY as string,
    sender: required.MAIL_SENDER_EMAIL as string,
    senderName: process.env.MAIL_SENDER_NAME ?? "UFOLEP 19 — Volley",
    siteUrl: required.SITE_URL as string,
  };
}

/**
 * Envoie un message, ou explique pourquoi il n'est pas parti.
 *
 * Ne lève jamais : l'envoi d'un message ne doit pas faire échouer la création d'un compte.
 * L'appelant remonte le résultat à l'écran, pour que le comité sache s'il doit transmettre le
 * mot de passe autrement.
 */
async function post(
  config: { apiKey: string; sender: string; senderName: string },
  message: { to: string; toName: string; subject: string; text: string; html: string },
): Promise<MailResult> {
  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: config.sender, name: config.senderName },
        to: [{ email: message.to, name: message.toName }],
        subject: message.subject,
        textContent: message.text,
        htmlContent: message.html,
      }),
    });
    if (!response.ok) {
      // Le corps de la réponse dit précisément ce que Brevo reproche (clé, expéditeur non
      // vérifié, quota) : on le remonte tel quel plutôt qu'un « échec » opaque.
      const detail = (await response.text()).slice(0, 300);
      return { sent: false, error: `Brevo a répondu ${response.status} : ${detail}` };
    }
    return { sent: true, error: null };
  } catch (caught) {
    return {
      sent: false,
      error: caught instanceof Error ? caught.message : "Envoi impossible.",
    };
  }
}

/** Annonce à une personne la création de son compte, mot de passe compris. */
export async function sendAccountCreated({
  to,
  name,
  password,
}: {
  to: string;
  name: string;
  password: string;
}): Promise<MailResult> {
  const config = mailConfig();
  if (!config.ok) {
    return { sent: false, error: config.error };
  }
  const message = accountCreatedEmail({
    name,
    email: to,
    password,
    siteUrl: config.siteUrl,
  });
  return await post(config, {
    to,
    toName: name,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
