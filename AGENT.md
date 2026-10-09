# Browser Automation Extension - Agent Guide

Canonical instructions for AI coding agents. `CLAUDE.md` and `GEMINI.md` point here; edit this file only.

## Project

Browser automation extension with a backend service.

## Commands

- Install: `pnpm install`
- Lint: `pnpm run lint`
- Test: `pnpm run test`
- Coverage: `pnpm run test:coverage` (100% lines, functions, branches, and statements; mandatory on push and in CI)
- Build: `pnpm run build`

## Rules

- Never commit with `--no-verify`. Fix the cause when a hook fails.
- This repository uses GitHub issues for ticketing.
- Open pull requests as drafts and link the related GitHub issue.
- Linters are strict: ESLint, Stylelint, html-validate, and markdownlint. Do not weaken rules to pass.
- UI work uses the tokens and components in `/design-system`. Do not hard-code colors or spacing.
- Pin Node with `.nvmrc`; the package manager is pnpm. Keep the lockfile committed.
- PRs that change the package, backend source, or extension source update `CHANGELOG.md` and bump the package version once. Documentation, test-only, and tooling-only PRs do not.
- Track open work in `TODO.md`.

## Layout

- `backend/` - API and automation-decision service.
- `extension/` - Chrome Manifest V3 extension.
- `design-system/` - tokens, components, and showcase.
- `.husky/` - fast pre-commit and broad pre-push checks.
- `.github/` - CI, release, Dependabot, and templates.
