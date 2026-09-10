import { expect, test } from "vitest";

import { accountNotice } from "./account-notice";

const base = {
  email: "camille@club-a.fr",
  temporaryPassword: "ABCD-EFGH-JKMN-PQRS",
  linkedExisting: false,
  mail: null,
};

test("sans adresse, le message ne parle pas de compte", () => {
  expect(accountNotice("Licencié créé.", null)).toBe("Licencié créé.");
});

test("un compte existant est annoncé comme rattaché, sans mot de passe", () => {
  const notice = accountNotice("Licencié créé.", { ...base, linkedExisting: true });
  expect(notice).toContain("Rattaché au compte existant camille@club-a.fr");
  expect(notice).not.toContain(base.temporaryPassword);
});

test("message envoyé : le mot de passe n'est pas affiché", () => {
  const notice = accountNotice("Licencié créé.", {
    ...base,
    mail: { sent: true, error: null },
  });
  expect(notice).toContain("envoyés à camille@club-a.fr");
  expect(notice).not.toContain(base.temporaryPassword);
});

test("message non envoyé : le motif et le mot de passe sont donnés", () => {
  const notice = accountNotice("Licencié créé.", {
    ...base,
    mail: { sent: false, error: "Brevo a répondu 400 : Sender not verified" },
  });
  expect(notice).toContain("Sender not verified");
  expect(notice).toContain(base.temporaryPassword);
  expect(notice).toContain("il ne sera plus affiché");
});

test("un envoi raté sans motif reste compréhensible", () => {
  const notice = accountNotice("Licencié créé.", { ...base, mail: null });
  expect(notice).toContain("raison inconnue");
  expect(notice).toContain(base.temporaryPassword);
});

test("le début du message vient de l'appelant", () => {
  expect(accountNotice("Joueur ajouté à l'effectif.", null)).toBe(
    "Joueur ajouté à l'effectif.",
  );
});
