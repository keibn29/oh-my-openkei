import * as fs from 'node:fs';
import { getCurrentRuntimePackageJsonPath } from '../hooks/auto-update-checker/checker';
import { INSTALLED_PACKAGE_JSON } from '../hooks/auto-update-checker/constants';
import type { PackageJson } from '../hooks/auto-update-checker/types';

/**
 * Resolves the active installed plugin version, preferring the version
 * installed in OpenCode's cache over the runtime package version.
 *
 * When invoked via `bunx oh-my-openkei@latest`, the runtime package (bunx's
 * temp cache) reflects the npm latest tag, not the version actually installed
 * and active in OpenCode. This function checks the canonical install location
 * first to report the version the user is actually running.
 */
export function getInstalledPluginVersion(): string | null {
  // Prefer the active installed plugin in OpenCode's cache
  try {
    if (fs.existsSync(INSTALLED_PACKAGE_JSON)) {
      const content = fs.readFileSync(INSTALLED_PACKAGE_JSON, 'utf-8');
      const pkg = JSON.parse(content) as PackageJson;
      if (pkg.version) return pkg.version;
    }
  } catch {
    /* empty */
  }

  // Fall back to the runtime package version
  try {
    const runtimePackageJsonPath = getCurrentRuntimePackageJsonPath();
    if (runtimePackageJsonPath && fs.existsSync(runtimePackageJsonPath)) {
      const content = fs.readFileSync(runtimePackageJsonPath, 'utf-8');
      const pkg = JSON.parse(content) as PackageJson;
      if (pkg.version) return pkg.version;
    }
  } catch {
    /* empty */
  }

  return null;
}
