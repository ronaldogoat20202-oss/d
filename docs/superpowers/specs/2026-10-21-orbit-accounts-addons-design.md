# Orbit accounts and add-ons design

Date: 2026-10-21
Status: implementation complete through Library integration; final review and Windows delivery in progress
Baseline: `ec616bf` on `work`

## Intent and agreed scope

The user wants Orbit to feel like a normal Minecraft Java launcher: a straightforward Microsoft sign-in button, a local username option for offline play, and management of mods, resource packs, data packs, and shaders. They approved the proposed Fabric-first design, Modrinth browsing and local file imports, isolated game profiles, dependency/version checks, and selection of a world for data packs.

This is the next update to the existing Windows x64 Electron application. Keep its dark interface, Java and memory controls, verified vanilla installation, logs, renderer isolation, and Windows build workflow. Develop in the current isolated checkout without creating a worktree. This specification supersedes the original design's vanilla-only scope, authenticated-only launch requirement, and per-player application-ID setup.

Success means a user can create an offline profile, install and launch a Vanilla or Fabric game profile, and manage compatible content in its correct directory. A Microsoft account has a separate, familiar browser sign-in flow. Real Microsoft authentication requires Orbit's own application registration and Minecraft API access; neither exists merely because the interface is implemented.

Fabric is the supported mod loader for this update. Forge, NeoForge, Quilt, modpack installation, server management, automatic Java installation, automatic launcher updates, and a hosted account service are outside this update. An offline profile is local launcher data, not a newly registered Microsoft or Minecraft account.

## User flows

### Accounts

The account panel offers **Sign in with Microsoft** and **Create offline profile**. A saved account chooser makes the account type visible and restores the last explicitly selected account. Support multiple saved offline profiles and one remembered Microsoft account; multiple Microsoft accounts can follow later.

Microsoft sign-in opens the user's system browser on Microsoft's authorization page. Show a waiting state and Cancel action in Orbit, then return to the connected Minecraft profile after the browser callback succeeds. Refresh the session silently when possible. Signing out clears Microsoft credentials; switching to an offline profile cancels pending sign-in without automatically deleting the remembered Microsoft account. Explicit removal of that remembered account clears its cache.

An offline profile requires a username of 3–16 ASCII letters, digits, or underscores. Reject duplicate local names case-insensitively. Preserve the chosen spelling and stable UUID; changing a name means creating another profile. Explain next to the account type that offline profiles work in single-player and on servers configured to accept offline players, and cannot authenticate to online-mode servers, Realms, or official profile/skin services. Switching between local and Microsoft identities may change world inventories because their UUIDs differ.

A failed Microsoft sign-in never silently switches to an offline profile. A launcher without a configured application ID remains fully usable with local profiles, installation, and add-ons. Its Microsoft action explains the missing publisher configuration rather than asking each player for an application ID.

### Game profiles and Play

Add a profile chooser and a **New profile** flow with a display name, official Minecraft release, and Vanilla or Fabric loader. Resolve and pin a stable compatible Fabric loader version during profile creation. Show the Minecraft and loader versions beside each profile.

Keep a profile's Minecraft and loader versions fixed once created; choosing a different version creates another profile. Renaming a profile is allowed. Removing a profile removes its launcher registration, not its worlds or game folder. Show where retained files are located. Do not add recursive game-folder deletion in this update.

Preserve the current game folder as an **Existing Vanilla** profile. Do not move, replace, or delete its saves, packs, or other user files. The installed releases and shared download cache remain reusable. New profiles receive separate folders. On first migration, bind the legacy profile to the existing selected release when available, otherwise the resolved default official release; do not claim that the release is installed without inspecting it.

Play continues to expose Install/Repair, progress, Java prerequisites, Play, game exit, and logs. Installation does not require an account. Launch requires an explicitly selected local or Microsoft account and a verified compatible x64 Java runtime.

### Add-ons library

Add a **Library** destination with Mods, Resource packs, Data packs, and Shaders tabs, always scoped to the selected game profile. Provide Modrinth search, a project/version detail view, local import, and an installed-content list. Show real loading, empty, offline, unsupported-version, dependency, progress, and error states.

Filter catalog versions by the selected Minecraft release and content type; mods must also match Fabric. Selecting a project resolves a compatible published version and its required dependencies before installation. Show those dependencies in the install details. Do not silently substitute an incompatible or unrelated latest version. Optional dependencies are listed but are not automatically installed. An unsupported project has no enabled Install action.

The installed list supports enable/disable, remove, and an explicit compatible-version update action for managed content. Disabling and removing affect only the selected profile or world. Reject removing/disabling a required dependency while an enabled managed dependent still needs it; identify the dependent. Updates use the same dependency and integrity checks as initial installation. No background updates run automatically.

Mods are available for Fabric profiles. A Vanilla profile can install resource packs and data packs, and the Mods tab explains how to create a Fabric profile. Shader installation requires a Fabric profile and compatible Iris. Offer installation of Iris and its declared required dependencies through the same dependency resolver. If Iris or the shader has no compatible version, explain that rather than claiming shaders are ready. Do not replace an existing unrelated rendering mod automatically.

Data packs require an existing world selected from that profile. List direct save directories containing `level.dat`, excluding symlinks and paths outside the selected profile. Install into that world's `datapacks` directory. If no world exists, explain that the user must create one in Minecraft first. Do not create a pretend world or install data packs globally.

Installing a resource pack or shader ZIP does not select it in Minecraft. Show a short instruction to select it in the appropriate game menu. Installing a data pack does not establish that the world has enabled it; show the relevant in-game activation/reload instruction. Orbit does not rewrite `options.txt`, shader settings, or `level.dat` in this update. Enabled in Orbit means the file is available for Minecraft to load, not proof that Minecraft has activated it.

## Account implementation boundary

Resolve Orbit's public Microsoft client ID in the main process from build configuration named `ORBIT_MICROSOFT_CLIENT_ID`. No client secret is used. Remove the application-ID field from ordinary Settings. A previously saved valid client ID may remain a migration fallback when the build has none; a configured build ID takes precedence. Never reuse another launcher's application identity. Cached Microsoft credentials are usable only with their recorded effective client ID; an ID change invalidates the incompatible cache.

Use MSAL authorization-code flow with S256 PKCE, cryptographically random state, and a temporary loopback listener. The application registration must support personal Microsoft accounts and the public desktop redirect. Register `http://localhost`; use the runtime redirect `http://localhost:<ephemeral-port>/`, with the listener bound only to `127.0.0.1`. Verify these redirect rules against the actual registration before claiming live sign-in works. Allow browser navigation only to the expected Microsoft HTTPS authorization endpoint.

The callback accepts only the expected method/path and the current state, rejects malformed or duplicate callback parameters, and never logs codes, PKCE material, tokens, or full authorization/callback URLs. A mismatched state cannot complete the attempt. Cancel, error, successful completion, app/window shutdown, and a five-minute deadline close the listener and invalidate the attempt. Late token responses cannot revive a canceled or replaced account. The callback page contains only a success/failure message and an instruction to return to Orbit.

Continue the Xbox Live/XSTS/Minecraft Services exchange and entitlement/profile checks for Microsoft accounts. Continue encrypted MSAL cache storage, with a memory-only session when secure storage is unavailable. No credentials cross the preload bridge. Keep session refresh failure separate from local-profile selection.

Introduce a discriminated game-session type. Microsoft sessions contain their authenticated token, profile, effective client ID, and XUID. Offline sessions contain only the selected local profile. Generate the standard Java name UUID from `OfflinePlayer:<username>` using MD5 with the version/variant bits set, serialized in Minecraft's expected format. Supply explicit offline launch arguments, an inert token placeholder, and `userType: legacy`; do not rely on the core library's default random token or default Microsoft account type.

Persist offline profiles and the last selected account reference as non-secret data separately from the encrypted Microsoft cache. Account generations and the existing check at the actual process-spawn boundary apply to both account types. Switching/removing/signing out during Java verification or asynchronous launch prechecks prevents a stale account from starting the game.

## Profiles, installation, and storage

Use a schema-versioned profile store under Electron user data. Each record has an opaque generated ID, display name, Minecraft version, loader kind, pinned Fabric version when applicable, a library-root association, and a managed game-directory reference. Persist the selected profile ID. Main-process services resolve these references; renderer input cannot provide arbitrary destination paths.

The existing configurable game-library root continues to contain shared `versions`, `libraries`, and `assets`. New instance game directories live under `<library-root>/instances/<profile-id>`. Launch uses the profile directory as `gamePath` and its associated shared library as `resourcePath`. Create profile folders recursively before launch. A legacy profile explicitly references the existing root as its game directory. Label the root setting as the default library for new profiles: changing it affects newly created profiles, while existing profiles retain their original library and game-directory association. It does not move or hide their worlds/content. Moving existing profiles between roots is outside this update.

Preserve official vanilla release verification. Fabric installation first ensures the base Minecraft release, then fetches the pinned loader's inherited profile from Fabric Meta and its declared library artifacts. The core library supports `inheritsFrom` resolution, but the vanilla installer must be adapted: inherited profiles use the base `minecraftVersion` client JAR, not a duplicated or missing client JAR under the Fabric child ID. The resolved child profile supplies Fabric's main class and libraries while retaining the base assets and Java requirement.

Treat a Fabric installation as complete only after its metadata, base client, loader libraries, and required game artifacts pass inspection. Use provider-published hashes/sizes where available; retain TLS verification when metadata supplies no independent checksum. Do not report an unverified provider artifact as checksum-verified. Metadata and downloads are staged and committed atomically, with a retryable repair path.

Content locations are `mods`, `resourcepacks`, and `shaderpacks` under the profile game directory, plus `saves/<chosen-world>/datapacks`. Store a per-profile managed-content manifest, with world references for data packs. Records include source, project/version IDs when available, content kind, Minecraft/loader compatibility, relative path, local digest, expected provider digest/size, enabled state, and dependency references.

Disabled content is moved to a managed staging/disabled location outside Minecraft's active content directories. Track the move in the manifest. Do not overwrite a conflicting user file or remove a file changed since Orbit recorded it. Compare its current digest first and offer an actionable conflict state. Importing a file copies it; it does not delete the user's original. Only managed files are removed by Library actions.

Serialize install, content mutation, profile/root changes, and launch operations through the controller. Reject content/profile mutation while Minecraft is running. Resolve and stage every required file before enabling an installation or update. Keep a pending-transaction marker before committing changes; failed or interrupted commits remain repairable and block launch of that profile until reconciled. Rollback/recovery may remove or restore only files whose paths and recorded digests still match the transaction.

## Catalog, imports, and download policy

Use a narrow Modrinth adapter behind an injectable catalog interface, with a descriptive versioned User-Agent. Public catalog/download access requires no Modrinth account key. Normalize catalog types into Orbit's four content kinds. In particular, do not assume the Modrinth v2 project `project_type` exposes data packs distinctly: use the selected content facet and loader/version metadata to identify them correctly. Validate actual supported filter behavior through fixtures and a live catalog check before claiming browsing works.

Resolve pinned version dependencies and required project dependencies for the selected target, deduplicate them, detect dependency cycles/conflicts, and handle incompatible declarations. Route each dependency according to its own content kind; for example, Iris belongs in `mods` even when installed to support a shader pack. Embedded dependencies need no second copy. Record exact installed versions so later removals and updates can enforce dependency relationships. Catalog declarations establish declared compatibility; they are not proof of successful gameplay.

Use separate allowlists for official Minecraft, Fabric metadata/Maven, Modrinth API, and Modrinth CDN downloads. Do not weaken the existing Mojang-only policy to accept arbitrary URLs. Require expected Modrinth SHA-512 hashes and sizes, and check streamed byte limits, staging-file integrity, and final destination containment. Remote filenames, project names, and world names never become unchecked paths. Handle Windows reserved names, case-insensitive collisions, path traversal, symlinks, and attempts to redirect downloads to an unapproved host.

Local import supports `.jar` for mods and `.zip` for packs. Inspect bounded archive metadata without executing or extracting its contents: Fabric metadata for mods, pack metadata/content roots for resource/data packs, and shader roots for shader packs. Reject corrupt archives, wrong content kinds, excessive entry counts/metadata sizes, and conflicting destination files. Label compatibility as unverified when supported metadata cannot establish it, and require an explicit import choice for that case. A local import must not masquerade as a verified Modrinth release or silently fetch invented dependencies.

Cache catalog results and installed manifests for offline viewing. Clearly distinguish cached results from current network data. An offline connection does not invent a successful remote install or authentication. Existing verified installed profiles and local file imports remain usable with offline profiles.

## Service and UI boundaries

Keep the renderer sandboxed and context-isolated. Extend the typed snapshot/preload API with explicit account, game-profile, catalog-query, world-listing, and managed-content operations. Validate every argument and retain exact sender-frame checks for IPC. Long operations expose real progress and useful errors; they never return invented success records.

Separate main-process responsibilities into account/OAuth, local account store, game-profile store, Fabric installation, catalog/provider adapters, managed content/dependencies, and controller orchestration. Reuse the existing Java, credential, logging, download-integrity, and official-version services. Keep external dependencies behind narrow injectable boundaries. Avoid unrelated repository refactors.

Maintain the current desktop window's usable minimum size, keyboard navigation, clear focus states, and concise explanations for unavailable actions. Extend the current design rather than introducing a separate web app. Logs remain bounded and redact Microsoft secrets in both authentication and game output. Error messages identify the profile or content operation and retain a recovery action.

## Network and external prerequisites

Preserve existing official Minecraft and Microsoft/Xbox destinations. Add only the necessary Fabric and Modrinth destinations, expected to include `meta.fabricmc.net`, `maven.fabricmc.net`, `api.modrinth.com`, and `cdn.modrinth.com`; verify any additional Maven artifact host from real loader metadata before adding it. Preserve existing cloud network settings when saving additions. Draft configuration changes do not apply or publish the running environment's network policy.

Orbit's public Microsoft client ID, the supported desktop redirect, Minecraft API approval where required, and a real owning account are prerequisites for testing Microsoft sign-in. No secret or password is requested in chat. Missing Microsoft configuration does not prevent implementing or testing local accounts, profiles, catalogs, or installation. Blocked live provider requests must be reported as network limitations, with automated fixture behavior kept distinct.

## Verification and acceptance

Retain the current test suite, including the real Windows regression for an application-data path that is a file. Add meaningful tests for the changed boundaries:

- Browser sign-in success/error/cancellation/deadline, wrong state and path, callback replay, listener cleanup, cache restoration, and absent application configuration. Exercise a real loopback listener with a simulated provider rather than logging into a real account in tests.
- Offline username validation and deterministic Java-compatible UUIDs; account restoration and explicit switching; no fallback after failed Microsoft authentication; account-change prevention at the actual spawn boundary for both session kinds.
- Profile migration without moving existing worlds, directory isolation, fixed version/loader selection, persisted selection, and safe retention of files after profile removal.
- Fabric child-profile inheritance, correct base-client JAR placement, actual resolved launch arguments/main class, library hash failures, and repair after an interrupted installation.
- Catalog filtering, the data-pack API type nuance, dependency resolution/conflicts/cycles, unsupported versions, expected file hash/size failures, and successful retry using actual small fixture files.
- Bounded local archive inspection, wrong content kinds, Windows path/case collisions, path and symlink escapes, unmanaged/modified-file conflicts, and transaction recovery without deleting unrelated files.
- Per-world data-pack placement, Iris requirements, managed enable/disable/update/removal, dependency protection, and prevention of mutation while Minecraft is running.
- Renderer flows for selecting/creating accounts and profiles, browsing/importing content, choosing a world, progress/retry, offline states, and explaining in-game pack activation.

Run TypeScript checking, the full service/renderer suite, representative browser end-to-end tests, and the production Electron build. Validate production IPC startup separately from browser test fixtures. Produce a Windows x64 installer through the existing GitHub workflow and confirm both the workflow result and a downloadable artifact before providing a download link. A workspace file preview is not a download delivery route.

Manual Windows acceptance still needs an actual user machine: create and restore an offline profile; install and launch Vanilla and Fabric; enter a single-player world; install a compatible mod and required dependencies; install/select a resource pack and Iris shader; install and enable a data pack in a chosen world; exit/restart; and verify that a second profile's worlds/content stay separate. Test Microsoft sign-in/refresh/sign-out only after valid Orbit registration is supplied. A successful build or simulated authentication is not proof of live login, gameplay, shader rendering, or world modification.

## Delivery and next stage

Deliver the updated launcher source, reproducible dependency lockfile, automated checks, updated user/configuration instructions, and a downloadable Windows artifact. Update reusable cloud setup/start instructions only when needed, and validate any new commands before saving them as tested. Preserve package integrity and TLS checks.

The user has approved the conversational design and this written specification. The implementation plan maps these requirements into implementation and verification tasks and must be reviewed before implementation. Preserve the user's previously selected Native execution method. This document records a design; no feature implementation is claimed at this stage.
