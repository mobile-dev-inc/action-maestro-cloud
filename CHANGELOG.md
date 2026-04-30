# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Removed
- Output `MAESTRO_CLOUD_FLOW_RESULTS` (no replacement; use `--format junit`
  and parse the report if you need machine-readable per-flow results).
- Output `MAESTRO_CLOUD_UPLOAD_STATUS` (use `if: failure()` / `if: success()`
  on subsequent steps).
- Implicit `.mobiledev/` workspace fallback. Default is `.maestro/`; pass
  `workspace: .mobiledev` explicitly if you still rely on the legacy path.
- Pre-upload APK/IPA validation. The Maestro CLI / server validates instead.

### Added
- New input `maestro-cli-version` to pin the installed Maestro CLI version
  (defaults to latest).

### Changed
- Action is now a composite action that invokes the Maestro CLI directly,
  replacing the bundled TypeScript HTTP client. Aligns with the Bitrise step
  and Bitbucket pipe.
- Per-flow log lines now use the CLI's format (e.g. `Passed login.yaml (15s)`)
  instead of v1's `[Passed] login.yaml`.
- Linux (`ubuntu-latest`) and macOS (`macos-latest`) GitHub-hosted runners
  are formally supported. Windows runners are not supported.
