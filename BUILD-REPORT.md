# Orbit Launcher 0.2.0 verification report

Date: 2026-10-22. Implementation: Native in the existing `/workspace/d` checkout, branch `work`. Upgrade baseline: `233cf07`. Final review, its regression-tested fix pass, and Windows CI delivery are complete. Built application/test commit: `afed5731dc633a41d96fd57e2c547b4921194b5a`.

## Implemented

Microsoft system-browser authorization-code PKCE with cancellable loopback callback; publisher build configuration; saved offline account identities; isolated retained Vanilla/Fabric profiles; pinned stable Fabric installation; Modrinth browsing/version/dependency previews; bounded local imports; resource packs, per-world data packs and Iris shaders; managed enable/disable/update/removal; journaled recovery; typed Library IPC and UI.

Actual Fabric metadata is checked before content commit. Live Iris testing found and corrected both an incompatible latest Sodium selection and legitimate duplicate bundled Fabric modules. Supported predicates implement Fabric semantics rather than applying npm caret/exact semantics unchanged. Unsupported predicates or graphs fail explicitly; this is a conservative validator, not a complete replacement for Fabric's SAT solver.

## Verification evidence

- Clean `npm ci`, type checking and production build: exit 0. Windows CI also completed its clean install, type/service/renderer/browser checks and NSIS packaging.
- Automated service/renderer suite: final release suite **160 passed, 1 opt-in live test skipped** across30 test files, including all review regressions.
- Browser flows: **4 passed**, including offline account/install/launch simulation, Fabric profile/mod/per-world data-pack management, empty state and 900×650 overflow checks. These use injected test data.
- Explicit live provider check: official release list, Fabric stable-loader/profile metadata, Modrinth data/shader searches, and real Iris/Sodium bundle download, hashes, installation and manifest compatibility check passed. It did not start Minecraft or render shaders.
- The real production Electron app started under headless Linux using an isolated user-data directory. Its production preload created a saved offline account, resolved stable Fabric loader0.19.5 forMinecraft1.21.1, created a real game profile and returned its empty Library state. The actual Library screen rendered. No test bridge was injected; Minecraft itself was not started. The production desktop smoke check passed again after the review fixes.
- TLS/checksum verification remains enabled; no Microsoft client identity or credentials were borrowed.

## External prerequisites and practical limits

No registered Orbit Microsoft client ID or owning-account session was supplied. Microsoft sign-in remains unavailable in unconfigured builds; offline profiles are usable. Real Microsoft/Xbox/Minecraft login and entitlement validation remain unverified. The publisher registration/build variable instructions are in README.

Actual Windows execution, compatible Java native loading, game startup, opening a world, mod behavior and shader rendering require the README manual acceptance checks. Linux Electron and browser checks do not prove these.

Archive limits: 100000 total entries; 262144 bytes per inspected metadata entry; 1048576 total metadata bytes; nested JARs limited to depth3,64MiB each,128MiB aggregate; outer archives capped512MiB. Unknown pack compatibility requires confirmation. Only a supported subset of Fabric version predicates/graphs is accepted. Physical power-loss durability, exhaustive archive fuzzing and hostile concurrent filesystem mutation were not verified. Unmanaged files are not modified or adopted.

## Delivery

Successful Windows build: [run39700508238](https://github.com/ronaldogoat20202-oss/d/actions/runs/39700508238), full commit `afed5731dc633a41d96fd57e2c547b4921194b5a`.

Download: [run artifacts](https://github.com/ronaldogoat20202-oss/d/actions/runs/39700508238#artifacts) → **Orbit-Launcher-Windows-x64**, artifact ID `12392293581`. Sign into GitHub, download/extract the ZIP and run **Orbit-Launcher-0.2.0-Setup.exe**. The artifact's GitHub archive SHA-256 is `1815a790cece9837f4b6e5e4d4fe8c858a09eb922a5f4a6a3c89004cf5cdd8ef`; this is the uploaded archive digest, not a separately inspected installer executable digest.

The first Windows run (`39700244691`) exposed a test-only path-separator mismatch. The assertion now parses the native classpath delimiter and normalizes each path. The subsequent Windows run above passed; product launch code was unchanged by that correction.

Workspace `.exe` previews are not a download mechanism. The installer is unsigned. Actual execution on the user's Windows machine remains manual. The old0.1.0 portable file is not the updated application.

Cloud configuration was inspected without dropping existing domains or secrets. The final source checkout and corrected startup instructions are prepared for the environment draft. Publishing that draft is a user UI action; current-workspace checks do not prove fresh-task restoration.

## Review and decisions

One fresh gpt-6-astra reviewer inspected the entire upgrade. No Critical findings and five Important findings were identified. All five were accepted and corrected in one fix pass with observed failing regressions followed by the green full suite:

1. Unavailable-world data-pack records are inactive for launch and can be explicitly forgotten without deleting any remaining files.
2. Complete catalog dependency declarations, exact version pins and incompatibilities persist and are enforced on enable and launch without requiring a network request.
3. Vanilla profiles ignore dormant unmanaged Fabric mods.
4. Version selection invalidates pending previews and is disabled during checking.
5. Required dependency versions use their own content kind; pinned/unpinned shader→Iris plans both install correctly.

No review findings were deferred as minor polish. The full suite, types, browser flows, production build, actual provider/Iris check and real Electron smoke were green after the fixes. No second review or per-task reviewer loops were used. Material build warnings were limited to ignored third-party `use client` directives and conflicting color-output variables; no check failed because of them.

### Upgrade rulings

- Ruling: Cloud skill helper scripts/resources are not filesystem-mounted; use extracted task briefs and this manual ledger — same audit record, no product effect.
- Task 3: Ruling: core typing excludes msa although runtime defaults to msa; omit explicit userType only for Microsoft and supply legacy for local — preserves actual SDK behavior — cost if wrong: authenticated argument compatibility, covered by generated-argument tests.
- Task 3: Ruling: core leaves empty clientid/XUID substitutions unresolved; omit these optional Microsoft-only argument pairs for offline launches — represents absent online identity without fake identifiers — cost if wrong: future metadata argument shapes require adapter update; actual generated-argument regression covers current strings/rule arrays.
- Tasks 6/8: Ruling: live Iris1.8.8 forMC1.21.1 requires Sodium0.6.x while catalog latest matchingMC/loader is Sodium0.8.13; resolve actual Fabric metadata dependency version constraints before committing installs, not only catalog project links — necessary for usable shader launch — cost if wrong: conservative rejection of unsupported predicates; tests cover real Iris/Sodium shape.
- Task 6: Ruling: AddonTarget includes requested kind explicitly — v2 datapack search reports mod project_type, so version normalization needs content context — cost if wrong: one extra internal field to migrate.
- Task 7: Ruling: old ZIP stream wrapper stalls under Node24 async iteration; bounded event-based reading verified with real archive and retained per-entry/total limits — cost if wrong: stream error handling regression, covered by malformed and oversized archive tests.
- Task 7: Ruling: inspect actual declared nested mod JARs with depth3,64MiB each,128MiB total bounds, and implement supported Fabric predicate primitives rather than npm range shortcuts — Fabric caret/exact syntax differs — cost if wrong: conservatively rejected future predicates.
- Task 8: Ruling: compatibility planning downloads verified archives before confirmation so actual Iris/Sodium manifest constraints determine the shown dependency plan — API compatibility alone is insufficient — cost if wrong: additional preview bandwidth/cache.
- Task 9: Ruling: addonVersions accepts explicit content kind as well as project ID — preserves datapack context across v2 project-type normalization — cost if wrong: additional typed IPC argument.

- Task 10: Ruling: normalize duplicate bundled module candidates with supported dependency predicates; preserve strict conflict errors for duplicate top-level IDs — actual Iris/Sodium both embed fabric-api-base — cost if wrong: conservative rejection of more complex valid Fabric graphs; real bundle now passes.
- Task 10: Ruling: derive Java requirements from installed official metadata and pass the verified game major at launch; defer Java-specific content checks until metadata exists — version-name guessing breaks modern releases — cost if wrong: a pre-game-install preview may later fail a Java compatibility check before launch.

- Final: Ruling: real Windows installation, Java native loading, gameplay/world loading and shader rendering were not judged — require the README manual acceptance checks and do not claim them from Linux — cost if wrong: platform/game-specific defects remain.
- Final: Ruling: live Microsoft registration, owning-account authentication, refresh and entitlements were not judged — retain the publisher-registration prerequisite because no real identity/account was supplied — cost if wrong: provider/account-specific authentication issues remain.
- Final: Ruling: exhaustive Fabric graphs were not judged — explicitly support a conservative subset with visible errors rather than claiming the full Fabric solver — cost if wrong: valid complex mod bundles can be rejected.
- Final: Ruling: physical power-loss durability, exhaustive archive fuzzing and hostile concurrent filesystem mutation were not judged — retain bounded inspection, containment/digest checks and tested journal recovery while documenting those unverified domains — cost if wrong: hardware failure or adversarial races can require manual repair.
- Final: Ruling: generated installer contents/final delivery were not judged by the reviewer — gate delivery on the exact tested commit succeeding in Windows CI with the expected artifact, and retain manual Windows execution checks — cost if wrong: Windows-only artifact/runtime problems remain.

### Earlier 0.1.0 decisions retained for traceability


The complete execution decisions, including superseded troubleshooting choices, are preserved below with their stated costs:

- Ruling: Cloud skill helper resources are unavailable; maintain equivalent task briefs and ledger locally — preserves traceability without blocked helper scripts — cost if wrong: bookkeeping is manual.
- Task 3: Ruling: @xmcl/unzip 2.2.0 publishes an npm-incompatible workspace dependency — use npm overrides to resolve its @xmcl/yauzl dependency to the official published 2.10.0, retaining tarball integrity — cost if wrong: archive extraction could fail; installation/launch tests and packaging must verify it.
- Task 3: Ruling: unzip 2.2.0 also has a nonexistent package entry point, so the earlier nested override is insufficient — pin its last published installable release 2.1.2 through npm overrides instead — cost if wrong: archive API compatibility; fixture ZIP validation and launch-adapter tests gate acceptance.
- Task 3: Ruling: published installer also imports nonexistent @xmcl/core/utils — replace installer dependency with a narrow vanilla adapter using core-resolved official metadata and our verified staged downloader — avoids broken upstream entry points; cost if wrong: uncommon historical metadata needs additional compatibility work.
- Task 6: Ruling: the supported Wine 11 toolset cannot load ntdll in this Linux machine — produce an additional Windows portable executable and retain the NSIS Windows CI job instead of shipping a partial installer — cost if wrong: Windows installation/uninstallation still needs a Windows build and manual acceptance check.
- Final: Ruling: settings draft loss is Important rather than polish — the usual client-ID-then-browse setup sequence discards necessary configuration, so include its regression/fix in the one review fix pass — cost if wrong: small additional settings-state complexity.
- Final: Ruling: live authorization, gameplay, and Windows execution were not judged by the reviewer — retain explicit unverified status and manual acceptance steps because no real account/Windows runtime was provided — cost if wrong: account/platform-specific issues remain.
- Final: Ruling: reviewer did not judge generated packaging artifacts — accept only after builder exit 0, PE inspection, and Linux packaged-ASAR startup, keeping Windows execution unverified — cost if wrong: Windows-only packaging issues remain.
