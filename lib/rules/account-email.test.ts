import { expect, test } from "vitest";

import { accountCreatedEmail } from "./account-email";

const base = {
  name: "Camille Durand",
  email: "camille@club-a.fr",
  password: "ABCD-EFGH-JKMN-PQRS",
  siteUrl: "https://ufolep19.vercel.app",
};

test("le message porte l'identifiant, le mot de passe et le lien de connexion", () => {
  const mail = accountCreatedEmail(base);
  for (const part of [base.email, base.password, "https://ufolep19.vercel.app/connexion"]) {
    expect(mail.text).toContain(part);
    expect(mail.html).toContain(part);
  }
  expect(mail.subject).toMatch(/UFOLEP 19/);
});

test("une barre finale dans l'URL du site ne produit pas de double barre", () => {
  const mail = accountCreatedEmail({ ...base, siteUrl: "https://ufolep19.vercel.app/" });
  expect(mail.text).toContain("https://ufolep19.vercel.app/connexion");
  expect(mail.text).not.toContain("app//connexion");
});

test("un nom vide ne laisse pas un salut bancal", () => {
  const mail = accountCreatedEmail({ ...base, name: "   " });
  expect(mail.text.startsWith("Bonjour,")).toBe(true);
});

test("le HTML échappe ce qui vient des données", () => {
  const mail = accountCreatedEmail({ ...base, name: 'Camille <script>alert("x")</script>' });
  expect(mail.html).not.toContain("<script>");
  expect(mail.html).toContain("&lt;script&gt;");
});
