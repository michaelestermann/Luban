#!/usr/bin/env node
/**
 * Cross-platform prebuild step for production.
 *
 * Prepares dist/Luban for electron-builder packaging:
 *  - cleans previous build output
 *  - copies src/package.json to dist/Luban/
 *  - copies bundled resources (print-settings, fonts, scenes, case library, ...)
 *    from submodules and the repo into dist/Luban/resources/
 *
 * Babel compilation of main.js / electron-app / server-cli is handled by
 * the `postbuild` script (build:main:dist + copy-app-pkg), not here.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const destDir = path.join(repoRoot, 'dist', 'Luban');
const outputDir = path.join(repoRoot, 'output');
const resourcesDir = path.join(destDir, 'resources');

function rimraf(target) {
    if (!fs.existsSync(target)) return;
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) {
        console.warn(`[prebuild-prod]   skipped (missing): ${src}`);
        return;
    }
    fs.cpSync(src, dest, { recursive: true });
}

function copyFile(src, dest) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
}

try {
    console.log('[prebuild-prod] Starting prebuild...');

    // Cleanup
    rimraf(outputDir);
    ensureDir(outputDir);
    rimraf(destDir);
    ensureDir(destDir);

    // Copy package.json to dist/Luban (used by electron-builder as app package)
    copyFile(
        path.join(repoRoot, 'src', 'package.json'),
        path.join(destDir, 'package.json')
    );

    // Resources directory
    ensureDir(resourcesDir);

    // Print settings (submodule)
    const printSettingsSrc = path.join(repoRoot, 'packages', 'luban-print-settings', 'resources');
    const printSettingsDest = path.join(resourcesDir, 'print-settings');
    ensureDir(printSettingsDest);
    if (fs.existsSync(printSettingsSrc)) {
        for (const entry of fs.readdirSync(printSettingsSrc)) {
            copyRecursive(path.join(printSettingsSrc, entry), path.join(printSettingsDest, entry));
        }
    } else {
        console.warn(`[prebuild-prod]   missing submodule: ${printSettingsSrc} (run: git submodule update --init)`);
    }

    // Print settings docs (submodule)
    const printDocsSrc = path.join(repoRoot, 'packages', 'luban-print-settings-docs');
    const printDocsDest = path.join(resourcesDir, 'print-settings-docs');
    ensureDir(printDocsDest);
    if (fs.existsSync(printDocsSrc)) {
        for (const entry of fs.readdirSync(printDocsSrc)) {
            if (entry === '.git' || entry === '.github') continue;
            copyRecursive(path.join(printDocsSrc, entry), path.join(printDocsDest, entry));
        }
    } else {
        console.warn(`[prebuild-prod]   missing submodule: ${printDocsSrc}`);
    }

    // Other resources bundled with the repo / submodules
    const otherResources = ['fonts', 'luban-case-library', 'scenes', 'engine-test'];
    for (const name of otherResources) {
        copyRecursive(
            path.join(repoRoot, 'resources', name),
            path.join(resourcesDir, name)
        );
    }

    console.log('[prebuild-prod] Done.');
    process.exit(0);
} catch (err) {
    console.error('[prebuild-prod] Failed:', err && err.stack ? err.stack : String(err));
    process.exit(1);
}
