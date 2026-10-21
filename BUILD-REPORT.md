# Orbit Launcher build report

Date: 2026-10-21. Implementation: Native. Production code commit: `1806cf0`.

## What you can test

On Windows x64, open `release/Orbit-Launcher-0.1.0-Portable.exe`. It contains the Electron app and needs no Node.js installation. Configure your own public Microsoft application ID and a compatible x64 Java executable in Settings before playing. Sign-in may require Minecraft API approval for that application. Game files can be installed before sign-in.

For source testing, extract `Orbit-Launcher-0.1.0-Source.zip`, open PowerShell in its project folder, then run `npm ci` and `npm run dev`. These local commits have not been pushed or published.

## Verified in the cloud

- A clean `npm ci`, including the explicit Electron binary installation, completed.
- `npm run typecheck` and `npm run build` passed.
- `npm test`: **61 passed**, 15 test files.
- `npm run test:e2e`: **3 passed**, using the browser test bridge.
- The real built Electron app started, rendered its Play screen, and returned signed-out/idle state through the production preload bridge under headless Linux.
- The packaged production `app.asar` also started under Linux Electron. Both smoke processes closed afterward.
- The pinned core/archive combination extracted and read a temporary ZIP native-library fixture correctly; no native DLL was executed.
- `npm run dist:portable` completed with exit 0 after the review fixes. Its outer executable is a self-extracting Windows wrapper; its inner application is Windows x64.
- Artifact TLS and published package/artifact checksum validation stayed enabled.

## Review and corrections

One fresh independent whole-branch review found no Critical findings, two Important findings, and a settings issue reclassified as Important because it discards required first-run configuration. All three were corrected in one fix pass, with observed failing regressions followed by a green full suite:

1. Signing out invalidates a pending launch, including the actual process-spawn boundary after asynchronous core prechecks. Regression tests require zero game spawns.
2. Detecting a corrupt installation removes the installed indicator and exposes the Install action for repair; the fixture test repairs it successfully.
3. Browsing for Java or a game folder preserves unsaved settings such as the public application ID.

No review findings were deferred as minor polish. The corrections were verified by regression tests rather than a second review.

## Still unverified or blocked

- Live Microsoft/Xbox/Minecraft account authentication and entitlement checks: no real application registration/account was supplied.
- Opening the executable on a real Windows machine, Java native-library loading there, and loading a Minecraft world: use the README manual checklist.
- Real game downloads in this cloud instance: the original official metadata request received a proxy denial. Required domains were saved in the draft; that does not apply the policy.
- The NSIS Setup installer: the Linux Wine toolset failed to load `ntdll`. Partial Setup executables were removed. The included Windows CI job can build it, but that job has not run here.

The portable executable is **unsigned**. A successful cross-build and Linux packaged-archive smoke check do not prove Windows gameplay.

## Reusable cloud configuration

The environment draft contains tested installation instructions, startup/check instructions, and the twelve required official Minecraft/Microsoft/Xbox domains, preserving package-manager presets. No secret values were saved. Review and save environment settings, then publish to activate the prepared configuration. Saving a draft does not apply network policy or publish a filesystem snapshot. Fresh-task restoration has not been tested; local-only commits remain local, so the source ZIP is also provided.

## Rulings I made

The complete execution decisions, including superseded troubleshooting choices, are preserved below with their stated costs:

- Ruling: Cloud skill helper resources are unavailable; maintain equivalent task briefs and ledger locally — preserves traceability without blocked helper scripts — cost if wrong: bookkeeping is manual.
- Task 3: Ruling: @xmcl/unzip 2.2.0 publishes an npm-incompatible workspace dependency — use npm overrides to resolve its @xmcl/yauzl dependency to the official published 2.10.0, retaining tarball integrity — cost if wrong: archive extraction could fail; installation/launch tests and packaging must verify it.
- Task 3: Ruling: unzip 2.2.0 also has a nonexistent package entry point, so the earlier nested override is insufficient — pin its last published installable release 2.1.2 through npm overrides instead — cost if wrong: archive API compatibility; fixture ZIP validation and launch-adapter tests gate acceptance.
- Task 3: Ruling: published installer also imports nonexistent @xmcl/core/utils — replace installer dependency with a narrow vanilla adapter using core-resolved official metadata and our verified staged downloader — avoids broken upstream entry points; cost if wrong: uncommon historical metadata needs additional compatibility work.
- Task 6: Ruling: the supported Wine 11 toolset cannot load ntdll in this Linux machine — produce an additional Windows portable executable and retain the NSIS Windows CI job instead of shipping a partial installer — cost if wrong: Windows installation/uninstallation still needs a Windows build and manual acceptance check.
- Final: Ruling: settings draft loss is Important rather than polish — the usual client-ID-then-browse setup sequence discards necessary configuration, so include its regression/fix in the one review fix pass — cost if wrong: small additional settings-state complexity.
- Final: Ruling: live authorization, gameplay, and Windows execution were not judged by the reviewer — retain explicit unverified status and manual acceptance steps because no real account/Windows runtime was provided — cost if wrong: account/platform-specific issues remain.
- Final: Ruling: reviewer did not judge generated packaging artifacts — accept only after builder exit 0, PE inspection, and Linux packaged-ASAR startup, keeping Windows execution unverified — cost if wrong: Windows-only packaging issues remain.

## Artifact

Portable size: 102396947 bytes.

Portable SHA-256: `fac1f7e40eebe5ac19e0258ff6e147f5fcb54e10cd7a30868a314dce2bb1e452`.

See `release/SHA256SUMS` for the generated portable and source archive checksums.
