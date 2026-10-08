import { expect, test } from "vitest";

import { MIN_PASSWORD_LENGTH, passwordProblem, temporaryPassword } from "./password";

test("un mot de passe provisoire fait quatre groupes de quatre caractères lisibles", () => {
  const password = temporaryPassword();
  expect(password).toMatch(/^[A-HJKMNP-Z2-9]{4}(-[A-HJKMNP-Z2-9]{4}){3}$/);
});

test("deux mots de passe provisoires diffèrent", () => {
  expect(temporaryPassword()).not.toBe(temporaryPassword());
});

test("un mot de passe provisoire passe la règle de longueur", () => {
  expect(passwordProblem(temporaryPassword())).toBeNull();
});

test("un mot de passe trop court est refusé en disant pourquoi", () => {
  expect(passwordProblem("a".repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/au moins 8/);
  expect(passwordProblem("a".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
});
