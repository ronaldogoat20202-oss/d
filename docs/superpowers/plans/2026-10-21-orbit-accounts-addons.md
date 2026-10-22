# Orbit Accounts and Add-ons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution status:** Tasks1–9 implemented and verified. Task10 local/live/desktop verification passed; independent review and Windows artifact delivery are in progress.

**Goal:** Add familiar Microsoft browser login, persistent offline profiles, isolated Vanilla/Fabric game profiles, and a working mods/packs/shaders library to Orbit.

**Architecture:** Retain the Electron/React application and main-process controller, with focused account, profile, Fabric, catalog, and managed-content services. Share verified vanilla resources across isolated instance directories. Use typed IPC for user intentions; filesystem paths, authentication, dependency resolution, and content transactions stay in the main process.

**Tech Stack:** Existing Node.js 24, TypeScript, Electron, React, MSAL, `@xmcl/core`, `@xmcl/user`, Vitest, Playwright, and electron-builder. Reuse the installed ZIP reader where its bounded-entry API suffices; any newly required direct dependency must be exact-version pinned with its lockfile integrity intact.

**Spec:** [Approved accounts/add-ons specification](../specs/2026-10-21-orbit-accounts-addons-design.md).

## Global Constraints

- Windows x64 product; Linux development/tests; use the current isolated checkout without a worktree. Preserve Node `>=24.15.0 <25` and existing working commands.
- Preserve vanilla verification, compatible x64 Java, memory controls, bounded/redacted logs, sandbox/context isolation, exact IPC sender checks, and shell-free process spawning.
- Offline username: **3–16 ASCII letters, digits, or underscores**; duplicate local names are case-insensitive. No automatic offline fallback after failed Microsoft authentication.
- Microsoft configuration is `ORBIT_MICROSOFT_CLIENT_ID`, with a saved valid ID only as a legacy fallback. No borrowed client ID, client secret, password field, or token in renderer data.
- OAuth: S256 PKCE; random state; registered `http://localhost`; runtime `http://localhost:<ephemeral-port>/`; listener bound only to `127.0.0.1`; **five-minute deadline** (`300000` ms); cleanup on every exit path.
- Fabric only; immutable profile Minecraft/loader versions; retained original library roots and existing worlds. Profile removal unregisters it and retains its files.
- Content kinds: mods, resource packs, data packs, shaders. Data packs require an existing world. Iris is a Fabric mod; shader packs target Iris rather than the Fabric loader.
- Remote Modrinth files require SHA-512 and expected size. Only provider-specific HTTPS hosts are allowed; no weakening of default Mojang policy or TLS/checksum checks.
- No content/root/profile mutation while Minecraft runs. Only managed, digest-matching files can be replaced/removed. Incomplete transactions block that profile's launch until recovery.
- Installing packs does not establish in-game activation. No edits to `options.txt`, shader settings, or `level.dat`.
- No Forge/NeoForge/Quilt, modpacks, server management, automatic Java installation, hosted account service, or recursive profile-folder deletion.
- Preserve Native execution: primary agent implements the tasks, followed by one fresh whole-change reviewer and fixes. Read-only research may be delegated; do not switch to per-task implementers.
- Public-provider or real Microsoft checks that cannot run remain explicitly unverified. Deliver an actual GitHub Windows artifact, not a workspace-preview link.

## Review Focus

1. Wrong-state OAuth traffic before the real callback must not consume the pending attempt; the real callback can still succeed (Task 2).
2. First startup with existing worlds but unavailable release metadata must retain the worlds, defer migration, and show no invented installed profile (Task 4).
3. User-modified managed files must survive remove/update/recovery attempts with a visible conflict (Task 8).
4. Interruption after the first transaction move must leave a recoverable marker and prevent partial content from launching (Task 8).
5. Slow search/import results after a tab/profile change must not populate or install into the newly selected context (Task 9).

## File and interface map

Public definitions live in `src/shared/accounts.ts`, `src/shared/profiles.ts`, and `src/shared/addons.ts`, re-exported by `src/shared/contracts.ts`; `GameSession` remains internal in `src/main/services/types.ts`. Introduce each type with its first producing task; update consumers and test fixtures in the task that makes a field required. Do not land placeholder public methods or invented production data to keep intermediate builds green. Test suites use the existing Vitest `mkdtemp`/cleanup pattern; assertion examples below describe the owning test's real fixture state, not additional production hooks.

```ts
type AccountKind = 'microsoft' | 'offline'
interface AccountIdentity { kind: AccountKind; id: string; name: string }
interface AccountIndex { accounts: AccountIdentity[]; selected: AccountIdentity | null }
type GameSession =
  | { kind: 'offline'; profile: AccountIdentity }
  | { kind: 'microsoft'; profile: AccountIdentity; accessToken: string; clientId: string; xuid: string }
type Loader = { kind: 'vanilla' } | { kind: 'fabric'; version: string }
interface GameProfile { id: string; name: string; minecraftVersion: string; loader: Loader; libraryRoot: string; gameDirectory: string; legacy: boolean }
interface NewProfile { name: string; minecraftVersion: string; loader: 'vanilla' | 'fabric' }
type AddonKind = 'mod' | 'resourcepack' | 'datapack' | 'shader'
interface AddonTarget { gameVersion: string; loader: 'vanilla' | 'fabric' }
interface CatalogQuery { kind: AddonKind; query: string; gameVersion: string; offset: number; limit: number }
interface CatalogProject { id: string; name: string; description: string; kind: AddonKind }
interface CatalogFile { filename: string; url: string; size: number; sha512: string; primary: boolean }
interface CatalogDependency { type: 'required' | 'optional' | 'incompatible' | 'embedded'; projectId: string | null; versionId: string | null }
interface CatalogVersion { id: string; projectId: string; name: string; kind: AddonKind; gameVersions: string[]; loaders: string[]; files: CatalogFile[]; dependencies: CatalogDependency[]; publishedAt: string }
interface SearchPage { projects: CatalogProject[]; offset: number; limit: number; total: number; cached: boolean }
interface WorldSummary { id: string; name: string }
interface AddonRequest { projectId: string; versionId: string; kind: AddonKind; worldId?: string }
interface ManagedAddon { id: string; kind: AddonKind; name: string; source: 'modrinth' | 'local'; projectId: string | null; versionId: string | null; relativePath: string; sha512: string; providerSize: number | null; providerSha512: string | null; enabled: boolean; worldId: string | null; dependencies: string[]; compatibility: 'declared' | 'unverified'; gameVersion: string; loader: 'vanilla' | 'fabric' }
interface AddonPlan { id: string; profileId: string; entries: { name: string; kind: AddonKind; versionId: string | null; bytes: number }[]; optionalDependencies: string[] }
interface ImportPreview { id: string; profileId: string; name: string; kind: AddonKind; compatibility: 'declared' | 'unverified'; requiredAddons: AddonPlan['entries'] }
interface LibraryState { profileId: string; worlds: WorldSummary[]; installed: ManagedAddon[]; needsRecovery: boolean }
```

Full public API additions are introduced in Tasks 3, 4, and 9. Existing `Release`, `InstalledVersion`, `DownloadProgress`, and the internal `Settings.clientId` migration field stay reusable. Public account summaries gain their explicit kind. Catalog responses and managed manifests contain no executable HTML or authentication material.

The plan has two working milestones: Tasks 1–3 deliver accounts on the existing vanilla launcher; Tasks 4–9 deliver profiles and the Library. Task 10 verifies and packages the combined release. The profile/Fabric/content tasks share the interfaces above and are executed in dependency order.

---

### Task 1: Persistent local identities

**Files:** Create `src/shared/accounts.ts`, `src/main/services/account-store.ts`, `tests/main/account-store.test.ts`. Modify `src/shared/contracts.ts` only to export the new types.

**Interfaces:** `offlineUuid(name: string): string`; `AccountStore(directory).read(): Promise<AccountIndex>`; `createOffline(name): Promise<AccountIdentity>`; `rememberMicrosoft(profile): Promise<void>`; `select(kind, id): Promise<AccountIdentity>`; `remove(kind, id): Promise<void>`; `clearSelection(): Promise<void>`. `rememberMicrosoft` replaces the single remembered Microsoft summary; the store never accepts tokens.

- [ ] Write failing real-filesystem tests. Name the UUID case `it('uses the Java offline identity')` with `expect(offlineUuid('Notch')).toBe('b50ad385829d3141a2167e7d7539ba7f')`. Names of lengths 2/17 and non-ASCII/space/punctuation fail; lengths 3/16 work; `Notch` and `notch` conflict; restart preserves selection and spelling; removed selection becomes null; corrupt JSON is preserved and reported/recovered without deleting unrelated files; concurrent writes serialize.
- [ ] Run `npm test -- tests/main/account-store.test.ts`; confirm missing production behavior fails the named assertions.
- [ ] Implement the interfaces with standard MD5 name-UUID version/variant bits, a schema-versioned `accounts.json`, generated temporary files and atomic rename. Keep Microsoft metadata separate from encrypted credentials; use fresh reads/copies rather than mutable shared references.
- [ ] Re-run the targeted tests and `npm run typecheck`; require both exit 0.
- [ ] Commit only this deliverable: `feat: persist local launcher accounts`.

### Task 2: Cancellable browser OAuth and publisher configuration

**Files:** Create `src/main/services/oauth-callback.ts`, `src/main/services/auth-config.ts`, `tests/main/oauth-callback.test.ts`, `tests/main/auth-config.test.ts`. Modify `src/main/adapters/minecraft-auth.ts`, `src/main/services/accounts.ts`, `src/main/controller.ts`, `src/main/index.ts`, `src/main/window.ts`, `tests/main/window.test.ts`, `electron.vite.config.ts`, and affected auth/controller fixtures. The existing account panel can show its generic waiting/Cancel state until Task 3 replaces the account UI.

**Interfaces:** `resolveClientId(configured: string, legacy: string): string | null`; `openOAuthCallback(options: {state:string; signal:AbortSignal; timeoutMs?:number}): Promise<{redirectUri: string; code: Promise<string>; close(): Promise<void>}>`; `AuthPort.authenticate(clientId:string, openBrowser: (url: string) => Promise<void>, signal:AbortSignal): Promise<GameSession>`. Until Task 3, `GameSession` retains its current authenticated shape; Task 3 introduces the union and narrows `authenticate`/`refresh` to its Microsoft branch. Change `AccountService.signIn` and its controller caller to the browser callback together. Preserve cache serialization and Xbox/Minecraft exchange behavior.

- [ ] Write tests using a real ephemeral loopback listener. Name the adversarial case `it('accepts the real callback after wrong-state traffic')`; send a wrong-state request followed by the matching request and assert `await expect(callback.code).resolves.toBe('valid-code')`. Also test wrong path/method, duplicate parameters, replay, provider denial, browser-open failure, abort, deadline and explicit close; the socket is released on every terminal path and errors contain no sensitive callback values. Test valid configured-ID precedence, valid legacy fallback, invalid legacy ignored and no-ID null. A malformed nonempty configured ID is rejected before packaging, rather than silently selecting a different publisher identity.
- [ ] Run `npm test -- tests/main/oauth-callback.test.ts tests/main/auth-config.test.ts tests/main/window.test.ts`; observe the new failures before implementation. Use a short injected timeout in deadline tests, preserving the production `300000` default.
- [ ] Implement the callback contract with a loopback-only HTTP server and random state. Use MSAL `CryptoProvider.generatePkceCodes`, `getAuthCodeUrl`, and `acquireTokenByCode`, then the existing exchange. Add Microsoft HTTPS authorization URLs to the precise external-URL policy. Inject `ORBIT_MICROSOFT_CLIENT_ID` as public main-process build configuration; keep it out of renderer setup. Every completion/failure path closes the listener, and stale token completions are rejected by generation checks.
- [ ] Run the new tests, existing account/window tests, and type checking; require exit 0 and verify cleanup rather than merely testing the mock browser callback.
- [ ] Commit: `feat: add cancellable Microsoft browser sign-in`.

### Task 3: Account selection, local launch, and account UI

**Files:** Modify `src/main/services/accounts.ts`, `src/main/services/types.ts`, `src/main/adapters/minecraft-launcher.ts`, `src/main/controller.ts`, `src/main/index.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/shared/contracts.ts`, `src/renderer/components/AccountPanel.tsx`, `PlayView.tsx`, `SettingsView.tsx`, and `styles.css`. Update account/controller/game/renderer/E2E fixtures and tests; create `tests/main/offline-launch.test.ts`.

**Interfaces:** `AccountService.index(): Promise<AccountIndex>`, `createOffline(name)`, `select(kind,id)`, `remove(kind,id)`, `current(): AccountIdentity|null`, `session(clientId): Promise<GameSession>`, and existing cancellation/sign-out methods. `AuthPort.authenticate` and `refresh` now return `MicrosoftSession = Extract<GameSession,{kind:'microsoft'}>`; their profile must also have `kind:'microsoft'`. Add preload methods `createOfflineAccount(name)`, `selectAccount(kind,id)`, `removeAccount(kind,id)` returning snapshots. Snapshot adds `accounts: AccountIdentity[]` and `microsoftConfigured: boolean`; signed-in state contains the explicitly typed identity. Preserve `assertAuthorized()` at actual spawn.

- [ ] Write regressions for local create/select/restart/launch without an app ID; exact local name/UUID, inert token `0`, `userType:'legacy'`, empty XUID/client-ID substitutions and no unresolved placeholders in actual core-generated arguments. Name the race case `it('does not spawn after the selected offline account changes')` and assert `expect(spawns).toBe(0)` after resuming the actual delayed precheck. Require complete Microsoft tokens in its branch. Also test no local fallback after failed Microsoft sign-in, preservation of remembered Microsoft cache on local selection, cache removal on explicit Microsoft removal/sign-out, and callback cancellation on shutdown.
- [ ] Add renderer assertions for the two account choices, type labels, validation/cancel/errors and restored selection. Ordinary Settings has no client-ID field; the missing-registration state explains the publisher prerequisite and leaves offline creation enabled. Preserve unsaved-setting picker behavior.
- [ ] Run the named new/changed tests and observe the expected failures. Then implement the session union, account coordinator/store wiring, cancellation lifecycle, typed IPC and account UI. Keep credential refresh and entitlement checks confined to the Microsoft branch.
- [ ] Run `npm test`, `npm run typecheck`, `npm run test:e2e`, and `npm run build`. Require all to pass before calling the accounts milestone ready; simulated auth is not a live Microsoft result.
- [ ] Commit: `feat: support Microsoft and offline launcher accounts`.

### Task 4: Isolated game profiles with non-destructive migration

**Files:** Create `src/shared/profiles.ts`, `src/main/services/profiles.ts`, `src/renderer/components/ProfilePicker.tsx`, `tests/main/profiles.test.ts`, and `tests/renderer/profiles.test.tsx`. Modify controller/index/contracts/IPC/preload, PlayView/SettingsView/styles, launch adapter, and related controller/E2E fixtures.

**Interfaces:** `ProfileStore(directory).list(): Promise<GameProfile[]>`, `selected(): Promise<GameProfile|null>`, `migrateLegacy(root, releaseId: string|null): Promise<GameProfile|null>`, `create(input: NewProfile, libraryRoot: string, loader: Loader): Promise<GameProfile>`, `select(id)`, `rename(id,name)`, `remove(id)`. Profile IDs are generated UUIDs; names are trimmed 1–64 characters with no control characters. Preload gains `createProfile(input)`, `selectProfile(id)`, `renameProfile(id,name)`, `removeProfile(id)`. Snapshot gains profiles/selectedProfileId and `profileInstallation:'unknown'|'missing'|'installed'`; replace version-selection/installed-version fields and update consumers together.

- [ ] Write `it('defers legacy migration without release metadata')` with `await expect(store.migrateLegacy(root,null)).resolves.toBeNull()` and `expect(await readFile(worldSentinel,'utf8')).toBe('preserve')`. Also test idempotent migration, separate directories sharing a library, restored selection, rename and registration removal retaining sentinel files. Changing the default root affects only new profiles. Reject arbitrary IDs, traversal, invalid versions and immutable version/loader edits.
- [ ] Add UI tests for selecting/creating profiles, fixed version/loader information, retained-file explanation and the unavailable-release state. Run these tests to record their failures.
- [ ] Implement schema-versioned `profiles.json` with atomic serialized writes. Resolve all paths in main; new directories are `<root>/instances/<uuid>` and made recursively. Resolve releases from the trusted version service. Until Task 5, the create UI offers working Vanilla creation only; Fabric becomes available with its actual service. LaunchConfiguration explicitly receives `gameDirectory`, separate from `InstalledVersion.root`; preserve current Java/memory rules and locks.
- [ ] Run profile, controller, launch and renderer tests plus type checking. Verify actual generated `--gameDir`, assets/library paths and process cwd for the two-profile fixture.
- [ ] Commit: `feat: isolate Minecraft game profiles and preserve existing worlds`.

### Task 5: Fabric installation using verified provider downloads

**Files:** Create `src/main/services/fabric.ts`, `src/main/adapters/fabric-meta.ts`, `tests/main/fabric.test.ts`, and `tests/fixtures/fabric.ts`. Modify `src/main/services/network.ts`, `downloads.ts`, `src/main/adapters/minecraft-installer.ts`, profile orchestration, ProfilePicker, and download/installer tests.

**Interfaces:** `UrlPolicy = (url:string)=>void`; optional final `policy: UrlPolicy = assertOfficialUrl` parameter on `downloadFile`. `FabricService.listLoaders(minecraftVersion): Promise<{version:string;stable:boolean}[]>`; `ensure(base:Release, loaderVersion:string, root:string, onProgress): Promise<InstalledVersion>`; `inspect(base,loaderVersion,root): Promise<InstalledVersion|null>`. Keep vanilla InstallService signatures unchanged. Fixture `fabricFixture()` extends the existing vanilla fixture with child metadata and tiny real library bytes.

- [ ] Write `it('uses the base client JAR for an inherited Fabric launch')`; after installing the child fixture, parse it with the actual core and assert `expect(resolved.minecraftVersion).toBe(fixture.release.id)` plus that generated launch arguments reference the base JAR and Fabric main class. Also test stable loader pinning, validated inheritance/child identity, extra libraries, corrupt/retryable artifacts and progress. Core's Fabric Maven size sentinel `-1` becomes unknown only in the Fabric adapter; other negative/non-integer sizes and malformed official metadata remain rejected. Default downloads must still reject Fabric/Modrinth URLs.
- [ ] Run Fabric/installer/download tests and confirm these behaviors fail first.
- [ ] Implement the Fabric Meta adapter using the pinned `/v2/versions/loader/<game>/<loader>/profile/json` profile and official Maven sources. Ensure vanilla first; stage/record the child metadata and expected local integrity information, then inspect/download resolved extra libraries. Correct vanilla adapter client placement to `getVersionJar(version.minecraftVersion)`. Preserve hashes/sizes when supplied and identify TLS-only artifacts honestly. Reject unexpected inheritance, unsupported releases and unsafe provider hosts/paths.
- [ ] Wire profile creation to select the newest stable compatible loader and persist its exact version. Orchestration dispatches inspection/installation by selected loader; launching still parses the actual child version. Enable Fabric creation only after these checks exist.
- [ ] Run Fabric, installer, profile, controller and launch tests; run type checking/build. Confirm actual generated Fabric main class/classpath, with no fabricated successful game process.
- [ ] Commit: `feat: install and launch pinned Fabric game profiles`.

### Task 6: Modrinth catalog and deterministic dependency plans

**Files:** Create `src/shared/addons.ts`, `src/main/adapters/modrinth.ts`, `src/main/services/addon-dependencies.ts`, `tests/main/modrinth.test.ts`, `tests/main/addon-dependencies.test.ts`, and `tests/fixtures/modrinth.ts`; extend network policy/types as needed.

**Interfaces:** `ModrinthCatalog(fetcher, cacheDirectory)` exposes `search(query:CatalogQuery):Promise<SearchPage>`, `project(id):Promise<CatalogProject>`, `versions(projectId,target:AddonTarget):Promise<CatalogVersion[]>`, `version(versionId):Promise<CatalogVersion>`. `resolveAddons(request:AddonRequest,target:AddonTarget,installed:ManagedAddon[],catalog):Promise<{versions:CatalogVersion[];optionalDependencies:string[]}>`. Fixture factory supplies source-shaped API JSON, expected files and a recording FetchPort; no production defaults point at fixtures.

- [ ] Write `it('retains datapack kind from v2 search context')`; for a source-shaped hit with `project_type:'mod'`, assert `expect(result.projects[0].kind).toBe('datapack')`. Also test exact URLSearchParams facets per kind, pagination and non-HTML metadata. Fabric mod/Iris versions use `fabric`; shader versions use `iris`; resource/data versions use their own tags. Reject incompatible results even if the server filter was sent. Test malformed JSON, 404/429, network failures, bounded cached results and no fabricated entries.
- [ ] Test pinned-version/project dependencies, deduplication, deterministic latest compatible published selection, cycle/conflict detection, incompatible installed declarations and dependency content kinds. Before replacing a shared dependency, check the declared requirements of existing enabled catalog dependents using their recorded version IDs. Optional/embedded dependencies are not installed automatically. Use actual primary files with valid SHA-512/size; reject ambiguous usable files, invalid hashes/sizes/hosts and unsafe names.
- [ ] Run the two new suites to observe failures; implement against `https://api.modrinth.com/v2` with User-Agent `ronaldogoat20202-oss/Orbit-Launcher/0.2.0`. Search facets use `project_type:<kind>`, `versions:<game>`, plus `categories:fabric` for mods. Normalize returned kinds using requested context and version loaders; do not trust v2 `project_type` alone. Cache non-secret validated responses and mark cached search results.
- [ ] Run catalog/dependency tests and type checking. A live provider check is separate from fixture success and can remain blocked with an explicit network diagnosis.
- [ ] Commit: `feat: browse compatible Modrinth content and resolve dependencies`.

### Task 7: Bounded local imports and per-world destinations

**Files:** Create `src/main/services/addon-imports.ts`, `src/main/services/worlds.ts`, `tests/main/addon-imports.test.ts`, `tests/main/worlds.test.ts`, and `tests/fixtures/archives.ts`.

**Interfaces:** `inspectAddon(path:string,kind:AddonKind,target:AddonTarget):Promise<{name:string;kind:AddonKind;sha512:string;size:number;compatibility:'declared'|'unverified'}>`; `listWorlds(profile:GameProfile):Promise<WorldSummary[]>`; `resolveWorld(profile,worldId):Promise<string>`. `zipFixture(entries:Record<string,string|Uint8Array>):Buffer` is a test utility producing real small stored ZIPs; use a test-only writer or checked ZIP fixture, not a mock archive parser.

- [ ] Test valid Fabric JAR, resource/data ZIP and shader ZIP; malformed/wrong-kind files; unknown compatibility; metadata bombs/entry count limits; import source bytes remain unchanged. Set limits to 100000 entries, 262144 bytes per inspected metadata entry and 1048576 total metadata bytes. Check existing archive-reader side effects before selecting its API; never execute or unpack user archive contents.
- [ ] Write `it('does not list a world symlink outside the profile')` and assert `expect(await listWorlds(profile)).not.toContainEqual(expect.objectContaining({name:'Escaped'}))` for a real escaped link. Also test direct worlds with regular `level.dat`, no-world state, wrong-profile IDs and traversal. A returned world ID is the encoded validated basename, never an arbitrary path accepted from the renderer; resolve it afresh before every mutation.
- [ ] Run both new suites and observe failures; implement bounded inspection and world lookup. Use installed ZIP tooling as a direct pinned dependency if needed, with lockfile update only at implementation time. Compute local SHA-512 and label compatibility honestly; imports do not invent catalog IDs or dependencies.
- [ ] Run import/world tests and type checking. Include real Windows fixtures/path assertions; handle symlink creation limitations explicitly in Windows tests rather than replacing the containment assertion with a trivial pass.
- [ ] Commit: `feat: validate local add-ons and target existing worlds`.

### Task 8: Managed content transactions, enable/disable, updates and recovery

**Files:** Create `src/main/services/addons.ts`, `addon-manifest.ts`, `addon-transactions.ts`, `tests/main/addons.test.ts`, and `tests/main/addon-transactions.test.ts`. Reuse fixtures from Tasks 5–7; extend provider URL policies without widening the official default.

**Interfaces:** `AddonService(catalog,dependencies,imports,worlds,fetcher)` exposes `library(profile):Promise<LibraryState>`, `plan(profile,request):Promise<AddonPlan>`, `install(profile,planId,onProgress):Promise<void>`, `prepareImport(profile,path,kind,worldId?):Promise<ImportPreview>`, `commitImport(profile,previewId,allowUnverified,onProgress)`, `setEnabled(profile,addonId,enabled)`, `remove(profile,addonId)`, `update(profile,addonId,onProgress)`, `recover(profile):Promise<void>`, `assertReady(profile):Promise<void>`. All IDs resolve through main-owned stores/plans; profile/context mismatch is rejected.

- [ ] Write real-filesystem tests for remote hash/size failures and retries, all four destinations, Iris routed to mods, data-pack world association, explicit unknown-import confirmation, enable/disable, dependency-protected remove/disable, refusal to enable a dependent with disabled required dependencies, and compatible-only updates. In `it('preserves a modified managed file on remove')`, assert `await expect(service.remove(profile,addonId)).rejects.toThrow(/changed|conflict/i)` and that the user-modified bytes remain identical. Repeat the conflict behavior for update/recovery; cover Windows case collisions and reserved names.
- [ ] Write `it('blocks launch until an interrupted transaction is recovered')`; after failure following the first move, assert `await expect(service.assertReady(profile)).rejects.toThrow(/repair|recover/i)`, then recover and verify actual files/manifest. Also test interruption after staging, preservation of unrelated or modified files, and stale plan/import rejection after profile change, deletion or source modification.
- [ ] Run the new suites to observe failures. Implement schema-versioned manifests under `<gameDirectory>/.orbit`, with disabled/staging files outside active folders and journals written before commit. Stage and verify the complete dependency plan first; update manifests atomically. Canonicalize destinations with containment checks, compare current hashes before overwrite/removal, and preserve interrupted/conflicted work for explicit recovery. Do not modify in-game pack selection files.
- [ ] Implement Iris compatibility requirements for remote and local shader installation. A prepared plan includes compatible Iris/dependencies when missing; local import previews expose those in `requiredAddons` before confirmation. Unsupported versions or conflicting declared rendering mods remain unavailable. Imported shaders with unknown declarations still require compatible Iris and explicit unverified-import confirmation. Local imports without catalog IDs have no catalog-update action; replacing one requires a new import with the same conflict checks.
- [ ] Run content/transaction/dependency/import/world/download tests and type checking. Assert actual disk bytes and manifests, not only mocked call counts.
- [ ] Commit: `feat: manage add-on installations with safe recovery`.

### Task 9: Typed Library operations and complete desktop flows

**Files:** Create `src/renderer/components/LibraryView.tsx`, `AddonDetails.tsx`, `ImportDialog.tsx`, and `tests/renderer/library.test.tsx`. Modify contracts/IPC/preload, controller/index, App/styles, and E2E/IPC/controller fixtures and tests. Keep network/archive/transaction implementation in services, not controller or UI.

**Interfaces:** Add preload methods `getLibrary():Promise<LibraryState>`, `searchAddons({kind,query,offset,limit}):Promise<SearchPage>`, `addonVersions(projectId):Promise<CatalogVersion[]>`, `previewAddon(request):Promise<AddonPlan>`, `installAddon(planId):Promise<void>`, `previewImport(kind,worldId?):Promise<ImportPreview|null>`, `installImport(previewId,allowUnverified):Promise<void>`, `setAddonEnabled(id,enabled)`, `removeAddon(id)`, `updateAddon(id)`, and `repairAddons()`. Main derives the selected profile/target and native file-picker path. Use one operation lock for install/content/profile/root changes and game launch; extend operation state with real content progress. Library state is refreshed after successful mutation.

- [ ] Write controller/IPC tests for rejected malformed arguments, untrusted frames, caller-supplied paths/URLs, content actions during game/another mutation, profile-switch races, canceled native import, and a pending transaction preventing actual process spawn. Confirm account changes still invalidate delayed spawns and no renderer data contains credentials.
- [ ] Write Library UI tests for the four tabs, query/pagination, compatibility/dependency details, selected-world requirement, Iris requirement, installed actions/update/recovery, and in-game activation instructions. In `it('ignores a search from the previous profile')`, resolve the old deferred result after a profile switch and assert `expect(screen.queryByText('Old profile result')).not.toBeInTheDocument()`. Cover the analogous import confirmation race, cached/offline/error/retry/no-world/unsupported cases and keyboard operation.
- [ ] Run the changed suites and observe expected failures; implement native import selection, validated API methods, thin orchestration, and the Library UI. For late/canceled results use a request-generation/context check rather than trusting the latest resolved Promise. Do not render project-supplied HTML. Keep mutations disabled with a clear reason while busy/running.
- [ ] Update E2E tests to cover offline account + Fabric profile + simulated add-on install, per-world data-pack selection, and honest no-bridge/empty states. Maintain the 900×650 minimum layout with no horizontal overflow. Run `npm test`, `npm run typecheck`, `npm run test:e2e`, and `npm run build`; require all exit 0.
- [ ] Commit: `feat: add the desktop mods and packs library`.

### Task 10: Verify and deliver the Windows update

**Files:** Modify `README.md`, `BUILD-REPORT.md`, `.github/workflows/windows.yml`, `package.json` and `package-lock.json` as required for the 0.2.0 release. Update the approved spec/this plan's completion status only when the corresponding implementation evidence exists. Review `electron-builder.yml` for unchanged x64 packaging behavior.

**Interfaces:** Preserve `npm ci`, `npm run dev`, `npm test`, `npm run typecheck`, `npm run test:e2e`, `npm run build`, `npm run dist:win`, and `npm run dist:portable`. GitHub artifact remains `Orbit-Launcher-Windows-x64`; its installer is `Orbit-Launcher-0.2.0-Setup.exe`. The public Microsoft ID may come from a repository/environment variable and must be validated if supplied; an absent value still produces a usable offline-capable build.

- [ ] Document tested first-run/offline/Microsoft-registration/profile/Library steps, pack activation, file retention, dependency/transaction recovery, and manual Windows checks. Bump the application and package-lock version together to 0.2.0 and update visible version metadata from the same source. Preserve pinned CI actions and checksum/TLS protections.
- [ ] Run the complete local type/service/renderer/E2E/build checks after the final changes. Start the produced Electron app and verify its real preload/snapshot plus account/profile/Library availability; clearly separate this from browser-injected fixtures and actual gameplay. Record counts, command exit status and material warnings.
- [ ] Attempt live official/Fabric/Modrinth requests through current permitted network routes. Diagnose blocked destinations and save additive setup/network changes only if required, preserving existing configuration; a saved draft is not an applied policy. Test real Microsoft sign-in only with an actual registered Orbit client ID and owning account, without requesting secrets/passwords in chat.
- [ ] Use Native's one fresh whole-change reviewer after implementation/tests. Fix confirmed findings with regression tests, rerun affected checks, and export implementation decisions/limitations to BUILD-REPORT before cleaning execution-only state. Do not expand into per-task reviewer loops.
- [ ] Commit the verified release and push the authorized `work` branch without force-push or a merge to `main`. Monitor the Windows workflow, diagnose/fix failures, and verify a successful run with the expected installer artifact. If GitHub API access is blocked, the already validated public Actions HTML route can confirm run state/artifact existence; do not extract proxy credentials.
- [ ] Give the user the exact successful Actions run/artifact link with GitHub sign-in, ZIP extraction and Setup.exe steps. Do not call a workspace preview downloadable or claim Windows execution, real login, mods/shader rendering, or a world was tested without the manual evidence. Finish with remaining external prerequisites stated plainly.

## Plan self-review and handoff

Coverage: account behavior and lifecycle → Tasks 1–3; migration/profiles → Task 4; provider/Fabric game files → Task 5; catalog/dependencies → Task 6; archives/worlds → Task 7; managed state/recovery → Task 8; UI/IPC/locks → Task 9; network/setup/docs/review/Windows delivery → Task 10. Each Review Focus condition has an explicit owning test. Public shapes and service signatures above are the cross-task contract; changes require updating dependent tests/consumers together.

The written specification is approved. The implementation plan awaits user review; preserve the previously selected Native execution method after that review. No feature code has been implemented by writing this plan.
