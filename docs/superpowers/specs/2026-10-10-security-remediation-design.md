# Security remediation design

## Goal

Resolve the open CodeQL and Dependabot findings, and the production `fast-uri`
finding reported by `pnpm audit`.

## Backend validation

The backend keeps its 256 KiB JSON and URL-encoded request limits. The Ajv
instance will no longer use `allErrors: true`, so validation stops after the
first error instead of allocating an unbounded error list for attacker-supplied
objects. Existing validation tests will retain their valid and invalid payload
coverage and add coverage for the first-error behavior if it is observable.

## Dependency remediation

The backend development watcher will move from `ts-node-dev` to `tsx watch`.
This removes the obsolete `glob`, `minimatch`, `brace-expansion`, and `diff`
subtree.

The root pnpm overrides will pin the remaining vulnerable transitive
dependencies to their patched versions:

- `fast-uri` 3.1.8
- `braces` 3.0.4
- `picomatch` 2.3.2
- `form-data` 4.0.6
- `smol-toml` 1.9.0
- `katex` 0.18.2

The lockfile will be regenerated with the repository's pinned Node 24 runtime
and pnpm 11.18.0. We will prefer updates to direct dependencies where they
eliminate vulnerable subtrees and use overrides only for packages that remain
transitive.

## Release and verification

Because the backend source and package configuration change, this is a patch
release: bump the root package from 1.0.4 to 1.0.5 and add a Security entry to
the changelog.

Verification will run linting, typechecking, coverage tests, the production and
full dependency audits, and the project build. The expected result is no
remaining findings in the installed dependency graph and no CodeQL detection
of unbounded Ajv error collection.
