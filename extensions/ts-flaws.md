# TypeScript / React Review Rubric

Floor: **TypeScript 5.x**. Targets `.ts` / `.mts` / `.cts` / `.tsx` / `.jsx`. Covers two domains: **TypeScript type-system mistakes** and **React/JSX semantic mistakes**. Focuses on flaws that **typescript-eslint** (strict) and **eslint-plugin-react-hooks** do *not* reliably catch (effect cleanup, races, derived state, mutation, stale updaters, unsafe casts, render falsiness) — not the ones those linters already enforce. Each entry: severity tag, one-line rationale, and a bad→good pair (the good side is the fix template). Cite the **entry number** (e.g. `#5`), quote **file:line**, categorize (Bug / Suggestion / Nit), propose a corrected snippet. Only flag what's actually present. Note Good patterns. End with **Verdict**: Approve / Request Changes / Needs Discussion.

---

## TypeScript Types

### #1 Unsafe `as` type assertion [Bug]
`as` tells the compiler to trust you — it performs no runtime check, so a wrong shape crashes later, silently.
- bad:  `const user = response as User;` // no validation; shape mismatch hits at runtime
- good: narrow or parse: `const user = UserSchema.parse(response);` // or a user-defined type guard

### #2 `unknown` used without narrowing [Bug]
`unknown` is the safe alternative to `any`, but accessing its members via a cast (e.g. `as { name: string }`) skips the check that `unknown` exists to force.
- bad:  `function handle(raw: unknown) { return (raw as { name: string }).name; }` // asserts shape instead of checking it
- good: `if (typeof raw === "object" && raw !== null && "name" in raw) return raw.name;` // narrow first

### #3 Missing return-type annotations [Suggestion]
Unannotated module boundaries infer return types that can widen or leak (e.g. a dependency's type) across the codebase.
- bad:  `export function getUser(id: number) { return db.find(id); }` // return type leaks whatever db returns
- good: `export function getUser(id: number): Promise<User | null> { return db.find(id); }`

---

## React / JSX

### #4 Effect without a cleanup [Bug]
An effect that starts something (subscription, timer, listener, socket) must stop it in the returned cleanup, or it leaks across mounts/unmounts.
- bad:  `useEffect(() => { socket.connect(); }, []);` // never disconnects
- good: `useEffect(() => { const s = socket.connect(); return () => s.disconnect(); }, []);`

### #5 Direct state mutation [Bug]
State and props are immutable snapshots; mutating them directly doesn't trigger a render and corrupts React's diffing.
- bad:  `setItems(items); items[0].done = true;` // mutates the held state object
- good: `setItems(prev => prev.map((it, i) => (i === 0 ? { ...it, done: true } : it)));` // new array/object

### #6 Stale state update [Bug]
Reading state and passing the new value to the setter goes stale when several updates queue in one render. Use the functional updater.
- bad:  `setCount(count + 1); setCount(count + 1);` // applies once — `count` is the same snapshot
- good: `setCount(c => c + 1); setCount(c => c + 1);` // each updater sees the latest

### #7 `dangerouslySetInnerHTML` with untrusted data [Bug]
Injecting user data as raw HTML is the React equivalent of `innerHTML` XSS. Escape or sanitize.
- bad:  `<div dangerouslySetInnerHTML={{ __html: user.bio }} />`
- good: render as children (auto-escaped), or sanitize: `<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(user.bio) }} />`

### #8 Derived state via effect [Suggestion]
Copying props/state into another state variable via an effect is a known anti-pattern; compute it during render instead.
- bad:  `const [filtered, setFiltered] = useState([]); useEffect(() => setFiltered(items.filter(isActive)), [items]);`
- good: `const filtered = useMemo(() => items.filter(isActive), [items]);` // or just `items.filter(isActive)` when cheap

### #9 Fetch-in-effect without abort (race) [Bug]
An async fetch fired in an effect can resolve after the deps changed, writing a stale response into state. Cancel on cleanup; let real errors throw.
- bad:  `useEffect(() => { fetch(`/u/${id}`).then(r => r.json()).then(setUser); }, [id]);` // late response overwrites
- good: `useEffect(() => { const ctrl = new AbortController(); fetch(`/u/${id}`, { signal: ctrl.signal }).then(r => r.json()).then(setUser).catch(e => { if (e.name !== "AbortError") throw e; }); return () => ctrl.abort(); }, [id]);`

### #10 Controlled `value` without `onChange` [Suggestion]
A controlled input given `value` but no `onChange` is read-only and logs a warning; users can't type.
- bad:  `<input value={name} />` // controlled without handler — frozen
- good: `<input value={name} onChange={e => setName(e.target.value)} />` // or `defaultValue` for uncontrolled

### #11 `&&` render with a non-boolean falsy value [Bug]
React renders the expression's value, so `n && <X/>` renders a literal `0` (or `""`) when falsy. Force a boolean.
- bad:  `{items.length && <List items={items} />}` // renders "0" when the list is empty
- good: `{items.length > 0 && <List items={items} />}` // boolean; or `{items.length ? <List items={items} /> : null}`

### #12 `key` = array index in dynamic lists [Suggestion]
Index keys break React's reconciliation when the list reorders, inserts, or filters — components swap state with the wrong row.
- bad:  `items.map((it, i) => <Row key={i} item={it} />)` // stable only for never-changing lists
- good: `items.map(it => <Row key={it.id} item={it} />)` // stable identity per row

### #13 `setState` in the render body (infinite loop) [Bug]
Calling a setter directly in the component body (not in an effect/handler) re-renders immediately — an infinite loop. Compute during render instead of stashing it.
- bad:  `function Profile({ name }) { setDisplay(name); return <div>{display}</div>; }` // render-phase setState
- good: `function Profile({ name }) { const display = format(name); return <div>{display}</div>; }` // derive, don't store-and-set

### #14 Unstable value in a hook deps array [Bug]
An object/array/function created in render is a new reference each render; listing it in a deps array makes the effect re-run every render. `exhaustive-deps` adds deps but never warns that an included dep is unstable.
- bad:  `useEffect(() => { run(filterFn); }, [filterFn]);` // filterFn is a fresh arrow each render → effect refires every render
- good: stabilize that one dependency (hoist it, keep it in state, or wrap just it in `useCallback`) so its reference is stable — not blanket-memoizing everything.

### #15 Untrusted URL in `href` / `src` (`javascript:` XSS) [Bug]
React escapes text children but does NOT sanitize URL schemes — a user-supplied `javascript:` URL runs as script. eslint does not catch this.
- bad:  `<a href={userUrl}>link</a>` // userUrl = `javascript:alert(document.cookie)`
- good: allowlist the scheme (and host) before binding: `const u = new URL(userUrl); return (u.protocol === "http:" || u.protocol === "https:") ? <a href={u.href}>link</a> : null;`

### #16 Auth token in `localStorage` / `sessionStorage` [Bug]
A single XSS exfiltrates every token held in Web Storage. Prefer HttpOnly cookies, or short-lived in-memory tokens with refresh.
- bad:  `localStorage.setItem("token", jwt);` // readable by any injected script
- good: store the session in an HttpOnly cookie (CSRF-protected), or keep a short-lived token in memory and refresh via an HttpOnly refresh cookie.

### #17 Inline object/array/callback props to a memoized child [Suggestion]
`React.memo` compares props with `Object.is`; an object/array/arrow recreated in render is a new reference each render, so the memoized child never bails out. Distinct from #14 (that's hook deps; this is render props).
- bad:  `<Row style={{ padding: 8 }} onClick={() => pick(item.id)} />` // fresh refs every render → memo defeated
- good: hoist static objects to module scope (`const ROW_STYLE = { padding: 8 };`) and `useCallback` the callbacks a memoized child actually reads.

### #18 Context `value` recreated every render [Suggestion]
A context provider given an inline object/array as `value` pushes a new reference to every consumer on each render, re-rendering them all even when nothing they read changed.
- bad:  `<UserCtx.Provider value={{ user, setUser }}>` // new object each render → all consumers re-render
- good: `const value = useMemo(() => ({ user, setUser }), [user, setUser]); return <UserCtx.Provider value={value}>` — or split state and dispatch into separate providers.
