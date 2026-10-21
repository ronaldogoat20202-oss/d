# Orbit Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a testable Electron launcher that installs and launches vanilla Minecraft Java Edition on Windows x64 using the user's own Microsoft application registration and account.

**Architecture:** A sandboxed React renderer uses a typed preload bridge to access main-process settings, authentication, installation, Java, and launch services. Service adapters contain the external library APIs; one controller coordinates operations and publishes sanitized snapshots. Account state is independent of installation state, and automated tests use injected transports and process runners rather than fake production data.

**Tech Stack:** Node 24 LTS, npm, Electron, electron-vite, React, TypeScript, Vitest, Testing Library, Playwright, electron-builder, `@azure/msal-node`, `@xmcl/core`, `@xmcl/installer`, and `@xmcl/user`.

**Spec:** [Orbit Launcher design](../specs/2026-10-21-orbit-launcher-design.md). The user requested continuing after receiving the written specification; its design is approved for planning. This plan still needs review and an execution-method selection before implementation.

## Global Constraints

- The initial package targets Windows x64. Development and automated tests must also run in the existing Linux cloud checkout.
- Use that checkout directly; each cloud task is already isolated, so do not create a Git worktree unless the user requests one.
- Use the installed Node 24 LTS toolchain for development. Pin selected dependency versions during implementation and confirm their actual APIs before using them.
- The maximum-heap setting defaults to 2048 MiB, allows at least 1024 MiB, and must not exceed 75% of physical memory; reduce the default to that upper limit when needed, or explain insufficient memory if the upper limit is below the minimum.
- The Windows x64 package requires a 64-bit x86 JVM and uses matching x64 native libraries; reject 32-bit and ARM JVMs with a clear error.
- Permit installation without signing in or configuring Java; require a valid account and compatible Java only for launch.
- Never persist credentials using Linux's plaintext `basic_text` backend.
- Do not present invented accounts, installed versions, download progress, or successful launches as live data.
- Game files come from official services. Fabric, Forge, mod management, custom accounts, automatic launcher updates, multiple game profiles, and a store are outside the first release.
- Keep cloud-verified behavior, mocked test results, produced artifacts, and Windows/account manual results distinct.
- Preserve TLS verification, official hashes, existing user files, and existing network-policy entries. Do not push or publish as part of local implementation.

## Review Focus

- Renderer IPC from an unexpected frame or arbitrary origin must not reach filesystem, account, or process services: Task 1 guard tests.
- Truncated settings JSON and a selected Java path containing spaces must not destroy settings or invoke a shell: Task 2 recovery/probe tests.
- A download interrupted after partial writes, or a wrong-hash artifact already on disk, must never count as installed: Task 3 integrity/retry tests.
- Changing client ID or signing out during authentication/refresh must invalidate in-flight results, without writing an old session back: Task 4 generation tests.
- Two overlapping install/launch requests and a child-process spawn error must release busy state safely and avoid a second process: Task 5 controller tests.

---

## File structure and shared contracts

Use the existing `/workspace/d` checkout. Create only the files needed by the tasks below; `dist/`, `out/`, `release/`, dependency folders, local caches, Playwright outputs, and user settings are ignored. Test fixtures belong under `tests/fixtures/`, never in production services.

- Root: `package.json`, `package-lock.json`, `.gitignore`, `tsconfig.json`, `electron.vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `electron-builder.yml`, `README.md`.
- `src/shared/contracts.ts`: serializable public DTOs and `LauncherApi`; never tokens.
- `src/main/index.ts`, `window.ts`, `ipc.ts`: app lifecycle, secure window, trusted IPC routing.
- `src/preload/index.ts`: allowlisted methods and event subscription; no generic invoke or filesystem API.
- `src/main/services/{settings,java,versions,installer,accounts,credentials,game,logs}.ts`: one responsibility per file.
- `src/main/adapters/{minecraft-installer,minecraft-auth,minecraft-launcher}.ts`: pinned external-library integrations.
- `src/main/controller.ts`: application state and operation coordination; `src/main/errors.ts`: public errors and safe failure mapping.
- `src/renderer/index.html`, `main.tsx`, `App.tsx`, `styles.css`, `components/{PlayView,SettingsView,LogsView,AccountPanel}.tsx`: real desktop UI.
- `tests/main/`, `tests/renderer/`, `tests/e2e/`, `tests/fixtures/`: service, UI, browser-integration, and small artifact fixtures.
- `.github/workflows/windows.yml`: Windows build, tests, and installer artifact upload without publishing.

Public DTOs in `contracts.ts`:

- `Settings = { clientId: string; javaPath: string; gameDirectory: string; maxMemoryMiB: number }`.
- `Release = { id: string; url: string; sha1: string; releasedAt: string }`; releases contain only official manifest entries of type `release`.
- `AccountSummary = { id: string; name: string }`; `AccountState` uses the `status` discriminant with `signedOut`, `signingIn` with optional `device: DeviceInstructions`, and `signedIn` with `profile: AccountSummary`.
- `DeviceInstructions = { userCode: string; verificationUri: string; expiresAt: number }`.
- `DownloadProgress = { completedBytes: number; totalBytes: number | null; message: string }`; unknown totals render an indeterminate indicator.
- `Operation` uses the `phase` discriminant with `idle`, `installing` with `versionId: string` and `progress: DownloadProgress`, `launching` with `versionId: string`, and `running` with `versionId: string`.
- `PublicError = { code: string; message: string }`; `LogEntry = { time: number; level: 'info' | 'error'; message: string }`.
- `Snapshot = { settings: Settings; account: AccountState; releases: Release[]; selectedVersionId: string | null; installedVersionIds: string[]; operation: Operation; logs: LogEntry[]; error: PublicError | null; offline: boolean }`.

Expose `window.orbit: LauncherApi` with `getSnapshot(): Promise<Snapshot>`, `saveSettings(patch: Partial<Settings>): Promise<Snapshot>`, `selectVersion(id: string): Promise<Snapshot>`, `signIn(): Promise<void>`, `cancelSignIn(): Promise<void>`, `signOut(): Promise<void>`, `chooseJava(): Promise<Snapshot>`, `chooseGameDirectory(): Promise<Snapshot>`, `install(): Promise<void>`, `launch(): Promise<void>`, `copyLogs(): Promise<void>`, and `subscribe(listener: (state: Snapshot) => void): () => void`.

The main-only types are `JavaRuntime = { executable: string; major: number; architecture: 'x64' | 'ia32' | 'arm64' | 'unknown' }`, `InstalledVersion = { id: string; root: string; javaMajor: number }`, `GameSession = { accessToken: string; profile: AccountSummary; clientId: string; xuid: string }`, and `RuntimePort = { platform: NodeJS.Platform; architecture: string; totalMemoryBytes: number }`. Keep these under `src/main/services/types.ts`. Production runtime values come from Node/Electron; tests inject deterministic values.

### Task 1: Runnable secure application shell

**Files:** Create root npm/TypeScript/Vite/Vitest configuration, `src/shared/contracts.ts`, `src/main/{index,window,ipc,errors}.ts`, `src/main/services/types.ts`, `src/preload/index.ts`, renderer entry points/App/styles, `tests/main/window.test.ts`, `tests/main/ipc.test.ts`, and `tests/renderer/shell.test.tsx`.

**Interfaces:** Produces the public contracts above, `createWindowOptions(): BrowserWindowConstructorOptions`, `assertTrustedSender(event: IpcMainInvokeEvent, window: BrowserWindow, expectedUrl: string): void`, and a typed IPC router. The initial shell reports actual unconfigured/empty state and no invented versions or account; Tasks 2–5 replace its bootstrap state with the controller.

- [x] **Step 1:** Create the minimal npm test/build harness and install exact dependency versions into a lockfile. Query stable package metadata and check Node/Electron compatibility. Use `NPM_CONFIG_CACHE=/workspace/.cache/npm` in the cloud because `/home/agent/.npm` is unavailable. Start with shell/testing dependencies; install service dependencies in the tasks that use them. Do not copy an old launcher's authentication defaults.
- [x] **Step 2:** Write tests named `opens an isolated sandboxed renderer`, `rejects unexpected IPC frames and origins`, `exposes no generic invoke channel`, and `shows real empty state and working Play Settings Logs navigation`. Assert `nodeIntegration === false`, `contextIsolation === true`, `sandbox === true`; reject both a foreign frame and a URL outside the loaded app; assert no account name, installed version, or fabricated progress exists.

  Test contract: `expect(createWindowOptions().webPreferences).toMatchObject({ nodeIntegration: false, contextIsolation: true, sandbox: true })`; `expect(() => assertTrustedSender(foreignFrameEvent, window, expectedUrl)).toThrow()`.
- [x] **Step 3:** Run `npm test -- tests/main/window.test.ts tests/main/ipc.test.ts tests/renderer/shell.test.tsx`; confirm failure is the missing implementation, not a test-runner configuration error.
- [x] **Step 4:** Implement the shell and guard signatures. Give the app a normal native window frame, dark charcoal/teal styling, semantic navigation, keyboard focus styles, a restrictive CSP, and local bundled assets. Restrict navigation/new-window requests; any external authentication URL must be validated in the main process. Ensure subscriptions return a cleanup callback. Add `dev`, `typecheck`, `test`, `build`, `start`, `test:e2e`, and later `dist:win` scripts with predictable exit statuses.
- [x] **Step 5:** Run the targeted tests, `npm run typecheck`, and `npm run build`. Start the desktop window when a display is available; otherwise state that headful Electron execution is pending and use the renderer tests for the tested UI behavior.
- [x] **Step 6:** Commit the shell and harness with `feat: add secure Orbit desktop shell`.

### Task 2: Persistent settings and compatible Java selection

**Files:** Create `src/main/services/{settings,java}.ts`, `src/renderer/components/SettingsView.tsx`, `tests/main/settings.test.ts`, `tests/main/java.test.ts`, `tests/renderer/settings.test.tsx`; modify IPC/App integration.

**Interfaces:** Consumes `Settings`, `JavaRuntime`, and `RuntimePort`. Produces `SettingsStore.read(): Promise<Settings>`, `SettingsStore.update(patch: Partial<Settings>): Promise<Settings>`, `JavaService.detect(): Promise<JavaRuntime[]>`, and `JavaService.verify(executable: string, requiredMajor: number): Promise<JavaRuntime>`. Inject `userDataDirectory`, runtime info, and Java execution for testing.

- [x] **Step 1:** Write tests for first-run defaults, atomic persistence/restart, unknown-setting rejection, corrupted JSON recovery without overwriting the original, an unwritable directory, dialog cancellation, missing executable, wrong Java major, `ia32`/`arm64` rejection, and a Java path containing spaces passed as one executable argument. Assert heap defaults/caps from the global constraints; reject non-integer, below-minimum, and above-cap values. A malformed client ID is reported without requiring one for installation.

  Test contract with an 8 GiB runtime: `expect((await store.read()).maxMemoryMiB).toBe(2048)`; `await expect(store.update({ maxMemoryMiB: 1023 })).rejects.toThrow()`; `await expect(store.update({ maxMemoryMiB: 6145 })).rejects.toThrow()`; `await expect(java.verify('C:\\Java 21\\bin\\java.exe', 21)).rejects.toThrow(/64.bit/)` for an injected `ia32` probe.
- [x] **Step 2:** Run `npm test -- tests/main/settings.test.ts tests/main/java.test.ts tests/renderer/settings.test.tsx`; inspect the expected missing-service failures.
- [x] **Step 3:** Implement the store with atomic replace and retained backup on corrupt input. Default game files to `<app.getPath('userData')>/minecraft`; keep preference changes outside source. Validate the public client ID as an empty-or-UUID value and paths as absolute strings without NUL characters. Round the memory cap down to whole MiB. Probe Java with shell disabled using version/property output; detect version and JVM architecture rather than host architecture, and require the metadata's exact Java major as the initial compatibility policy. Add file/directory-picker IPC and saved settings controls with inline errors; never render the public client ID as a password or request a secret.
- [x] **Step 4:** Run the targeted tests, `npm run typecheck`, and `npm run build`; manually verify settings navigation and visible validation using the browser-test bridge when desktop execution is unavailable.
- [x] **Step 5:** Commit with `feat: persist launcher settings and validate Java`.

### Task 3: Official versions and verified game installation

**Files:** Create `src/main/services/{versions,installer}.ts`, `src/main/adapters/minecraft-installer.ts`, `tests/main/versions.test.ts`, `tests/main/installer.test.ts`, and small manifests/artifacts under `tests/fixtures/`; modify PlayView when it is introduced in Task 5 through the shared contracts only.

**Interfaces:** Produces `VersionService.list(): Promise<{ releases: Release[]; latestReleaseId: string; cached: boolean }>`, `VersionService.requiredJavaMajor(release: Release): Promise<number>`, `InstallService.inspect(release: Release, root: string): Promise<InstalledVersion | null>`, and `InstallService.ensure(release: Release, root: string, onProgress: (progress: DownloadProgress) => void): Promise<InstalledVersion>`. Inject an HTTPS transport and installer runtime; account and Java services are not dependencies.

- [x] **Step 1:** Write tests for release-only filtering/latest selection, bounded request timeouts and stale-cache fallback, official manifest entry/hash validation, library OS/architecture rules, path traversal rejection, hash/size mismatch, interrupted downloads, retry after interruption, a corrupt pre-existing artifact, and unknown progress totals. Assert no installed result is produced until all required artifacts validate; require successful retry using a tiny fixture transport. Test that manifest IDs cannot escape the selected game directory.

  Test contract: `await expect(installer.ensure(release, root, onProgress)).rejects.toThrow(/integrity|checksum/)` for a corrupt asset; `expect(await installer.inspect(release, root)).toBeNull()` after interruption; after retry, `expect((await installer.inspect(release, root))?.id).toBe(release.id)`. Verify fixture bytes on disk independently of the injected transport's completion signal.
- [x] **Step 2:** Run `npm test -- tests/main/versions.test.ts tests/main/installer.test.ts`; confirm failures exercise missing integrity/orchestration behavior.
- [x] **Step 3:** Pin and inspect the actual `@xmcl/installer` API, then implement one adapter around its supported install-manifest/workflow interface. Registry evidence during planning: installer `6.3.6`, core `2.16.2`, and user `4.4.2` require Node >=20. The installer uses declarative `resolve*InstallFile`/`executeInstallManifest`/`executeInstallWorkflow` exports; older `install()` examples are stale. Fetch `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json` explicitly rather than the library's legacy default. Install verified version JSON, parse with `Version.parse()`, install client/libraries/asset index, then resolve and install asset objects. Attach the manifest SHA-1 to the JSON descriptor, set `trustExistingSize: false`, and check size separately when both hash and size exist. Inject staged `.part` downloads with verification before atomic rename; the default downloader writes directly to final paths. Restrict fallback downloads to URLs supplied by official metadata rather than the library's generic Maven mirror. Set the target OS/architecture explicitly; validate resolved paths stay below the game root. Inspect the chosen version's runtime requirement, using Java 8 only when historical metadata omits one. Never use guessed or removed APIs.
- [x] **Step 4:** Run targeted tests and type/build checks. Make a read-only real manifest request. If the cloud still rejects the official host, preserve the current custom allowlist and save only required additions through the environment draft; continue fixture-based checks while runtime policy is pending. Do not describe the fixture install as a live Minecraft download.
- [x] **Step 5:** Commit with `feat: install official Minecraft releases with verification`.

### Task 4: Microsoft authentication and protected credential lifecycle

**Files:** Create `src/main/services/{accounts,credentials}.ts`, `src/main/adapters/minecraft-auth.ts`, `src/renderer/components/AccountPanel.tsx`, `tests/main/accounts.test.ts`, `tests/main/credentials.test.ts`, `tests/renderer/account.test.tsx`; modify IPC subscriptions.

**Interfaces:** Consumes `Settings.clientId` and public account/device DTOs. Produces `AccountService.current(): AccountSummary | null`, `AccountService.signIn(clientId: string, onCode: (code: DeviceInstructions) => void, signal: AbortSignal): Promise<AccountSummary>`, `AccountService.session(clientId: string): Promise<GameSession>`, `AccountService.signOut(): Promise<void>`, and `CredentialStore.load(): Promise<string | null>`, `CredentialStore.save(serializedCache: string): Promise<boolean>`, `CredentialStore.clear(): Promise<void>`. A false `save` means memory-only storage; it must not write cleartext.

- [x] **Step 1:** Write tests for missing/invalid client ID, device-code success, expiry, cancellation, timeout, Xbox/XSTS denial, missing Minecraft entitlement/profile, refresh failure, sign-out during pending authentication, changing client ID during refresh, and storage keyed to client ID. For every failure assert sanitized error messages and no secret fields in public account events. Assert encrypted Windows persistence, corrupted cache recovery, and zero plaintext writes with `basic_text` or unavailable encryption.

  Test contract: `await expect(accounts.signIn('', onCode, signal)).rejects.toThrow(/client ID/)`; `expect(await credentials.save('sensitive-cache')).toBe(false)` with `basic_text`; assert the filesystem writer was never called in that case. Start a delayed sign-in, call `await accounts.signOut()`, resolve the old request, and assert `expect(accounts.current()).toBeNull()`.
- [x] **Step 2:** Run `npm test -- tests/main/accounts.test.ts tests/main/credentials.test.ts tests/renderer/account.test.tsx`; inspect failures before implementing the service.
- [x] **Step 3:** Pin MSAL and the user library and check exported APIs. Configure a public client for consumer accounts with `XboxLive.signin` and `offline_access`; never use a bundled third-party client ID. Open only the validated Microsoft device-verification URL. Use `MicrosoftAuthenticator.acquireXBoxToken()` and `loginMinecraftWithXBox()`, then `MojangClient.checkGameOwnership()` and `getProfile()` behind the adapter; extract the returned XUID and retain it only in the main-process session along with the public client ID. The composed Xbox method also uses `device.auth.xboxlive.com`; include that hostname if required by actual network requests. Use cancellation plus generation guards so stale requests cannot restore a signed-out/reconfigured account. Persist only encrypted MSAL cache material, refresh the Minecraft session before use, and clear invalid credentials after refresh failure. Expiration in the UI is driven by returned timestamps, not invented countdown success.
- [x] **Step 4:** Run targeted tests and type/build checks. Attempt live sign-in only with an intentionally configured application ID, approved service access, and a user-owned account; otherwise document it as an external prerequisite and keep the UI usable. Never ask for passwords or secret values in chat.
- [x] **Step 5:** Commit with `feat: add Microsoft account sign-in and secure cache`.

### Task 5: Integrated Play workflow, child process, and safe logs

**Files:** Create `src/main/{controller}.ts`, `src/main/services/{game,logs}.ts`, `src/main/adapters/minecraft-launcher.ts`, `src/renderer/components/{PlayView,LogsView}.tsx`, `tests/main/{controller,game,logs}.test.ts`, `tests/renderer/play.test.tsx`, `tests/e2e/launcher.spec.ts`, and `playwright.config.ts`; finish App and main-process wiring.

**Interfaces:** Consumes Task 2–4 services. Produces `launchGame(input: { settings: Settings; version: InstalledVersion; session: GameSession; onLog: (text: string) => void; onExit: (code: number | null) => void }): Promise<ChildProcess>`, `LogService.append(level: 'info' | 'error', text: string): void`, `LogService.entries(): LogEntry[]`, `Controller.snapshot(): Promise<Snapshot>`, `Controller.subscribe(listener: (state: Snapshot) => void): () => void`, and controller methods corresponding exactly to `LauncherApi` actions. `getSnapshot` maps to `snapshot`; only the preload offers the public `subscribe` wrapper.

- [x] **Step 1:** Write controller/game/log tests proving installation works without sign-in/Java; launch requires valid installed files, compatible Java, memory, and a refreshed account; Java arguments preserve paths with spaces and shell execution is disabled; tokens/headers/authenticated arguments are redacted; logs retain at most 1000 entries, with each message bounded to 4096 characters. Test duplicate clicks, install-versus-launch overlap, attempts to change the game root or Java while busy, child spawn rejection/error, nonzero exit, successful exit, and cleanup of subscriptions. Assert every failed launch unlocks the controller and never creates a second process.

  Test contract: `await Promise.allSettled([controller.install(), controller.install()])` calls the installer once; after a simulated spawn error, `expect((await controller.snapshot()).operation.phase).toBe('idle')`; `expect(JSON.stringify(logs.entries())).not.toContain(session.accessToken)`. Validate modern client-ID/XUID argument substitution and reject empty authenticated credentials rather than allowing the core library's Steve/offline fallback.
- [x] **Step 2:** Write renderer/E2E tests using a test-only injected `LauncherApi`: select release -> Install -> real fixture progress event -> installed with missing-account explanation -> sign-in/settings satisfied -> Play -> running -> exit. Also test offline first run with no cached manifest, cached installed releases, expired device code, a failed install with Retry, keyboard navigation, and empty/copyable sanitized logs. Inject fixtures only in test entry points; production must always use the real preload.
- [x] **Step 3:** Run `npm test -- tests/main/controller.test.ts tests/main/game.test.ts tests/main/logs.test.ts tests/renderer/play.test.tsx` and `npm run test:e2e`; confirm failures trace to missing orchestration, not absent fixtures or browser setup.
- [x] **Step 4:** Implement the controller with one operation lock, separate account state, explicit selected release, immutable sanitized snapshots, and error-to-action mapping. Refresh the installation inspection before launch and only set `running` after a successful process spawn. Reject conflicting settings/version changes during an operation. When a validated settings update changes client ID, invalidate in-flight authentication and call `accounts.signOut()` before publishing the new configuration. Use core `launch()` so native extraction/prechecks run; pass `gameProfile`, `accessToken`, explicit Java/memory/platform values, and an injected spawn guard. For pinned core `2.16.2`, resolve modern substitutions using `features: { orbit_auth: { clientid: session.clientId, auth_xuid: session.xuid } }`; the implementation spreads feature-object values into its substitution map. Omit `userType` to preserve its Microsoft default. Reject unresolved `${...}` argument placeholders, missing session values, and any attempt to enable a shell at the spawn boundary. Do not log the raw options/argument array; redact known session tokens and common token/header patterns before bounded logging or clipboard output. Connect the full Play, Settings, Account, and Logs interface, real subscriptions, and native dialogs. Handle window closure without silently deleting or killing unrelated processes.
- [x] **Step 5:** Run all unit/renderer tests, typecheck, build, and E2E. Launch the app locally when desktop facilities permit. Capture a screenshot of the working rendered UI for visual inspection; verify small-window layout and teal focus contrast. Report browser E2E and headful Electron results separately.
- [x] **Step 6:** Commit with `feat: connect install and play workflow with launch logs`.

### Task 6: Windows installer, reproducible setup, and test instructions

**Files:** Create `electron-builder.yml`, `.github/workflows/windows.yml`, and `README.md`; finish package scripts, app resources needed by packaging, and ignored output paths. Save necessary install/start instructions in the cloud configuration draft after testing them.

**Interfaces:** Produces `npm ci`, `npm run dev`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`, `npm start`, and `npm run dist:win` with documented working directories. Installer output is `release/Orbit-Launcher-<version>-Setup.exe` for Windows x64 NSIS; `npm start` opens the built application and `npm run dev` runs electron-vite. The CI job uploads the actual generated installer path, not a guessed artifact.

- [x] **Step 1:** Configure electron-builder with `appId: dev.orbit.launcher`, `productName: Orbit Launcher`, the built main entry, built preload/renderer, and x64 NSIS output. Keep credentials, development fixtures, caches, and raw logs out of packaged files. Add a Windows CI workflow using Node 24, lockfile install, tests, typecheck/build, and unsigned installer creation/upload; pin workflow actions to verified immutable references during implementation. No automatic release publishing or signing claims.
- [x] **Step 2:** Run `npm ci` from a clean dependency install without touching user data, then typecheck, all tests, E2E, and build. Use writable cloud cache locations for npm/Electron/Playwright where needed, preserve checksums, and test a stop/restart of only processes started for validation. Do not add tests that merely mirror YAML or static documentation.
- [x] **Step 3:** Run `npm run dist:win`. Diagnose supported packaging-toolchain failures; if cross-packaging is unavailable, keep the Windows job and report the installer as unbuilt until that job actually runs. Inspect any produced artifact and record its actual size/hash. A CI file alone is not a successful Windows build.
- [x] **Step 4:** Write the README using observed command results, setup requirements for Java and the public Microsoft application, how to locate generated artifacts, and the seven-step Windows gameplay checklist from the spec. Explicitly label required manual/live checks that have not run. Link the design and plan as development references, not downloads. Include the real npm commands so the user can test source even before a Windows installer is available.
- [x] **Step 5:** Re-read the existing cloud draft. Save complete tested dependency installation and startup instructions only when needed; preserve custom network entries and record required official-domain additions. Instructions must use the current checkout rather than create worktrees, distinguish retained dependencies from restarted processes, and contain no credentials. Saving does not apply network policy or publish the environment. Verify the corresponding operations in the current instance; report external blockers precisely.
- [x] **Step 6:** Run `git diff --check`, inspect `git status --short`, and commit with `build: package Windows launcher and document testing`. Obtain a fresh whole-branch review with the selected execution workflow, fix material findings, then run only affected checks again. Finish with exact start/test commands, observed test counts, produced artifact location if any, and a clear list of Windows/account checks still unverified. Do not push, merge, or publish unless separately instructed.

## Dependency order and execution choice

Execute Task 1 before all others. Tasks 2, 3, and 4 share public contracts but their services are mostly independent; Task 5 integrates all three. Task 6 follows a working integrated build. Avoid concurrent edits to contracts, IPC, package.json/lockfile, or the controller.

Recommend **Native** execution: implement the tasks in this session, then obtain one fresh whole-branch review. This small new codebase has tightly shared contracts, so sequential integration should reduce handoff overhead. The alternative is **Subagent-driven** execution, with a fresh implementer and independent reviews for each task plus a final branch review.

The user approved the plan and selected Native execution. Implementation and the independent whole-branch review are complete; review regressions were reproduced and fixed. Windows/account manual checks remain unverified. See BUILD-REPORT.md for evidence, packaging limits, and recorded implementation decisions.
