# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the
codebase.

**Layout: single-context.** One `CONTEXT.md` at the repo root, plus `docs/adr/`. There is no
`CONTEXT-MAP.md` and no per-context split — don't create one unless the repo actually grows into
several bounded contexts.

## Before exploring, read these

- **[`CONTEXT.md`](../../CONTEXT.md)** at the repo root — the glossary. It exists and is
  maintained; treat it as authoritative on naming.
- **[`docs/adr/`](../adr/)** — read the ADRs that touch the area you're about to work in.

Both already exist in this repo, so there is no "proceed silently if missing" case for them. New
terms and new decisions are added lazily, as they get resolved, by `/domain-modeling` (reached via
`/grill-with-docs` and `/improve-codebase-architecture`).

`CONTEXT.md` is a glossary and nothing else — no implementation details, no spec, no scratch pad.
Match rules, lifecycle states and scoring live in [`AGENTS.md`](../../AGENTS.md); the *why* behind
non-obvious choices lives in `docs/adr/`.

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a test
name), use the term as defined in `CONTEXT.md`. Don't drift to the synonyms it lists under
`_Avoid_` — in this repo that means, for example, `Receveur` / `Visiteur` rather than "domicile" /
"extérieur" or "équipe A" / "équipe B", and `Composition` rather than "roster".

This repo's naming convention: **French in the UI and in the glossary, English in the code.** Each
glossary entry carries its code identifier in parentheses (`Journée` → `matchday`). Use the French
term when writing prose for humans, the English identifier when writing code.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing
language the project doesn't use (reconsider) or there's a real gap (note it for
`/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (validation tacite sans notification) — but worth reopening because…_

The current ADRs record deliberate deviations from the obvious path. ADR-0001 in particular exists
to stop someone "completing" the product by adding an automatic calendar generator.
