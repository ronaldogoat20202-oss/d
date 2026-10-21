# Orbit Launcher

A custom Electron launcher for **Minecraft Java Edition on Windows x64**. Includes official vanilla release selection, verified game downloads, Microsoft browser sign-in, Java/memory settings, and launch logs. Game installation does not require signing in; playing requires an owning account and compatible Java.

## Test from source on Windows

Copy or extract this project folder onto Windows 10/11 x64, then install **Node.js 24 LTS**. From PowerShell in the project folder:

```powershell
npm ci
npm run dev
```

This opens the real desktop launcher. You can explore the interface and install Minecraft files before configuring sign-in. Source changes in this cloud checkout are local until explicitly pushed; cloning an unchanged remote will not include them.

If you have the portable build, open `Orbit-Launcher-0.1.0-Portable.exe` directly on Windows x64; Node.js is not needed for that executable. It is unsigned and has not been tested on a real Windows machine.

To test a production build instead:

```powershell
npm run build
npm start
```

To create a Windows installer:

```powershell
npm run dist:win
```

Expected installer: `release/Orbit-Launcher-0.1.0-Setup.exe`. Installers are unsigned. Building does not publish a release. Game data stays under the user's Orbit application-data directory and is retained on uninstall.

For a standalone executable, use `npm run dist:portable`. Output: `release/Orbit-Launcher-0.1.0-Portable.exe`. The Linux cloud can package the application, but its Wine toolset failed to load a required DLL when creating the NSIS uninstaller. The NSIS installer therefore remains unbuilt here; use the Windows CI job or build on Windows. A partial Setup executable from a failed build is not a usable installer.

## Configure real sign-in and gameplay

1. Register **your own** Microsoft public/native application in the [Microsoft Entra admin center](https://entra.microsoft.com/). Support personal Microsoft accounts and enable public-client/device-code authentication. No client secret is needed.
2. Put its public **Application (client) ID** in Orbit's Settings. The launcher requests `XboxLive.signin` and `offline_access` using MSAL. A new registration may also need Minecraft API approval; registration alone does not guarantee access. Orbit does not borrow another launcher's application identity.
3. Install an x64 Java runtime matching the selected Minecraft release. Select its `java.exe` in Settings, or allow Orbit to detect a compatible installation on launch. An incompatible runtime error states the required major version. Java runtimes are not automatically downloaded.
4. Keep memory between 1024 MiB and 75% of physical memory. The default is 2048 MiB, capped for smaller machines.
5. Click **Sign in with Microsoft**. Orbit opens Microsoft's verification page in your system browser and shows a temporary code. Sign in with an account that owns Minecraft Java Edition, then return to Orbit.
6. Select a release and click **Install Minecraft**. After verification completes, click **Play Minecraft**.

Passwords and authentication tokens are never entered in Orbit's settings. The public client ID is not a secret. Refresh credentials use Electron's encrypted safe storage; when secure storage is unavailable, sessions remain in memory and Orbit explains that sign-in will be needed after restart. Signing out removes the local cache.

## Automated tests

```powershell
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Unit and service tests exercise actual small downloaded fixture files, checksum/size validation, failed streams and retries, JVM compatibility, credential lifecycle, launch arguments, operation locking, and sanitized logs. Browser tests inject the public launcher bridge only in the test harness. They do **not** sign into Microsoft or run Minecraft.

On Linux, an installed `/usr/bin/chromium` is used for browser tests when present. Otherwise install Playwright's browser as above, or set `ORBIT_CHROMIUM_EXECUTABLE` to a compatible Chromium executable. A desktop display is needed to use Electron interactively.

The Windows workflow builds and uploads the installer when run in GitHub Actions. Its configuration alone does not establish that a Windows build or gameplay check has run.

## Windows manual acceptance test

1. Install and open Orbit on Windows x64.
2. Configure the application's client ID and a compatible Java executable.
3. Sign in with an owning account; confirm the correct Minecraft profile appears.
4. Install an official release and confirm download verification completes.
5. Click Play; verify Minecraft reaches its menu and loads a single-player world.
6. Exit Minecraft; confirm Orbit returns to a usable state. Check Logs if the game exits with an error.
7. Restart Orbit, check saved preferences and account refresh, then sign out and confirm the local account is removed.

Live account authentication, Windows installer execution, and loading a Minecraft world require these manual checks; automated fixture/browser tests are not substitutes.

## Cloud development and network access

Use the existing checkout directly; cloud tasks are already isolated. Do not create a Git worktree unless requested. In this cloud machine use writable package/binary caches:

```sh
export NPM_CONFIG_CACHE=/workspace/.cache/npm
export electron_config_cache=/workspace/.cache/electron
export ELECTRON_BUILDER_CACHE=/workspace/.cache/electron-builder
export XDG_CACHE_HOME=/workspace/.cache
export NODE_USE_ENV_PROXY=1
npm ci
npm test
npm run typecheck
npm run build
```

The official release manifest was initially blocked by the cloud proxy. Required network additions were saved in the environment draft; saving a draft does not apply or publish its policy. Review and save environment settings, then publish when you want that configuration active.

Required official services include Mojang/Piston metadata and downloads, `libraries.minecraft.net`, `resources.download.minecraft.net`, Microsoft identity endpoints, Xbox user/device/XSTS endpoints, and `api.minecraftservices.com`. Keep TLS verification and artifact hashes enabled. There is no offline-account bypass or bundled game data.

The published `@xmcl/installer` release inspected during implementation has broken runtime imports. Orbit uses its own focused vanilla adapter around `@xmcl/core` metadata instead. `@xmcl/unzip` is overridden to the last installable published release (`2.1.2`) because `2.2.0` has an invalid entry point and workspace-only dependency. The lockfile retains official package integrity values.

Design: [specification](docs/superpowers/specs/2026-10-21-orbit-launcher-design.md). Development: [implementation plan](docs/superpowers/plans/2026-10-21-orbit-launcher.md).
