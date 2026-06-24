# Changelog

## 1.0.0 — 2026-06-24

Initial release. A Pi-native TypeScript / React code review tool, sibling to
`@estebanforge/pi-go-review`, `pi-php-review`, `pi-rust-review`, and
`pi-js-review`. Registers a `ts_review` tool that reads git diffs filtered to
`*.ts`/`*.mts`/`*.cts`/`*.tsx`, attaches a focused TS + React rubric, and for
each finding cites the entry number **and proposes a corrected snippet**.

### Added

- `ts_review` tool with five diff modes: `working`, `staged`, `all`, `commit`,
  `range`, plus a `path` scope. Filters to `.ts`/`.mts`/`.cts`/`.tsx` via
  multiple git pathspecs; directory `path` uses `:(glob)dir/**/*.ext` so
  non-TS files under the dir are excluded.
- Bundled `extensions/ts-flaws.md` rubric: **14 entries across 2 sections**
  (TypeScript Types, React/JSX). Each entry is a one-line rationale plus a
  bad→good pair (the good side is the fix template) with an inline severity
  tag. Loaded at runtime via `import.meta.url`. Every rule is grounded in a
  confirmed online source (Effective TypeScript, typescript-eslint, react.dev,
  Total TypeScript); sources are documented in the README, not embedded in the
  rubric, to keep the per-call prompt lean.
- Positions against typescript-eslint (strict) + eslint-plugin-react-hooks:
  focuses on the semantic mistakes those linters do NOT reliably catch (effect
  cleanup, fetch races, derived state, direct state mutation, stale updaters,
  unsafe `as` casts, `dangerouslySetInnerHTML`). Deliberately excludes mistakes
  those linters already enforce (`any`, non-null `!`, Rules of Hooks,
  `exhaustive-deps`).
- Review output proposes a corrected snippet for each finding.
- Custom TUI rendering for the tool call and result.

### Notes

- One extension covers the TypeScript superset including JSX (`.tsx`), since
  `.tsx` needs both type-system and React review together. Plain `.js`/`.mjs`/
  `.cjs` are covered by `pi-js-review`; `.jsx` (no types) is planned to fold
  into `pi-js-review` later.
