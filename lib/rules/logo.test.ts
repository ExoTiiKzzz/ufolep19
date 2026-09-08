import { describe, expect, test } from "vitest";

import { ACCEPTED_LOGO_TYPES, MAX_LOGO_BYTES, rejectLogo } from "./logo";

describe("fichiers acceptés", () => {
  test.each(ACCEPTED_LOGO_TYPES)("%s est accepté", (contentType) => {
    expect(rejectLogo({ contentType, size: 50_000 })).toBeNull();
  });

  test("un fichier juste sous la limite est accepté", () => {
    expect(rejectLogo({ contentType: "image/png", size: MAX_LOGO_BYTES })).toBeNull();
  });
});

describe("fichiers refusés, et le motif", () => {
  test.each([
    ["un PDF", "application/pdf"],
    ["un SVG, qui peut embarquer du script", "image/svg+xml"],
    ["un fichier texte", "text/plain"],
    ["un HTML", "text/html"],
  ])("%s est refusé", (_label, contentType) => {
    expect(rejectLogo({ contentType, size: 1_000 })).toMatch(/Format non accepté/);
  });

  test("un fichier sans type déclaré est refusé", () => {
    expect(rejectLogo({ size: 1_000 })).toMatch(/Format non accepté/);
  });

  test("une image trop lourde est refusée, en annonçant sa taille", () => {
    const rejection = rejectLogo({ contentType: "image/png", size: MAX_LOGO_BYTES + 1 });
    expect(rejection).toMatch(/trop lourd/);
    expect(rejection).toMatch(/2048 ko/);
  });

  test("le format est vérifié avant le poids : un gros PDF est refusé comme format", () => {
    expect(rejectLogo({ contentType: "application/pdf", size: 10 * MAX_LOGO_BYTES })).toMatch(
      /Format non accepté/,
    );
  });
});
