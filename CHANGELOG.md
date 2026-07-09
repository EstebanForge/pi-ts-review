# Changelog

## 1.1.0 — 2026-07-09

### Added
- **`.jsx` is now reviewed** (React/JSX domain): the tool filters to
  `.ts`/`.mts`/`.cts`/`.tsx`/`.jsx`. Plain `.js`/`.mjs`/`.cjs` stay with
  pi-js-review. The React rubric (#4-#14) applies identically to `.jsx` and
  `.tsx`, so this closes the gap where untyped JSX had no owner.
- **Four new rubric entries** covering React-specific security and
  performance flaws that linters miss:
  - #15 Untrusted URL in `href`/`src` (`javascript:` XSS) — React escapes
    text children but not URL schemes.
  - #16 Auth token in `localStorage`/`sessionStorage` — one XSS exfiltrates
    every token.
  - #17 Inline object/array/callback props to a memoized child — defeats
    `React.memo`'s `Object.is` prop check (distinct from unstable effect
    deps in #14).
  - #18 Context `value` recreated every render — fans re-renders to all
    consumers.

### Changed
- Rubric grows 14 → 18 entries. User-facing labels and docs updated to
  "TS/TSX/JSX".

## 1.0.1 — 2026-06-30

### Fixed
- **`path` into a nested git repo failed**: `git` was always run from the
  agent's workspace root (via `pi.exec` without `cwd`), so a `path` pointing
  into a nested repo — whose workspace root is not itself a git repo (e.g. a
  package under `src/...` in a multi-repo workspace) — errored `not a git
  repository`. The tool now resolves `path`, stats it, sets `cwd` on the git
  invocation, and rebases the pathspec array (`.ts`/`.mts`/`.cts`/`.tsx`)
  relative to that directory. Git pathspecs treat `*` as crossing `/`, so
  plain `*.ts` (etc.) recurses under the new cwd.
- **Deleted files in a nested repo now resolve**: when the `path` no longer
  exists on disk (uncommitted deletion), the tool walks up from the parent
  dir to the nearest `.git` and anchors there, instead of falling back to
  the workspace root. Non-`ENOENT` errors (e.g. `EACCES`) are re-thrown
  rather than misread as a deletion.
- **Clearer failure mode**: when the working directory isn't inside any git
  repo, the thrown error now appends a hint to pass `path` pointing into the
  repo.

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
