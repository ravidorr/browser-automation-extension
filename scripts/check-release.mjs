import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import semver from 'semver';

const RELEASE_TRIGGER_ROOT_FILES = new Set([
  'tsconfig.json',
  'backend/package.json',
  'backend/tsconfig.json',
  'extension/manifest.json',
]);

function compareSemver(left, right) {
  return semver.compare(left, right);
}

export function extractChangelogNotes(changelog, version) {
  const headerPrefix = `## [${version}]`;
  const lines = changelog.split('\n');
  let collecting = false;
  const notes = [];

  for (const line of lines) {
    if (line.startsWith('## [')) {
      if (collecting) {
        break;
      }

      if (line.startsWith(headerPrefix)) {
        collecting = true;
      }

      continue;
    }

    if (collecting) {
      notes.push(line);
    }
  }

  return notes.join('\n');
}

function assertChangelogContainsVersion(changelog, version) {
  if (!changelog.includes(`## [${version}]`)) {
    throw new Error(`CHANGELOG.md must contain a section for ${version}`);
  }

  if (!extractChangelogNotes(changelog, version).trim()) {
    throw new Error(`CHANGELOG.md section for ${version} must not be empty`);
  }
}

export function validateRelease(baseVersion, currentVersion, changelog) {
  if (baseVersion === currentVersion) {
    throw new Error('package version must change');
  }

  if (compareSemver(currentVersion, baseVersion) <= 0) {
    throw new Error('package version must increase');
  }

  assertChangelogContainsVersion(changelog, currentVersion);
}

export function hasReleaseRelevantPackageChanges(basePackageJson, currentPackageJson) {
  const baseReleaseMetadata = Object.fromEntries(
    Object.entries(basePackageJson).filter(([field]) => field !== 'devDependencies'),
  );
  const currentReleaseMetadata = Object.fromEntries(
    Object.entries(currentPackageJson).filter(([field]) => field !== 'devDependencies'),
  );

  return !isDeepStrictEqual(baseReleaseMetadata, currentReleaseMetadata);
}

export function requiresRelease(changedFiles, basePackageJson, currentPackageJson) {
  return changedFiles.some(
    (file) => {
      if (file === 'package.json') {
        return hasReleaseRelevantPackageChanges(basePackageJson, currentPackageJson);
      }

      return (
        RELEASE_TRIGGER_ROOT_FILES.has(file) ||
        file.startsWith('backend/src/') ||
        file.startsWith('extension/')
      );
    },
  );
}

export function assertTagMatchesPackageVersion(tagName, packageVersion) {
  const tagVersion = tagName.startsWith('v') ? tagName.slice(1) : tagName;

  if (tagVersion !== packageVersion) {
    throw new Error(`tag ${tagVersion} does not match package.json version ${packageVersion}`);
  }
}

export function assertReleaseNotesPresent(releaseNotes) {
  if (!releaseNotes.trim()) {
    throw new Error('release notes must not be empty');
  }
}

export function validateTaggedRelease({
  tagName,
  packageVersion,
  changelog,
  releaseNotes,
}) {
  assertTagMatchesPackageVersion(tagName, packageVersion);
  assertChangelogContainsVersion(changelog, packageVersion);
  assertReleaseNotesPresent(releaseNotes);
}

function readPackageJson(ref) {
  try {
    const packageJson = execFileSync('git', ['show', `${ref}:package.json`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return JSON.parse(packageJson);
  } catch {
    return null;
  }
}

function readPackageVersion(ref) {
  return readPackageJson(ref)?.version ?? null;
}

function readChangedFiles(baseRef) {
  return execFileSync('git', ['diff', '--name-only', `${baseRef}...HEAD`], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);
}

export function runReleaseGate({
  baseRef,
  readBasePackageVersion = readPackageVersion,
  readBasePackageJson = readPackageJson,
  readDiffFiles = readChangedFiles,
  readCurrentPackageJson = () => JSON.parse(readFileSync('package.json', 'utf8')),
  readChangelog = () => readFileSync('CHANGELOG.md', 'utf8'),
}) {
  if (!baseRef) {
    throw new Error('BASE_REF is required');
  }

  if (/^0+$/.test(baseRef)) {
    return;
  }

  const baseVersion = readBasePackageVersion(baseRef);

  if (!baseVersion) {
    return;
  }

  const currentPackageJson = readCurrentPackageJson();

  if (!requiresRelease(
    readDiffFiles(baseRef),
    readBasePackageJson(baseRef),
    currentPackageJson,
  )) {
    return;
  }

  validateRelease(baseVersion, currentPackageJson.version, readChangelog());
}

function runExtractReleaseNotes(version) {
  if (!version) {
    throw new Error('release version is required');
  }

  const notes = extractChangelogNotes(readFileSync('CHANGELOG.md', 'utf8'), version);
  writeFileSync('release-notes.md', `${notes.trimEnd()}\n`);
}

function runTagReleaseValidation(tagName) {
  if (!tagName) {
    throw new Error('tag name is required');
  }

  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  validateTaggedRelease({
    tagName,
    packageVersion: packageJson.version,
    changelog: readFileSync('CHANGELOG.md', 'utf8'),
    releaseNotes: readFileSync('release-notes.md', 'utf8'),
  });
}

function main() {
  const extractFlagIndex = process.argv.indexOf('--extract-release-notes');

  if (extractFlagIndex !== -1) {
    runExtractReleaseNotes(process.argv[extractFlagIndex + 1]);
    return;
  }

  const tagFlagIndex = process.argv.indexOf('--tag');

  if (tagFlagIndex !== -1) {
    runTagReleaseValidation(process.argv[tagFlagIndex + 1]);
    return;
  }

  runReleaseGate({ baseRef: process.env.BASE_REF });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
