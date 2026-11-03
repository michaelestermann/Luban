#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');
const cli = require.resolve('electron-builder/cli.js');
const args = process.argv.slice(2);
// Let electron-builder install/rebuild native dependencies for each target architecture.
const result = spawnSync(process.execPath, [cli, ...args, '--publish', 'never'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, USE_HARD_LINKS: 'false' }
});
if (result.error) console.error(result.error.message);
process.exit(result.status === null ? 1 : result.status);
