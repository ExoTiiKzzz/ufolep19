import { describe, expect, test } from "vitest";

import {
  coversInstant,
  latestLicense,
  licenseCovering,
  normalizeLicenseNumber,
  periodsOverlap,
  validateLicense,
  type LicensePeriod,
} from "./license";
import { parisWallClock } from "./paris-time";

/** Début de journée parisienne, pour écrire les cas en dates lisibles. */
const day = (year: number, month: number, date: number, hour = 0) =>
  parisWallClock(year, month, date, hour);

/** Une licence « du 1er septembre au 9 septembre 2026 inclus ». */
const SEPT_9 = {
  validFrom: day(2026, 9, 1),
  validUntil: parisWallClock(2026, 9, 9, 23, 59, 59, 999),
};

describe("couverture d'une date", () => {
  test("le dernier jour de validité est couvert, même tard le soir", () => {
    expect(coversInstant(SEPT_9, day(2026, 9, 9, 22))).toBe(true);
  });

  test("le lendemain ne l'est plus : c'est la règle demandée", () => {
    expect(coversInstant(SEPT_9, day(2026, 9, 10))).toBe(false);
    expect(coversInstant(SEPT_9, day(2026, 9, 10, 20))).toBe(false);
  });

  test("le premier jour est couvert, la veille non", () => {
    expect(coversInstant(SEPT_9, day(2026, 9, 1))).toBe(true);
    expect(coversInstant(SEPT_9, day(2026, 8, 31, 23))).toBe(false);
  });
});

describe("licence couvrant un instant", () => {
  const licenses: (LicensePeriod & { number: string })[] = [
    {
      number: "A-1",
      validFrom: day(2025, 9, 1),
      validUntil: parisWallClock(2026, 8, 31, 23, 59, 59, 999),
    },
    {
      number: "A-2",
      validFrom: day(2026, 9, 1),
      validUntil: parisWallClock(2027, 8, 31, 23, 59, 59, 999),
    },
  ];

  test("désigne la licence de la saison, pas la plus récente", () => {
    expect(licenseCovering(licenses, day(2026, 1, 15))?.number).toBe("A-1");
    expect(licenseCovering(licenses, day(2026, 10, 15))?.number).toBe("A-2");
  });

  test("rend null dans un trou entre deux licences", () => {
    const gapped = [
      licenses[0],
      {
        number: "A-3",
        validFrom: day(2027, 9, 1),
        validUntil: parisWallClock(2028, 8, 31, 23, 59, 59, 999),
      },
    ];
    expect(licenseCovering(gapped, day(2027, 1, 15))).toBe(null);
  });

  test("rend null quand le joueur n'a aucune licence", () => {
    expect(licenseCovering([], day(2026, 1, 15))).toBe(null);
  });

  test("la plus récente est la dernière à expirer, valide ou non", () => {
    expect(latestLicense(licenses)?.number).toBe("A-2");
    expect(latestLicense([])).toBe(null);
  });
});

describe("chevauchement", () => {
  test("deux périodes qui se touchent d'un instant se chevauchent", () => {
    const a = { validFrom: day(2026, 1, 1), validUntil: day(2026, 6, 30) };
    const b = { validFrom: day(2026, 6, 30), validUntil: day(2026, 12, 31) };
    expect(periodsOverlap(a, b)).toBe(true);
  });

  test("deux saisons consécutives ne se chevauchent pas", () => {
    const a = {
      validFrom: day(2025, 9, 1),
      validUntil: parisWallClock(2026, 8, 31, 23, 59, 59, 999),
    };
    const b = { validFrom: day(2026, 9, 1), validUntil: day(2027, 8, 31) };
    expect(periodsOverlap(a, b)).toBe(false);
  });
});

describe("validation d'une licence à enregistrer", () => {
  const base = { number: "L-1", validFrom: day(2026, 9, 1), validUntil: day(2027, 8, 31) };

  test("accepte une licence bien formée", () => {
    expect(validateLicense(base, [])).toBe(null);
  });

  test("refuse un numéro vide ou fait d'espaces", () => {
    expect(validateLicense({ ...base, number: "   " }, [])).toMatch(/numéro de licence/i);
  });

  test("refuse une fin antérieure au début", () => {
    expect(
      validateLicense({ ...base, validUntil: day(2026, 8, 1) }, []),
    ).toMatch(/ne peut pas précéder/i);
  });

  test("refuse un chevauchement avec une licence existante", () => {
    const existing = { validFrom: day(2026, 6, 1), validUntil: day(2026, 12, 31) };
    expect(validateLicense(base, [existing])).toMatch(/chevauche/i);
  });

  test("accepte une reconduction qui reprend le même numéro", () => {
    const previous = {
      validFrom: day(2025, 9, 1),
      validUntil: parisWallClock(2026, 8, 31, 23, 59, 59, 999),
    };
    expect(validateLicense(base, [previous])).toBe(null);
  });
});

describe("normalisation d'un numéro", () => {
  test("garde les lettres autant que les chiffres", () => {
    expect(normalizeLicenseNumber("AB1234CD")).toBe("AB1234CD");
    expect(normalizeLicenseNumber("19-VB-0042")).toBe("19-VB-0042");
  });

  test("rogne les espaces et passe en majuscules", () => {
    // La casse ne distingue rien sur une carte de licence, alors que l'unicité se vérifie
    // par égalité exacte : « ab1234 » et « AB1234 » doivent se ranger au même numéro.
    expect(normalizeLicenseNumber("  ab1234  ")).toBe("AB1234");
    expect(normalizeLicenseNumber("ab1234")).toBe(normalizeLicenseNumber("AB1234"));
  });

  test("laisse un numéro purement numérique intact", () => {
    // Le cas d'avant l'ouverture aux lettres : rien ne doit bouger pour lui.
    expect(normalizeLicenseNumber("0042")).toBe("0042");
  });
});
