# @estebanforge/pi-ts-review

TypeScript / React code review against a focused **TS + React rubric**. Registers a `ts_review` tool that reads git diffs, filters to `.ts`/`.mts`/`.cts`/`.tsx`/`.jsx`, and attaches the rubric (18 entries across 2 sections: TypeScript types + React/JSX, including security and performance flaws). The rubric targets flaws that **typescript-eslint** (strict) and **eslint-plugin-react-hooks** do *not* reliably catch. Every rule is grounded in a confirmed online source — see [Sources](#sources).

Sibling to [`@estebanforge/pi-go-review`](https://github.com/EstebanForge/pi-go-review), [`pi-php-review`](https://github.com/EstebanForge/pi-php-review), [`pi-rust-review`](https://github.com/EstebanForge/pi-rust-review), and [`pi-js-review`](https://github.com/EstebanForge/pi-js-review). Pair with `typescript-eslint` and `eslint-plugin-react-hooks` for lint coverage; this tool focuses on the semantic mistakes those linters may not flag.

## Install

```
pi install npm:@estebanforge/pi-ts-review
```

## Usage

Ask Pi: **"review my TypeScript changes"** or **"review my React changes."**

The tool runs `git` in one of five modes:

| Mode | Description | Needs `ref` |
| --- | --- | --- |
| `working` | Unstaged changes | No |
| `staged` | Staged (cached) changes | No |
| `all` | All changes vs HEAD | No |
| `commit` | A specific commit | Yes (SHA) |
| `range` | A commit range | Yes (e.g. `main..HEAD`) |

Narrow scope with `path` (a file or directory). The tool runs `git` **from** that path — so `path` can point into a nested repo (e.g. a package inside a workspace whose root is not itself a git repo).

## What it does

1. Reads the git diff filtered to `*.ts` / `*.mts` / `*.cts` / `*.tsx` / `*.jsx`.
2. Attaches the TS + React rubric (18 entries, 2 sections).
3. The LLM reviews the diff and returns findings that **propose a corrected snippet**:

| Severity | Meaning |
| --- | --- |
| Bug / Critical | Must fix |
| Suggestion | Should consider |
| Nit | Minor improvement |
| Good pattern | Well done |

Each finding cites the entry number (e.g. **#6**), the file + code fragment, and a corrected snippet. Ends with a **Verdict**: Approve / Request Changes / Needs Discussion.

## Rubric sections

| Section | Entries |
| --- | --- |
| 1. TypeScript Types | #1 - #3 |
| 2. React / JSX | #4 - #14 |

Scope note: this rubric deliberately **excludes** mistakes that `typescript-eslint` (strict) and `eslint-plugin-react-hooks` already enforce (e.g. `any`, non-null `!`, Rules of Hooks, `exhaustive-deps`, `@ts-expect-error` via `ban-ts-comment`). It targets the semantic gaps those linters miss: effect cleanup, fetch races, unstable effect deps, derived state, direct state mutation, stale updaters, unsafe `as` casts, falsy `&&` render, `dangerouslySetInnerHTML`, plus React-specific **security** and **performance** flaws (URL injection, token storage, memoization-defeating inline props, context re-renders).

## Sources

The rubric's rules were validated against confirmed online sources during research (searched via Exa and Brave). The sources live here in the README (not embedded in the rubric) to keep the per-call prompt lean.

| # | Entry | Source |
| --- | --- | --- |
| 1 | Unsafe `as` assertion | Effective TS — [Item 9: Prefer annotations to assertions](https://github.com/danvk/effective-typescript/blob/main/samples/ch-types/prefer-declarations-to-assertions.md) · basarat — [type-assertion](https://github.com/basarat/typescript-book/blob/master/docs/types/type-assertion.md) |
| 2 | `unknown` not narrowed | Total TypeScript — [Narrowing unknown](https://www.totaltypescript.com/workshops/typescript-pro-essentials/unions-and-narrowing/narrowing-unknown-in-a-large-conditional-statement/solution) |
| 3 | Missing return types | typescript-eslint — [explicit-module-boundary-types](https://typescript-eslint.io/rules/explicit-module-boundary-types/) |
| 4 | Effect without cleanup | React — [Lifecycle of Reactive Effects](https://react.dev/learn/lifecycle-of-reactive-effects) |
| 5 | Direct state mutation | React — [Updating Objects in State](https://react.dev/learn/updating-objects-in-state) |
| 6 | Stale state update | React — [Queueing a Series of State Updates](https://react.dev/learn/queueing-a-series-of-state-updates) |
| 7 | `dangerouslySetInnerHTML` | React — [dangerouslySetInnerHTML](https://github.com/facebook/react/blob/main/docs/tips/19--dangerouslySetInnerHTML.md) · OWASP [XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html) |
| 8 | Derived state via effect | React — [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect) |
| 9 | Fetch-in-effect race | React — [Synchronizing with Effects](https://react.dev/learn/synchronizing-with-effects) · [Lifecycle of Reactive Effects](https://react.dev/learn/lifecycle-of-reactive-effects) |
| 10 | Controlled value/onChange | React — [`<input>` reference](https://react.dev/reference/react-dom/components/input) |
| 11 | `&&` falsy render | React — [Conditional Rendering](https://react.dev/learn/conditional-rendering) |
| 12 | Index-as-key | React — [Rendering Lists](https://react.dev/learn/rendering-lists) |
| 13 | setState in render loop | React — [Components and Hooks must be pure](https://react.dev/reference/rules/components-and-hooks-must-be-pure) |
| 14 | Unstable value in deps array | React — [Removing Effect Dependencies](https://react.dev/learn/removing-effect-dependencies) |
| 15 | Untrusted URL in `href`/`src` | Pragmatic Web Security — [Preventing XSS in React (Part 1): Data binding and URLs](https://pragmaticwebsecurity.com/articles/spasecurity/react-xss-part1.html) · OWASP [XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html) |
| 16 | Auth token in `localStorage` | OWASP — [HTML5 Web Storage Security](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html#local-storage) · IETF [OAuth 2.0 for Browser-Based Apps](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps) |
| 17 | Inline props vs `React.memo` | React — [`memo` reference](https://react.dev/reference/react/memo) · LogRocket [The React pattern everyone uses that quietly kills performance](https://blog.logrocket.com/react-pattern-everyone-uses-kills-performance/) |
| 18 | Context `value` recreated | Kent C. Dodds — [How to optimize your context value](https://kentcdodds.com/blog/how-to-optimize-your-context-value) |

Primary authorities: [Effective TypeScript (Dan Vanderkam)](https://github.com/danvk/effective-typescript), [typescript-eslint](https://typescript-eslint.io/), [React docs (react.dev)](https://react.dev/), [Total TypeScript](https://www.totaltypescript.com/).

## TUI rendering

Custom rendering for both the tool call and its result: mode, file count, insertions/deletions, and truncation status at a glance.

## License

MIT
