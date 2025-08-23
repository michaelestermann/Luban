#!/usr/bin/env node
/**
 * Cross-platform prebuild step for development.
 * The original project referenced a Bash script (build/prebuild-dev.sh) which is not available on Windows.
 * This Node script acts as a safe no-op placeholder to unblock `npm run dev` on Windows without WSL.
 * If future preparatory steps are needed, implement them here in JS.
 */

try {
  console.log('[prebuild-dev] Starting prebuild (no-op)...');
  // Place any required prebuild dev logic here if needed in the future.
  console.log('[prebuild-dev] Done.');
  process.exit(0);
} catch (err) {
  console.error('[prebuild-dev] Failed:', err && err.stack ? err.stack : String(err));
  process.exit(1);
}
