import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

/**
 * Mock the checker module for extractChannel and getLatestVersion.
 * Note: Bun's mock.module is process-global, so we include ALL exports
 * from the real checker module to avoid breaking other test files.
 */
const checkerMocks = {
  extractChannel: mock(() => 'latest'),
  getCachedVersion: mock(() => null),
  getLatestVersion: mock(async () => null),
  findPluginEntry: mock(() => null),
  getCurrentRuntimePackageJsonPath: mock(() => null),
  getLocalDevVersion: mock(() => null),
  updatePinnedVersion: mock(() => false),
};

mock.module('../hooks/auto-update-checker/checker', () => checkerMocks);

/**
 * Mock the version module so checkUpdate uses a controlled version.
 */
const versionMocks = {
  getInstalledPluginVersion: mock(() => null),
};

mock.module('./version', () => versionMocks);

let importCounter = 0;

describe('check-update', () => {
  beforeEach(() => {
    checkerMocks.extractChannel.mockReset();
    checkerMocks.extractChannel.mockImplementation(() => 'latest');
    checkerMocks.getCachedVersion.mockReset();
    checkerMocks.getCachedVersion.mockImplementation(() => null);
    checkerMocks.getLatestVersion.mockReset();
    checkerMocks.getLatestVersion.mockImplementation(async () => null);
    checkerMocks.findPluginEntry.mockReset();
    checkerMocks.findPluginEntry.mockImplementation(() => null);
    checkerMocks.getCurrentRuntimePackageJsonPath.mockReset();
    checkerMocks.getCurrentRuntimePackageJsonPath.mockImplementation(
      () => null,
    );
    checkerMocks.getLocalDevVersion.mockReset();
    checkerMocks.getLocalDevVersion.mockImplementation(() => null);
    checkerMocks.updatePinnedVersion.mockReset();
    checkerMocks.updatePinnedVersion.mockImplementation(() => false);

    versionMocks.getInstalledPluginVersion.mockReset();
    versionMocks.getInstalledPluginVersion.mockImplementation(() => null);
  });

  afterEach(() => {
    // Mocks are automatically cleared by Bun's test runner between tests
  });

  test('reports up-to-date when versions match', async () => {
    versionMocks.getInstalledPluginVersion.mockImplementation(() => '1.0.0');
    checkerMocks.getLatestVersion.mockImplementation(async () => '1.0.0');

    const { checkUpdate } = await import(
      `./check-update?test=${importCounter++}`
    );
    const result = await checkUpdate();

    expect(result).toBe(0);
    expect(versionMocks.getInstalledPluginVersion).toHaveBeenCalled();
    expect(checkerMocks.extractChannel).toHaveBeenCalledWith('1.0.0');
  });

  test('reports update available when latest is newer', async () => {
    versionMocks.getInstalledPluginVersion.mockImplementation(() => '1.0.0');
    checkerMocks.getLatestVersion.mockImplementation(async () => '1.1.0');

    const { checkUpdate } = await import(
      `./check-update?test=${importCounter++}`
    );
    const result = await checkUpdate();

    expect(result).toBe(0);
  });

  test('returns error code when latest version fetch fails', async () => {
    versionMocks.getInstalledPluginVersion.mockImplementation(() => '1.0.0');
    checkerMocks.getLatestVersion.mockImplementation(async () => null);

    const { checkUpdate } = await import(
      `./check-update?test=${importCounter++}`
    );
    const result = await checkUpdate();

    expect(result).toBe(1);
  });

  test('handles unknown current version gracefully', async () => {
    versionMocks.getInstalledPluginVersion.mockImplementation(() => null);
    checkerMocks.getLatestVersion.mockImplementation(async () => '1.0.0');

    const { checkUpdate } = await import(
      `./check-update?test=${importCounter++}`
    );
    const result = await checkUpdate();

    expect(result).toBe(0);
  });

  test('prefers installed over runtime version', async () => {
    versionMocks.getInstalledPluginVersion.mockImplementation(() => '0.9.1');
    checkerMocks.getLatestVersion.mockImplementation(async () => '1.0.0');

    const { checkUpdate } = await import(
      `./check-update?test=${importCounter++}`
    );
    const result = await checkUpdate();

    expect(result).toBe(0);
    expect(versionMocks.getInstalledPluginVersion).toHaveBeenCalled();
  });
});
