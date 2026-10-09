# Contributing

## Development setup

1. Install Node.js 24.21.0 with `nvm install && nvm use`.
2. Install dependencies with `pnpm install`.
3. Run `pnpm run lint`, `pnpm run typecheck`, and `pnpm run test:coverage`.

## Quality requirements

- Do not use `--no-verify`; fix failing hooks instead.
- Maintain 100% coverage for lines, functions, branches, and statements.
- Use the tokens in `design-system/` for extension UI changes.
- Keep the lockfile and generated extension artifact checks current.

## Changes and pull requests

- Commit subjects must be at least 15 characters.
- Use a descriptive branch name.
- Open pull requests as drafts and reference the related GitHub issue with `Closes #<issue>`.
- Changes to the package, backend source, or extension source require one SemVer bump and a `CHANGELOG.md` entry.
