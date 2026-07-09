/**
 * pi-ts-review — Code review powered by a curated TypeScript / React rubric.
 *
 * Registers a ts_review tool that reads TypeScript code changes (git diff) and
 * returns them alongside a lean, two-section rubric (TypeScript types + React/
 * JSX). The LLM reviews the diff, flags flaws, AND proposes a corrected snippet
 * for each finding.
 *
* Targets `.ts` / `.mts` / `.cts` / `.tsx` / `.jsx` (TypeScript, plus JSX with or without types).
 *
 * Features:
 *   - Reviews staged, unstaged, commit, or range diffs filtered to TS files
 *   - Bundles the rubric as a sibling .md asset (human-editable)
 *   - Focuses on flaws typescript-eslint (strict) + eslint-plugin-react-hooks
 *     do NOT reliably catch: effect cleanup, fetch races, derived state,
 *     mutation, stale updaters, unsafe casts, dangerouslySetInnerHTML
 *   - Categorizes findings: Bug/Critical, Suggestion, Nit, Good pattern
 *   - Custom TUI rendering for call + result
 *   - System prompt injection so the agent auto-invokes when reviewing TS/React code
 *
 * Sibling to @estebanforge/pi-go-review, pi-php-review, pi-rust-review, pi-js-review.
 * Pair with `typescript-eslint` (strict) and `eslint-plugin-react-hooks` for
 * compiler-grade lint coverage; this tool focuses on semantic mistakes those
 * linters may not flag. The rubric's rules are grounded in confirmed online
 * sources; sources are documented in the README.
 */
import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { readFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The rubric ships as a sibling markdown file (source of truth, editable). Load
// lazily; memoize only on success so a transient read failure (e.g. a
// mid-install state during a Pi hot-reload) stays recoverable on the next call
// instead of pinning the degraded message for the process lifetime. Under Pi's
// jiti loader, import.meta.url resolves to this source file, so the sibling .md
// is reachable next to it.
let _guide: string | null = null;
function getGuide(): string {
	if (_guide !== null) return _guide;
	try {
		const here = path.dirname(fileURLToPath(import.meta.url));
		_guide = readFileSync(path.join(here, "ts-flaws.md"), "utf8");
		return _guide;
	} catch {
		return "## TS/React rubric unavailable\n\nThe bundled `ts-flaws.md` could not be read. Reinstall the package or check the install.";
	}
}

// git argument prefix per mode; the caller pathspec(s) are appended after "--".
const STAT = ["--stat", "--patch"];
const GIT_PREFIX: Record<string, string[]> = {
	working: ["diff", ...STAT],
	staged: ["diff", "--cached", ...STAT],
	all: ["diff", "HEAD", ...STAT],
	commit: ["show", ...STAT],
	range: ["diff", ...STAT],
};

interface TsReviewDetails {
	mode: string;
	ref?: string;
	path?: string;
	insertions: number;
	deletions: number;
	tsFilesFound: number;
	truncated: boolean;
}

// Walk up from `start` to the nearest enclosing .git (directory or file).
// Returns the containing dir, or null if none — meaning there's no repo to
// anchor to (the workspace root isn't in one and no ancestor is either).
function findGitRoot(start: string): string | null {
	let dir = start;
	for (let i = 0; i < 64; i++) {
		if (existsSync(path.join(dir, ".git"))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "ts_review",
		label: "TS Review",
		description:
			"Review TypeScript / React code changes against a focused TS + React rubric. " +
			"Reads git diffs (staged, unstaged, commits, or ranges), filters to .ts/.mts/.cts/.tsx/.jsx files, " +
			"and returns the diff alongside the rubric (numbered entries, each a bad/good pair). " +
			"Each finding cites the entry number (e.g. #5) AND proposes a corrected snippet modeled on the good example. " +
			"Use this whenever reviewing TypeScript or React/JSX code, PRs, or changes before committing.",
		promptSnippet: "Review TypeScript / React code changes and propose corrected snippets from the TS + React rubric",
		promptGuidelines: [
			"Use ts_review when the user asks to review TypeScript, React, or JSX/TSX code, or audit a TS/React PR.",
			"Targets .ts/.mts/.cts/.tsx/.jsx (React/JSX domain). Plain .js/.mjs/.cjs use pi-js-review.",
			"After receiving the diff and rubric, analyze every changed TS/TSX file against relevant entries.",
			"For each finding: cite the entry number (e.g. #5), give file:line/code fragment, categorize (Bug/Critical, Suggestion, Nit), AND propose a corrected snippet modeled on the entry's good example.",
			"Rubric deliberately excludes mistakes typescript-eslint (strict) and eslint-plugin-react-hooks already enforce; flag only the semantic gaps those linters miss.",
			"Only flag flaws actually present, most impactful first. Note Good patterns too.",
			"End with a verdict: Approve, Request Changes, or Needs Discussion.",
		],
		parameters: Type.Object({
			mode: StringEnum(["working", "staged", "commit", "range", "all"] as const, {
				description: "working=unstaged, staged=cached, commit=specific SHA, range=two refs, all=HEAD diff",
			}),
			ref: Type.Optional(Type.String({ description: "Commit SHA, branch, or range (e.g. main..HEAD). Required for commit/range." })),
			path: Type.Optional(Type.String({ description: "Limit to file or directory (e.g. src/components). Git runs from this path, so it can point into a nested repo." })),
		}),
		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const { mode, ref, path: filePath } = params;
			const EXTS = [".ts", ".mts", ".cts", ".tsx", ".jsx"];
			const EXT_ALT = EXTS.map((e) => e.slice(1)).join("|"); // "ts|mts|cts|tsx"
			const MAX_LINES = 1500;
			const hasExt = (p: string) => EXTS.some((e) => p.endsWith(e));

			if ((mode === "commit" || mode === "range") && !ref) {
				throw new Error(`ref required for ${mode} mode`);
			}

			// Anchor the git invocation to the caller's path. A plain pathspec alone
			// is insufficient: git must be *run* from inside the target repo, otherwise
			// a `path` pointing into a nested repo (common in workspaces whose root is
			// not itself a git repo) yields 'not a git repository'.
			//
			// Strategy: resolve `path`, stat it, set `cwd` on the exec, and rebase the
			// pathspec relative to that cwd. Git pathspecs treat `*` as crossing `/`,
			// so plain `*.ts` (etc.) recurses under cwd — no :(glob) magic needed once
			// we're standing in the right directory.
			let gitCwd = process.cwd();
			let pathspecs: string[] = EXTS.map((e) => "*" + e); // all variants, under cwd
			if (filePath) {
				const resolved = path.resolve(gitCwd, filePath);
				try {
					if (statSync(resolved).isDirectory()) {
						gitCwd = resolved;
						pathspecs = EXTS.map((e) => "*" + e);
					} else {
						gitCwd = path.dirname(resolved);
						pathspecs = [path.basename(resolved)];
					}
				} catch (err) {
					// Re-throw anything that isn't ENOENT (e.g. EACCES) so a permissions
					// error on a path that exists isn't misread as "deleted file".
					if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
					// Path doesn't exist on disk (uncommitted deletion, typo, or a path
					// only meaningful inside a nested repo we can't see from here).
					// Walk up from its parent dir to a real .git so deletions inside a
					// nested repo still anchor correctly; if no repo is reachable, gitCwd
					// stays at the workspace root and git will fail with the hint below.
					const root = findGitRoot(path.dirname(resolved));
					if (root) {
						gitCwd = root;
						const rel = path.relative(root, resolved).replace(/\\/g, "/");
						pathspecs = hasExt(resolved)
							? [rel]
							: EXTS.map((e) => `:(glob)${rel.replace(/\/+$/, "")}/**/*${e}`);
					} else {
						pathspecs = hasExt(filePath)
							? [filePath]
							: EXTS.map((e) => `:(glob)${filePath.replace(/\/+$/, "")}/**/*${e}`);
					}
				}
			}
			const gitArgs = [...GIT_PREFIX[mode], ...(ref ? [ref] : []), "--", ...pathspecs];

			const result = await pi.exec("git", gitArgs, { cwd: gitCwd, signal, timeout: 30000 });
			if (result.code !== 0) {
				const hint = /not a git repository/i.test(result.stderr)
					? " — the working directory is not inside a git repo; pass `path` pointing into the repo (a file or dir)."
					: "";
				throw new Error(`git failed (${result.code}): ${result.stderr}${hint}`);
			}

			const base = { mode, ref, path: filePath };
			if (!result.stdout.trim()) {
				return {
					content: [{ type: "text" as const, text: "No TS/TSX/JSX file changes found. Try: staged, working, all, commit, or range." }],
					details: { ...base, insertions: 0, deletions: 0, tsFilesFound: 0, truncated: false } satisfies TsReviewDetails,
				};
			}

			const lines = result.stdout.split("\n");

			// Anchor to the LAST stat line: in commit/range mode git emits the commit
			// message before the diffstat, so a message containing "N files changed"
			// would otherwise be parsed as the stat and poison the metrics.
			const statLine = lines.filter((line) => /\d+ files? changed/.test(line)).pop() ?? "";
			const insertions = parseInt(statLine.match(/(\d+) insertions?/)?.[1] ?? "0", 10);
			const deletions = parseInt(statLine.match(/(\d+) deletions?/)?.[1] ?? "0", 10);
			const tsFilesFound = result.stdout.match(new RegExp(`^diff --git a/.*\\.(?:${EXT_ALT}) b/.*\\.(?:${EXT_ALT})$`, "gm"))?.length ?? 0;

			const truncated = lines.length > MAX_LINES;
			const diffText = truncated ? lines.slice(0, MAX_LINES).join("\n") : result.stdout;

			const text = [
				`## TS/React Code Review: ${mode}${ref ? " " + ref : ""}${filePath ? ` (${filePath})` : ""}`,
				"",
				`**${tsFilesFound}** TS/TSX/JSX files, **+${insertions}** / **-${deletions}**`,
				"",
				"### Diff",
				"",
				"```diff",
				diffText,
				"```",
				"",
				...(truncated ? [`> Truncated to ${MAX_LINES} lines. Use path param to focus.`, ""] : []),
				"---",
				"",
				"### Review Instructions",
				"",
				"Analyze the diff against the TS + React rubric below.",
				"For each entry found:",
				"  - cite the **entry number** (e.g. '#5 direct state mutation');",
				"  - give **file:line / code fragment**;",
				"  - categorize: Bug/Critical, Suggestion, or Nit;",
				"  - **propose the corrected snippet**, modeled on the entry's good example.",
				"Only flag flaws **actually present**, most impactful first. Note Good patterns too.",
				"End with **Verdict**: Approve / Request Changes / Needs Discussion.",
				"",
				getGuide(),
			].join("\n");

			return {
				content: [{ type: "text" as const, text }],
				details: { ...base, insertions, deletions, tsFilesFound, truncated } satisfies TsReviewDetails,
			};
		},
		renderCall(args, theme, _ctx) {
			const modeColors: Record<string, ThemeColor> = {
				working: "warning",
				staged: "accent",
				commit: "success",
				range: "success",
				all: "warning",
			};
			let label = theme.fg("toolTitle", theme.bold("ts_review "));
			label += theme.fg(modeColors[args.mode] ?? "accent", args.mode);
			if (args.ref) label += theme.fg("muted", " " + args.ref);
			if (args.path) label += theme.fg("dim", " — " + args.path);
			label += theme.fg("dim", "  (TS + React rubric)");
			return new Text(label, 0, 0);
		},
		renderResult(result, { expanded, isPartial }, theme, _ctx) {
			if (isPartial) return new Text(theme.fg("warning", "Scanning TS/React changes..."), 0, 0);
			const details = result.details as TsReviewDetails | undefined;
			if (!details || details.tsFilesFound === 0) return new Text(theme.fg("dim", "No TS/React changes found"), 0, 0);

			let summary = theme.fg("accent", details.tsFilesFound + " TS/TSX/JSX files");
			summary += theme.fg("dim", " | ") + theme.fg("success", "+" + details.insertions) + theme.fg("dim", "/") + theme.fg("error", "-" + details.deletions);
			summary += theme.fg("dim", " | ") + theme.fg("muted", "TS + React rubric");
			if (details.truncated) summary += theme.fg("warning", " (truncated)");

			if (!expanded) return new Text(summary, 0, 0);

			summary += "\n" + theme.fg("dim", "─".repeat(50));
			const content = result.content[0];
			if (content?.type === "text") {
				const statLines = content.text.split("\n").filter((line: string) => line.includes("|") && /[+-]/.test(line)).slice(0, 8);
				for (const line of statLines) summary += "\n" + theme.fg("dim", "  " + line.trim());
				if (statLines.length === 0) summary += "\n" + theme.fg("dim", "  (expand for diff + rubric)");
			}
			return new Text(summary, 0, 0);
		},
	});
}
