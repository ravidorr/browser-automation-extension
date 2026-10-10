# Changelog

All notable changes to this project are documented here.

## [1.0.5] - 2026-10-10

### Security fixes

- Stop schema validation after the first invalid field.
- Replace obsolete development tooling and update vulnerable transitive dependencies.

## [1.0.4] - 2026-10-10

### Dependencies

- Upgrade dotenv to 18.0.6.

## [1.0.3] - 2026-10-10

### Security

- Reject JSON request bodies larger than 256 KiB before validation.

## [1.0.2] - 2026-10-10

### Fixed

- Use cryptographically secure random identifiers for in-memory storage records.

## [1.0.1] - 2026-10-10

### Changed

- Added the project-quality baseline, including strict linting, tests, coverage, hooks, CI, and GitHub automation.

## [1.0.0]

### Added

- Initial browser automation extension and backend service.
