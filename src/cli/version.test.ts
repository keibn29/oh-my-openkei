import { describe, expect, mock, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';

// Mock modules required by transitive imports
mock.module('../hooks/auto-update-checker/checker', () => ({
  getCurrentRuntimePackageJsonPath: mock(() => null),
  extractChannel: mock(() => 'latest'),
  getCachedVersion: mock(() => null),
  getLatestVersion: mock(async () => null),
  findPluginEntry: mock(() => null),
  getLocalDevVersion: mock(() => null),
  updatePinnedVersion: mock(() => false),
}));

mock.module('../../utils/logger', () => ({
  log: mock(() => {}),
}));

mock.module('../../cli/config-manager', () => ({
  stripJsonComments: (s: string) => s,
  getOpenCodeConfigPaths: () => ['/mock/opencode.json', '/mock/opencode.jsonc'],
}));

let importCounter = 0;

describe('getInstalledPluginVersion', () => {
  test('prefers version from INSTALLED_PACKAGE_JSON over runtime', async () => {
    const existsSpy = spyOn(fs, 'existsSync').mockImplementation(
      (p: string) =>
        typeof p === 'string' &&
        p.includes('.cache/opencode/node_modules/oh-my-openkei/package.json'),
    );
    const readSpy = spyOn(fs, 'readFileSync').mockImplementation(
      (p: string) => {
        if (
          typeof p === 'string' &&
          p.includes('.cache/opencode/node_modules/oh-my-openkei/package.json')
        ) {
          return JSON.stringify({ name: 'oh-my-openkei', version: '0.9.1' });
        }
        return JSON.stringify({ name: 'oh-my-openkei', version: '99.99.99' });
      },
    );

    const { getInstalledPluginVersion } = await import(
      `./version?test=${importCounter++}`
    );
    const result = getInstalledPluginVersion();

    expect(result).toBe('0.9.1');

    existsSpy.mockRestore();
    readSpy.mockRestore();
  });

  test('returns null when no version source is available', async () => {
    const existsSpy = spyOn(fs, 'existsSync').mockReturnValue(false);

    const { getInstalledPluginVersion } = await import(
      `./version?test=${importCounter++}`
    );
    const result = getInstalledPluginVersion();

    expect(result).toBeNull();

    existsSpy.mockRestore();
  });
});
