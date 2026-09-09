import { describe, expect, test } from "vitest";

import { isPlausibleEmail, normalizeEmail } from "./email";

describe("normalisation", () => {
  test.each([
    ["  Camille.Durand@Club.FR ", "camille.durand@club.fr"],
    ["JOUEUR@EXEMPLE.FR", "joueur@exemple.fr"],
  ])("%s devient %s", (raw, expected) => {
    expect(normalizeEmail(raw)).toBe(expected);
  });

  test.each([["", null], ["   ", null], [undefined, null]] as const)(
    "une adresse vide devient null (%s)",
    (raw, expected) => {
      expect(normalizeEmail(raw)).toBe(expected);
    },
  );
});

describe("plausibilité", () => {
  test.each(["camille@club.fr", "c.durand+volley@sous.domaine.fr"])("%s est acceptée", (email) => {
    expect(isPlausibleEmail(email)).toBe(true);
  });

  test.each(["camille", "camille@club", "@club.fr", "camille@.fr", "a b@club.fr"])(
    "%s est refusée",
    (email) => {
      expect(isPlausibleEmail(email)).toBe(false);
    },
  );
});
