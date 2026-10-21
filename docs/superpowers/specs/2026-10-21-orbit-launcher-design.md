# Orbit Launcher design

Date: 2026-10-21
Status: implemented; automated/Linux checks complete; Windows/account acceptance unverified

## Purpose and scope

Build a custom Electron launcher for Minecraft Java Edition on Windows. The user selected a desktop app with a custom interface and vanilla Minecraft as the first release. Success means a Windows user can sign in, select an official release, install its game files, configure Java and memory, and start the game. Orbit is the working product name.

The initial package targets Windows x64. Development and automated tests must also run in the existing Linux cloud checkout. Use that checkout directly; each cloud task is already isolated, so do not create a Git worktree unless the user requests one.

This is a launcher, not a replacement Minecraft implementation. Game files come from official services. Fabric, Forge, mod management, custom accounts, automatic launcher updates, multiple game profiles, and a store are outside the first release.

## User experience

Use a dark charcoal interface with teal accents, readable typography, clear focus indicators, and responsive layouts inside a desktop window. Include three main destinations:

- **Play:** account status, official release selector, selected release installation state, download progress, and a primary Install / Play action.
- **Settings:** Microsoft application client ID, Java executable, game folder, and memory allocation. Explain why a missing setting prevents a specific action. Save non-secret preferences locally.
- **Logs:** bounded installation and game output, with actionable errors and a copy action. Never show tokens, authentication headers, or unredacted authenticated launch arguments.

The first run has real empty and loading states. Do not present invented accounts, installed versions, download progress, or successful launches as live data. The UI should remain usable when offline and explain when an action needs connectivity.

Sign-in opens Microsoft's verification page in the system browser and displays the device code and expiration state. Signing out clears the local account and credential cache. Installation and launch failures leave a visible retry path. Disabling a button must also explain the prerequisite that is missing.

## Architecture

Use Electron, React, TypeScript, Vite, npm with a committed lockfile, and electron-builder for a Windows NSIS installer. Use the installed Node 24 LTS toolchain for development. Pin selected dependency versions during implementation and confirm their actual APIs before using them.

The renderer owns presentation. It has no direct Node, filesystem, process-spawning, or credential access. Enable context isolation and sandboxing, disable Node integration, use a restrictive content security policy, and expose a small typed preload API. Validate renderer inputs in the main process. Prevent arbitrary navigation and restrict external links to expected HTTPS authentication/help destinations.

Main-process services have separate responsibilities:

1. **Settings:** validate and persist preferences using atomic writes.
2. **Accounts:** authenticate, refresh sessions, check Minecraft ownership/profile, and protect stored credentials.
3. **Versions:** retrieve and cache the official release manifest and per-version metadata.
4. **Installer:** install the selected client's libraries, assets, and native dependencies, reporting real progress.
5. **Java:** locate configured or available Java executables and verify runtime compatibility.
6. **Launcher:** resolve the installed version, assemble the authenticated launch through the library, start the game, and stream redacted output and lifecycle events.

Use narrow adapters around `@azure/msal-node` for Microsoft authentication and evaluate the supported APIs of `@xmcl/user`, `@xmcl/installer`, and `@xmcl/core` for Minecraft authentication, installation, and launching. Their use must not inherit a third-party application's default authentication identity. Keep service interfaces injectable so automated tests can exercise real orchestration without contacting accounts or downloading a full game.

Keep settings and encrypted credential storage under Electron's user-data directory. Default the game installation to an Orbit-specific directory under the user's application-data directory; allow the user to choose another directory. Development must not modify an existing official Minecraft installation by default.

## Account authentication

Require the developer's own Microsoft public/native application client ID, configured for personal Microsoft accounts and a supported device-code flow. The client ID is public configuration, not a secret. Do not ship a client secret, reuse Microsoft's launcher identity, or request account passwords inside Orbit.

Use MSAL's device-code flow for personal accounts with the `XboxLive.signin` and `offline_access` scopes. Complete Microsoft authentication, Xbox Live authentication, XSTS authorization, Minecraft Services authentication, and Minecraft entitlement/profile checks. An authenticated Microsoft account without a Java entitlement must receive a clear explanation rather than a successful ready-to-play state.

Keep tokens in the main process. Encrypt persistent MSAL cache material with Electron safe storage on Windows. If secure storage is unavailable, retain credentials only in memory and explain that sign-in will be needed again. Never persist credentials using Linux's plaintext `basic_text` backend. Refresh or reacquire the Minecraft session before launching, and clear invalid account state after refresh failure.

The public app registration, any required Minecraft API approval, and a real account owning Java Edition are external prerequisites. App registration alone does not prove Minecraft API access. Without these prerequisites, the renderer, installer, settings, and automated tests can still work, but live authentication and authenticated gameplay must remain explicitly unverified.

## Version installation and launch

Read official release metadata from Mojang's version manifest. Show release versions initially; snapshots and mod loaders are deferred. Default to the latest official release. Preserve a usable cached manifest for already installed releases when offline, but require a valid account session for the first release's launch workflow.

Install the selected version's client, libraries, native libraries, asset index, and assets using the version metadata's OS and architecture rules. Verify metadata and artifact hashes and sizes where supplied by official metadata. Keep incomplete artifacts separate from completed files; do not mark a version installed after a partial or failed download. Retry failures without deleting unrelated game data. Serialize installation and launch operations to prevent conflicting changes in the selected game directory.

Respect the selected version's Java major-version requirement. Detect Java from the saved path and available system installations, check its reported version and architecture, and require the user to choose a compatible executable if none is available. The Windows x64 package requires a 64-bit x86 JVM and uses matching x64 native libraries; reject 32-bit and ARM JVMs with a clear error. Show the required Java version and architecture in the error. Automatic Java runtime installation is deferred; the first release includes Java selection and validation.

Validate that the Java executable exists, the game directory is usable, required game files are complete, and the authenticated Minecraft profile is available before spawning Java. The maximum-heap setting defaults to 2048 MiB, allows at least 1024 MiB, and must not exceed 75% of physical memory; reduce the default to that upper limit when needed, or explain insufficient memory if the upper limit is below the minimum. Delegate version-specific launch arguments and native-library handling to the selected launcher library; pass executable arguments as an array with shell execution disabled.

Keep account state separate from installation state. The installation/launch flow is: loading -> ready to install -> installing -> installed -> launching -> running -> installed. Permit installation without signing in or configuring Java; require a valid account and compatible Java only for launch. Display missing prerequisites beside the installed version rather than describing it as ready to play. Errors return to the relevant actionable state. Running means the child game process has started; a successful game launch is only verified when the game actually opens and loads a world. Track game exit and show a useful error for a nonzero exit.

## Network and configuration requirements

The launcher requires official metadata, download, authentication, and game-service endpoints. Expected hosts include `piston-meta.mojang.com`, `piston-data.mojang.com`, `libraries.minecraft.net`, `resources.download.minecraft.net`, `login.microsoftonline.com`, `login.live.com`, `user.auth.xboxlive.com`, `xsts.auth.xboxlive.com`, and `api.minecraftservices.com`. Confirm any additional official redirect or legacy-download hosts from actual library behavior before requesting access. Preserve TLS verification and the supplied artifact hashes.

The cloud's package-manager access does not establish access to Minecraft services. An initial metadata request to `piston-meta.mojang.com` received a proxy 403. Record this as an environment-network limitation and request only the required domain additions through the cloud configuration flow when implementation reaches integration validation. Do not replace unknown allowlists or claim external requests passed when they were blocked.

Do not put secrets into repository files, logs, screenshots, or reusable setup instructions. No cloud secret is needed merely to store the public Microsoft client ID. Keep user-specific application configuration out of committed defaults.

## Validation and acceptance criteria

Automated verification must include TypeScript checking, a production renderer/main/preload build, service tests, and representative renderer tests. Test meaningful failures as well as successful orchestration:

- Account authentication required, cancellation/expiration, refresh failure, missing entitlement, and redaction.
- Settings validation, Java-version mismatch, rejection of 32-bit/ARM Java for the x64 package, paths containing spaces, and an unwritable game directory.
- Version selection, cached metadata, download progress, a corrupt artifact, an interrupted download, and successful retry.
- A launch requires the expected installed files, Java runtime, and account; arguments preserve paths correctly and never invoke a shell.
- The Play screen transitions from missing prerequisites through installation to launch and displays errors without hanging. Test fixtures must be confined to automated tests and clearly separate from production behavior.

Create a Windows x64 installer using the packaging script. If packaging cannot run in Linux without an additional supported toolchain, add a Windows CI job and report packaging as unverified until a real build completes. Code signing is outside the initial deliverable; do not describe an unsigned artifact as signed or published.

The README must contain tested development/build/test commands, configuration of the public client ID and Java executable, and this Windows manual test checklist:

1. Install and open Orbit on Windows x64.
2. Configure the application's client ID and a compatible Java executable.
3. Sign in using an account owning Minecraft Java and confirm the displayed profile.
4. Select an official release, install it, and confirm visible download completion.
5. Click Play; verify Minecraft opens, reaches its menu, and loads a single-player world.
6. Exit Minecraft and confirm Orbit returns to a usable state.
7. Restart Orbit, check preference persistence, exercise account refresh, then sign out and confirm credentials are removed.

Keep cloud-verified behavior, mocked test results, produced artifacts, and Windows/account manual results distinct. Never present the manual checklist as executed without evidence.

## Delivery boundary

Deliver source code, reproducible npm installation, automated checks, Windows packaging configuration, and practical test instructions. During implementation, update reusable cloud setup/start instructions when necessary and actually validate the commands before describing them as tested. Creating a design document is not an application build, and a passing renderer test is not proof that Minecraft gameplay works.

The next stage after written-spec approval is a concrete implementation plan and selection of its execution method. Product scaffolding and dependency installation begin only after those design/planning reviews are complete.
