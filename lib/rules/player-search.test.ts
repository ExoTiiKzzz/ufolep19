import { describe, expect, test } from "vitest";

import { fold, matchesPlayer, tokenize } from "./player-search";

const camille = {
  firstName: "Camille",
  lastName: "Pénicaut",
  licenseNumber: "L0042",
  email: "camille.penicaut@club-a.fr",
  clubName: "VB Coiroux",
};

describe("normalisation", () => {
  test.each([
    ["Pénicaut", "penicaut"],
    ["DURAND", "durand"],
    ["Noé", "noe"],
  ])("%s devient %s", (raw, expected) => {
    expect(fold(raw)).toBe(expected);
  });

  test("l'adresse est découpée en mots sur ses séparateurs", () => {
    expect(tokenize("camille.penicaut@club-a.fr")).toEqual([
      "camille",
      "penicaut",
      "club",
      "a",
      "fr",
    ]);
  });
});

describe("correspondances", () => {
  test.each([
    ["le nom", "penicaut"],
    ["le nom avec son accent", "Pénicaut"],
    ["le prénom", "camille"],
    ["un fragment", "peni"],
    ["le numéro de licence", "L0042"],
    ["une casse quelconque", "PÉNICAUT"],
    ["l'adresse e-mail", "club-a.fr"],
    ["deux mots dans le désordre", "peni cam"],
    ["le nom du club", "coiroux"],
    ["un club et un nom ensemble", "coiroux peni"],
  ])("%s trouve la fiche", (_label, term) => {
    expect(matchesPlayer(camille, term)).toBe(true);
  });

  test("un terme vide ne filtre rien", () => {
    expect(matchesPlayer(camille, "   ")).toBe(true);
  });

  test.each(["durand", "L0043", "autre@club.fr"])("%s ne la trouve pas", (term) => {
    expect(matchesPlayer(camille, term)).toBe(false);
  });

  test("une lettre isolée ne correspond qu'à un mot qui commence par elle", () => {
    // Le piège d'une recherche par sous-chaîne : le « b » de « club b » se trouve dans
    // « club », et tous les licenciés remontaient, quel que soit leur club.
    const coiroux = { ...camille, clubName: "Club A" };
    expect(matchesPlayer(coiroux, "club b")).toBe(false);
    expect(matchesPlayer(coiroux, "club a")).toBe(true);
    expect(matchesPlayer({ ...camille, clubName: "Club B" }, "club b")).toBe(true);
  });

  test("un mot cherché doit commencer un mot de la fiche, pas s'y trouver n'importe où", () => {
    expect(matchesPlayer(camille, "peni")).toBe(true);
    expect(matchesPlayer(camille, "nicaut")).toBe(false);
  });

  test("une fiche sans adresse reste cherchable par son nom", () => {
    expect(matchesPlayer({ ...camille, email: null }, "penicaut")).toBe(true);
    expect(matchesPlayer({ ...camille, email: null }, "club-a.fr")).toBe(false);
  });
});
