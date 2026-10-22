# Library Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Native implementation; read-only research and one fresh final review.

**Goal:** Match the supplied catalog/detail references and add working Modpacks and Servers.
**Architecture:** Enrich the existing typed Modrinth adapter and Library state machine. Add bounded modpack installation and a local server store behind the existing trusted IPC/controller boundary. Reuse downloads, profiles, launch and compatibility preview infrastructure.
**Tech Stack:** Electron, TypeScript, React, react-markdown, Modrinth v2, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-10-22-library-browser-design.md

## Global Constraints

- Six working tabs; real metadata, Vanilla/Fabric only, separate modpack profiles.
- Native execution in existing /workspace/d checkout; retain all prior account/content safeguards.
- Remote Markdown has no HTML; images only HTTPS cdn.modrinth.com; system-browser links only public HTTPS.
- Windows x64, minimum 900×650; actual Windows CI artifact delivery.

## Review Focus

- Late project/version/preview results must not affect another profile, tab or selection.
- Markdown and icons must not enable scripts, local navigation or arbitrary remote images.
- Malicious archives and interrupted modpack downloads must not modify existing profiles.
- Server address input must not become JVM options or shell syntax.
- Long descriptions, missing icons and minimum window size must remain usable.

### Task 1: Catalog and project pages

**Files:** shared/addons.ts, shared/contracts.ts, main/adapters/modrinth.ts, main/controller.ts, main/ipc.ts, preload/index.ts, main/window.ts, main/index.ts, renderer/components/{LibraryView,AddonDetails,CatalogProject}.tsx, renderer/styles.css, renderer/index.html; provider/renderer/E2E tests.
**Interfaces:** CatalogKind = AddonKind | 'modpack'; CatalogSort five provider values; CatalogProjectDetails includes body; addonDetails(id,kind), openProjectLink(url); search sort/limit propagated through trusted IPC.

- [ ] Add failing provider tests for real metadata, sort and bounded safe description/icon fields; run targeted test and confirm RED.
- [ ] Enrich provider/contracts/IPC and safe link/image policies; run provider/security tests and typecheck.
- [ ] Add failing renderer tests for detail/back/versions, sort/limit pagination, unsafe Markdown and stale descriptions; confirm RED.
- [ ] Implement full-width rows, six-tab container and full Description/Versions screen; retain installed/import/recovery controls.
- [ ] Verify renderer tests and full unit suite, commit.

### Task 2: Modpacks

**Files:** shared/modpacks.ts, main/services/modpacks.ts, main/services/profiles.ts, main/controller.ts, main/index.ts, shared/contracts.ts, main/ipc.ts, preload/index.ts, renderer/components/LibraryView.tsx and AddonDetails.tsx; tests/main/modpacks.test.ts and renderer/E2E fixtures.
**Interfaces:** previewModpack(versionId) returns immutable preview with id/name/MC/loader/files/bytes/optional count; installModpack(previewId) stages and verifies before publishing a new selected profile. Catalog modpack versions retain kind and .mrpack primary file.

- [ ] Test a real miniature mrpack ZIP with Fabric dependency, overrides, client/server/optional semantics, checksums and profile isolation; run and confirm RED.
- [ ] Test traversal, symlink, duplicate/case collision, unsupported loader, checksum failure, stale preview and oversized metadata limits; confirm RED.
- [ ] Implement bounded archive preview, verified staged downloads, exact loader profile creation and safe cleanup/rollback.
- [ ] Wire preview/install to project details with clear new-profile target and unsupported-loader copy.
- [ ] Run relevant tests and full suite, commit.

### Task 3: Servers and delivery

**Files:** shared/servers.ts, main/services/servers.ts, main/adapters/minecraft-launcher.ts, main/controller.ts, main/index.ts, shared/contracts.ts, main/ipc.ts, preload/index.ts, renderer/components/ServersView.tsx, renderer/components/LibraryView.tsx; server/launch/renderer/E2E tests; README/BUILD-REPORT/package/workflow as needed.
**Interfaces:** getServers, saveServer({id?,name,address}), removeServer(id), joinServer(id). Main derives validated saved address; launch adapter emits safe Quick Play or legacy flags.

- [ ] Add failing persistence/address/launch argument and renderer save/edit/remove/join tests; confirm RED.
- [ ] Implement server store and join without changing existing launch authorization/operation locks.
- [ ] Verify full unit suite, typecheck, production build, E2E at minimum size and native Electron smoke.
- [ ] Fresh whole-change review; fix substantive findings with regression tests; record validation and limitations.
- [ ] Bump release, push authorized work branch, verify actual Windows CI at exact SHA and link installer artifact.
