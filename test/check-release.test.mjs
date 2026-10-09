import { describe, expect, it } from 'vitest';

import {
  assertTagMatchesPackageVersion,
  extractChangelogNotes,
  requiresRelease,
  runReleaseGate,
  validateRelease,
} from '../scripts/check-release.mjs';

const changelog = `# Changelog

## [1.0.1] - 2026-10-10

### Changed

- Added quality checks.
`;

const basePackageJson = {
  name: 'browser-automation-extension',
  version: '1.0.1',
  devDependencies: { 'js-yaml': '^4.1.0' },
};

function runReleaseGateForPackageChange(currentPackageJson) {
  return () => runReleaseGate({
    baseRef: 'origin/main',
    readBasePackageVersion: () => '1.0.1',
    readBasePackageJson: () => basePackageJson,
    readDiffFiles: () => ['package.json'],
    readCurrentPackageJson: () => currentPackageJson,
    readChangelog: () => changelog,
  });
}

function runReleaseGateForBackendPackageChange(
  baseBackendPackageJson,
  currentBackendPackageJson,
) {
  return () => runReleaseGate({
    baseRef: 'origin/main',
    readBasePackageVersion: () => '1.0.1',
    readBasePackageJson: (packagePath) =>
      packagePath === 'backend/package.json' ? baseBackendPackageJson : basePackageJson,
    readDiffFiles: () => ['backend/package.json'],
    readCurrentPackageJson: (packagePath) =>
      packagePath === 'backend/package.json' ? currentBackendPackageJson : basePackageJson,
    readChangelog: () => changelog,
  });
}

describe('check-release', () => {
  it('requires a release for application source changes', () => {
    expect(requiresRelease(['backend/src/index.ts'])).toBe(true);
    expect(requiresRelease(['extension/popup.js'])).toBe(true);
    expect(requiresRelease(['README.md'])).toBe(false);
  });

  it('does not require a release for dev-dependency-only manifest changes', () => {
    const devDependencyOnlyChange = {
      ...basePackageJson,
      devDependencies: { 'js-yaml': '^4.3.2' },
    };
    const runtimeDependencyChange = {
      ...devDependencyOnlyChange,
      dependencies: { semver: '^7.8.5' },
    };
    const metadataChange = {
      ...devDependencyOnlyChange,
      description: 'Updated browser automation extension',
    };

    expect(requiresRelease(['package.json'], basePackageJson, devDependencyOnlyChange)).toBe(false);
    expect(requiresRelease(['package.json'], basePackageJson, runtimeDependencyChange)).toBe(true);
    expect(requiresRelease(['package.json'], basePackageJson, metadataChange)).toBe(true);
  });

  it('does not require a release for backend dev-dependency-only manifest changes', () => {
    const baseBackendPackageJson = {
      name: 'backend',
      version: '1.0.0',
      devDependencies: { typescript: '^6.0.3' },
    };
    const currentBackendPackageJson = {
      ...baseBackendPackageJson,
      devDependencies: { typescript: '^6.1.0' },
    };

    expect(requiresRelease(
      ['backend/package.json'],
      { 'backend/package.json': baseBackendPackageJson },
      { 'backend/package.json': currentBackendPackageJson },
    )).toBe(false);
    expect(runReleaseGateForBackendPackageChange(
      baseBackendPackageJson,
      currentBackendPackageJson,
    )).not.toThrow();
  });

  it('requires a release for backend runtime dependency changes', () => {
    const baseBackendPackageJson = {
      name: 'backend',
      version: '1.0.0',
      devDependencies: { typescript: '^6.0.3' },
    };
    const currentBackendPackageJson = {
      ...baseBackendPackageJson,
      dependencies: { express: '^5.0.0' },
    };

    expect(requiresRelease(
      ['backend/package.json'],
      { 'backend/package.json': baseBackendPackageJson },
      { 'backend/package.json': currentBackendPackageJson },
    )).toBe(true);
    expect(runReleaseGateForBackendPackageChange(
      baseBackendPackageJson,
      currentBackendPackageJson,
    )).toThrow('package version must change');
  });

  it('skips validation for dev-dependency-only package changes', () => {
    const currentPackageJson = {
      ...basePackageJson,
      devDependencies: { 'js-yaml': '^4.3.2' },
    };

    expect(runReleaseGateForPackageChange(currentPackageJson)).not.toThrow();
  });

  it('requires validation for runtime dependency package changes', () => {
    const currentPackageJson = {
      ...basePackageJson,
      dependencies: { semver: '^7.8.5' },
    };

    expect(runReleaseGateForPackageChange(currentPackageJson)).toThrow(
      'package version must change',
    );
  });

  it('requires validation for package metadata changes', () => {
    const currentPackageJson = {
      ...basePackageJson,
      description: 'Updated browser automation extension',
    };

    expect(runReleaseGateForPackageChange(currentPackageJson)).toThrow(
      'package version must change',
    );
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

  it('skips the gate when the base branch has no package manifest', () => {
    expect(() => runReleaseGate({
      baseRef: 'origin/main',
      readBasePackageVersion: () => null,
      readChangelog: () => changelog,
      readCurrentPackageJson: () => ({ version: '1.0.1' }),
      readDiffFiles: () => ['package.json'],
    })).not.toThrow();
  });
});
