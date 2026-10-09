import { describe, expect, it } from 'vitest';

import {
  assertTagMatchesPackageVersion,
  extractChangelogNotes,
  requiresRelease,
  validateRelease,
} from '../scripts/check-release.mjs';

const changelog = `# Changelog

## [1.0.1] - 2026-10-10

### Changed

- Added quality checks.
`;

describe('check-release', () => {
  it('requires a release for application source changes', () => {
    expect(requiresRelease(['backend/src/index.ts'])).toBe(true);
    expect(requiresRelease(['extension/popup.js'])).toBe(true);
    expect(requiresRelease(['README.md'])).toBe(false);
  });

  it('validates a patch version and its changelog entry', () => {
    expect(() => validateRelease('1.0.0', '1.0.1', changelog)).not.toThrow();
    expect(extractChangelogNotes(changelog, '1.0.1')).toContain('Added quality checks.');
  });

  it('rejects a mismatched tag version', () => {
    expect(() => assertTagMatchesPackageVersion('v1.0.0', '1.0.1')).toThrow(
      'does not match',
    );
  });
});
