# Orbit Launcher 0.3.0

A custom **Minecraft Java Edition launcher for Windows 10/11 x64** with Microsoft browser sign-in, saved local offline profiles, separate Vanilla/Fabric game profiles, and a Modrinth Library for modpacks, mods, resource packs, data packs, Iris shaders and saved servers.

## Install and test on Windows

Download the **Orbit-Launcher-Windows-x64** artifact from [Windows builds](https://github.com/ronaldogoat20202-oss/d/actions/workflows/windows.yml). Choose the successful **0.3.0** build, sign into GitHub, scroll to **Artifacts**, download the ZIP, extract it, and open **Orbit-Launcher-0.3.0-Setup.exe**. The executable runs on your Windows computer; ChatGPT's workspace preview cannot run it. Installers are unsigned.

1. Open Orbit. On **Play**, create a game profile, choose a Minecraft version and **Vanilla** or **Fabric**. Fabric pins the newest stable loader available for that version.
2. Click **Install Minecraft**. Game downloads are verified and need no account or Java configuration.
3. Choose **Create offline profile**, enter a 3–16 character username using letters, digits or underscores, and create it. Local profiles work for single-player and servers configured for offline players. Microsoft-authenticated servers and Realms require a Microsoft account with Minecraft Java Edition.
4. In **Settings**, select an installed compatible x64 `java.exe`, or let Orbit detect one. The required Java major version comes from Minecraft metadata. Java itself is not downloaded by Orbit. Keep memory within the displayed limits.
5. Return to **Play** and click **Play Minecraft**. Exit Minecraft before changing profiles, settings or content.

Existing worlds are kept in their original game folder as **Existing Vanilla** when the official release list is available. New profiles have separate worlds, mods and packs under `instances/<profile-id>`; game libraries and assets can be shared. Removing a profile unregisters it and retains its worlds/files. Changing the default library affects newly created profiles.

## Library

Select the intended game profile, then open **Library**. Search Modrinth, sort by relevance/downloads/followers/date, and choose 10, 20 or 50 rows per page. Project rows show real icons, authors, tags and statistics. Click a project to open its full **Description** and **Versions** page; **Back to results** preserves search, sorting and pagination. Choose a compatible version, click **Install** or **Check installation**, review its required files, then confirm. Optional dependencies are shown separately. **Import JAR/ZIP** uses a native file picker and bounded archive inspection. Unknown compatibility requires an explicit checkbox confirmation.

- **Modpacks:** browse `.mrpack` versions for the selected Minecraft version. Review the package, then **Create modpack profile**. Orbit creates a separate profile with the exact Vanilla/Fabric and Minecraft versions declared by the pack. Open **Play → Install Minecraft** before the first launch. Top-level mods, resource packs and shaders from the pack appear as **Modpack content** and can be enabled/disabled/removed through their tabs. Forge, NeoForge and Quilt packs are unsupported. Required downloads must be direct `cdn.modrinth.com` URLs; unsupported hosts are reported before installation. Optional downloads are visibly skipped, as are server-only files. Client overrides replace general overrides.
- **Servers:** save, edit and remove named Java Edition addresses, including LAN/localhost and bracketed IPv6 with optional ports. **Join server** uses your selected installed game profile/account. Modern versions use Quick Play; older versions use server arguments. Minecraft handles the actual connection and server authentication. The list remains available offline.
- **Mods:** Fabric profiles only. Required dependencies and supported Fabric version predicates are checked using actual JAR metadata, including bundled modules. Enabled mods load on the next game launch.
- **Resource packs:** installed into the selected profile's `resourcepacks`. Enable them in Minecraft's **Options → Resource Packs**.
- **Data packs:** choose an existing world first. Create/open a world in Minecraft if the list is empty, then refresh worlds. Files go into that world's `datapacks`; enable them inside the world with `/datapack` as appropriate.
- **Shaders:** Fabric plus compatible Iris is required. The preview includes Iris and required dependencies when missing. Iris belongs in `mods`; shader ZIPs belong in `shaderpacks`. Enable them in **Video Settings → Shader Packs** in Minecraft.

Disable moves managed files outside active game directories; enable restores them. Required dependents prevent unsafe removal/disable. **Update** checks compatible catalog versions and preserves disabled state. Local imports are replaced through another import and have no catalog-update action. Orbit preserves a managed file if its bytes changed, reporting a conflict instead of overwriting/removing it. Files installed outside Orbit remain unmanaged. Files installed as part of an Orbit modpack profile are managed locally and have no individual catalog-update action; reinstalling another pack version creates a separate profile.

Deleting a world in Minecraft makes its managed data-pack records inactive and does not block other worlds. **Forget** removes an unavailable world's Library record while leaving any remaining files unchanged.

Interrupted changes show **Recover add-ons** and block that profile's launch. Recovery verifies staged/installed bytes and completes the journaled transaction. A conflict preserves the files and pending journal under `<game folder>/.orbit`; restore the expected files or retain that folder for diagnosis before retrying. Individual add-on installation does not edit `options.txt`, shader preferences or `level.dat` to activate packs. Modpacks can intentionally supply those settings in their bundled overrides inside the new profile.

## Microsoft sign-in: publisher setup

Ordinary players click **Sign in with Microsoft** and use their system browser; they do not enter an application ID or password in Orbit. **This repository does not yet contain a registered Orbit public client ID. Builds without it keep Microsoft sign-in unavailable and support offline profiles.**

The publisher must register an Orbit public/native application with personal Microsoft account support in the [Microsoft Entra admin center](https://entra.microsoft.com/), configure the desktop redirect **`http://localhost`**, and enable public-client flows. Orbit uses authorization-code **S256 PKCE**, random state, and a five-minute callback listener bound to `127.0.0.1`; the runtime redirect uses an ephemeral port. Scopes are `XboxLive.signin` and `offline_access`. The application may also require Minecraft API approval. No client secret is used and another launcher's identity is not borrowed.

Set the public UUID as **`ORBIT_MICROSOFT_CLIENT_ID`** before building. Windows CI reads the repository variable with the same name. Invalid nonempty IDs fail the build. A valid ID saved by older Orbit versions remains a legacy fallback. Tokens stay in the main process; encrypted credential storage is used when available, otherwise sign-in lasts only for the session. Sign-out clears cached Microsoft credentials. Failed Microsoft login never silently selects an offline account.

## Develop from source

Install Node.js **24 LTS** (`>=24.15.0 <25`), then run:

```sh
npm ci
npm run dev
```

Production startup: `npm run build` then `npm start`. Create the Windows installer with `npm run dist:win`, or a standalone executable with `npm run dist:portable`. Outputs are under `release/`. Windows CI produces the NSIS installer; the Linux cloud's Wine installation cannot reliably build NSIS. Uninstall retains game data.

```sh
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Service tests use real small ZIP/JAR/filesystem fixtures. Browser tests inject only the typed test bridge and simulate installation/launch. They do not run Minecraft. To explicitly check public providers and download/install a real Iris dependency bundle into a temporary directory, run `ORBIT_LIVE_CHECK=1 npm test -- tests/live/providers.test.ts` (PowerShell: `$env:ORBIT_LIVE_CHECK='1'` first). The default suite skips that network test. On Linux, browser tests use `/usr/bin/chromium` if available; otherwise install Playwright Chromium or set `ORBIT_CHROMIUM_EXECUTABLE`.

## Windows manual acceptance

Install/open the new executable; create Vanilla/Fabric profiles and an offline account; install Minecraft; select the required Java; launch to the menu and open a world. Restart to verify saved profiles. Test Microsoft browser login/cancel/sign-out with the registered Orbit application and an owning account. Install a supported Fabric modpack into a new profile and launch it; save and join a test server; install and activate a Fabric mod, resource pack, per-world data pack, and Iris shader; check enable/disable/update and retained worlds after profile removal. These gameplay, real-account and Windows execution checks remain manual; cloud and browser success does not establish them.

## Cloud setup

Use the existing isolated checkout at `/workspace/d`. Preserve local work and branch `work`. Writable caches:

```sh
export NPM_CONFIG_CACHE=/workspace/.cache/npm
export electron_config_cache=/workspace/.cache/electron
export ELECTRON_BUILDER_CACHE=/workspace/.cache/electron-builder
export XDG_CACHE_HOME=/workspace/.cache
export NODE_USE_ENV_PROXY=1
npm ci
npm run typecheck
npm test
npm run build
```

The user published the environment configuration. Official metadata, Fabric Meta/Maven and Modrinth API/CDN access were subsequently verified. Preserve the existing official Minecraft/Microsoft/Xbox domains and package-manager presets, plus `meta.fabricmc.net`, `maven.fabricmc.net`, `api.modrinth.com`, `cdn.modrinth.com`. Saving an environment draft alone does not apply its network policy. No secrets are required for the public content catalog.

Downloads retain TLS and checksum validation, provider-specific host policies and containment checks. `@xmcl/unzip` is pinned/overridden to working published version `2.1.2`; `2.2.0` has broken published dependency/entry-point metadata. Orbit uses a narrow game installer around `@xmcl/core` because the inspected `@xmcl/installer` package has broken imports.

[Library browser design](docs/superpowers/specs/2026-10-22-library-browser-design.md) · [Library plan](docs/superpowers/plans/2026-10-22-library-browser.md) · [Accounts/add-ons design](docs/superpowers/specs/2026-10-21-orbit-accounts-addons-design.md) · [Implementation plan](docs/superpowers/plans/2026-10-21-orbit-accounts-addons.md) · [Verification report](BUILD-REPORT.md)
