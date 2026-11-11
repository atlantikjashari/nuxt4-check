# nuxt4-check

**Is your Nuxt 3 app ready for Nuxt 4?** Find out in a few seconds.

Nuxt 3 reached end of life on **31 July 2026**, so it no longer gets security patches. `nuxt4-check` scans your project for the breaking changes listed in the official Nuxt 3 → 4 upgrade guide and tells you exactly where they are.

```bash
npx nuxt4-check
```

- **Zero dependencies.** Plain Node 18+.
- **Read-only.** It never changes your files.
- **Local.** Your code never leaves your machine.

## What it checks

| Area | What it looks for |
|---|---|
| Data fetching | `null` checks on `data`/`error` (they now default to `undefined`), nested mutation of `data` (now a `shallowRef`), boolean `dedupe`, `getCachedData`, `pending` and `immediate: false` semantics |
| Removed APIs | `window.__NUXT__`, `route.meta.name`, `JSON.parse(error.data)`, top-level `generate` config, removed experimental flags, `vite.devBundler` |
| Unhead v2 | `hid` / `vmid` head props, direct `@unhead/vue` imports |
| Components | `findComponent` and `<KeepAlive include>` lookups affected by normalised component names |
| Modules | Lists every Nuxt module you depend on so you can confirm Nuxt 4 support |
| Structure | v3 layout at the root (optional move into `app/`) |
| TypeScript | `noUncheckedIndexedAccess` becoming the default |

You also get a rough effort estimate (small / medium / large).

## Options

```bash
npx nuxt4-check ./path/to/project     # scan another directory
npx nuxt4-check --md nuxt4-report.md  # also write a Markdown report (useful for tickets/PRs)
npx nuxt4-check --json                # machine-readable output for CI
```

Exit code is `1` when high-severity issues are found, so you can use it as a CI gate.

## After the scan

1. Run the official codemods: `npx codemod@0.18.7 nuxt/4/migration-recipe`
2. Work through the remaining findings using the [official upgrade guide](https://nuxt.com/docs/4.x/getting-started/upgrade).
3. Check each listed module's changelog for Nuxt 4 support.

This is a heuristic scan. It can miss things and flag false positives, so treat it as a checklist, not a guarantee.

## Want it done for you?

I do fixed-price Nuxt 3 → 4 (and Nuxt 2 → 4) upgrades with regression testing, delivered as a reviewable pull request.
**Atlantik Jashari** · atlantik.jashari@gmail.com · [LinkedIn](https://linkedin.com/in/atlantikjashari)

## License

MIT
