import {
  extractChannel,
  getLatestVersion,
} from '../hooks/auto-update-checker/checker';
import { getInstalledPluginVersion } from './version';

// Colors (matching install.ts)
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/**
 * Checks the current version against the latest available version on npm.
 * Read-only: does not install anything. Reports status to stdout.
 * @returns 0 on success, 1 if the latest version could not be determined.
 */
export async function checkUpdate(): Promise<number> {
  const currentVersion = getInstalledPluginVersion();
  const channel = extractChannel(currentVersion);
  const latestVersion = await getLatestVersion(channel);

  console.log();
  console.log(`${BOLD}oh-my-openkei Update Check${RESET}`);
  console.log('='.repeat(30));
  console.log();

  if (currentVersion) {
    console.log(`  Current version: ${currentVersion}`);
  } else {
    console.log(`  Current version: ${YELLOW}unknown${RESET}`);
  }

  if (latestVersion) {
    console.log(`  Latest version:  ${latestVersion} (${channel} channel)`);
  } else {
    console.log(`  Latest version:  ${YELLOW}could not determine${RESET}`);
    console.log();
    return 1;
  }

  console.log();

  if (currentVersion && currentVersion === latestVersion) {
    console.log(`  ${GREEN}You are on the latest version.${RESET}`);
  } else if (currentVersion) {
    console.log(
      `  ${YELLOW}Update available: ${currentVersion} → ${latestVersion}${RESET}`,
    );
  } else {
    console.log(`  Latest version available: ${latestVersion}`);
  }

  console.log();
  return 0;
}
