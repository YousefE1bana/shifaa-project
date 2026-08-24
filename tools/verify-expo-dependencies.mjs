import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const patientRoot = join(root, 'apps', 'patient');
const patientRequire = createRequire(join(patientRoot, 'package.json'));
const patientPackage = JSON.parse(await readFile(join(patientRoot, 'package.json'), 'utf8'));
const dependencies = {
  ...patientPackage.dependencies,
  ...patientPackage.devDependencies,
};

const expoPackagePath = patientRequire.resolve('expo/package.json');
const expoPackage = JSON.parse(await readFile(expoPackagePath, 'utf8'));
const bundledVersions = JSON.parse(
  await readFile(join(dirname(expoPackagePath), 'bundledNativeModules.json'), 'utf8'),
);
const expoRequire = createRequire(expoPackagePath);
const semver = expoRequire('semver');

const packageNames = [
  'expo',
  ...Object.keys(dependencies).filter((name) => Object.hasOwn(bundledVersions, name)),
].filter((name, index, values) => values.indexOf(name) === index);

for (const packageName of packageNames) {
  const declaredRange = dependencies[packageName];
  assert.equal(
    typeof declaredRange,
    'string',
    `${packageName} must have an explicit patient-app dependency range`,
  );
  const installedPackage = JSON.parse(
    await readFile(patientRequire.resolve(`${packageName}/package.json`), 'utf8'),
  );
  assert.ok(
    semver.satisfies(installedPackage.version, declaredRange, { includePrerelease: true }),
    `${packageName}@${installedPackage.version} does not satisfy declared range ${declaredRange}`,
  );
  const bundledRange = bundledVersions[packageName];
  if (bundledRange) {
    assert.ok(
      semver.satisfies(installedPackage.version, bundledRange, { includePrerelease: true }),
      `${packageName}@${installedPackage.version} does not satisfy expo@${expoPackage.version} bundled range ${bundledRange}`,
    );
  }
}

process.stdout.write(
  `Expo dependency verification passed: ${packageNames.length} installed patient dependencies satisfy declared ranges and the expo@${expoPackage.version} bundled native-module map.\n`,
);
