/**
 * Patches node-gyp/addon.gypi to disable LTCG when using Clang/ClangCL.
 *
 * Node 17+ is built with Clang on Windows, causing node-gyp to use the
 * ClangCL toolset. However, addon.gypi still injects MSVC-style /LTCG flags
 * which are incompatible with LLVM's lld-link, breaking native module builds.
 *
 * Fix: restrict the LTCG condition to `clang==0` (MSVC only).
 */

const fs = require('fs');
const path = require('path');

const addonGypiPath = path.resolve(__dirname, '../node_modules/node-gyp/addon.gypi');

if (!fs.existsSync(addonGypiPath)) {
    console.log('[patch-node-gyp] addon.gypi not found, skipping patch.');
    process.exit(0);
}

const original = fs.readFileSync(addonGypiPath, 'utf8');
const patched = original.replace(
    "['node_with_ltcg==\"true\"', {",
    "['node_with_ltcg==\"true\" and clang==0', {"
);

if (original === patched) {
    console.log('[patch-node-gyp] addon.gypi already patched or pattern not found, skipping.');
} else {
    fs.writeFileSync(addonGypiPath, patched, 'utf8');
    console.log('[patch-node-gyp] Successfully patched node-gyp/addon.gypi (disabled LTCG for Clang).');
}

// Patch threads/package.json to expose ./dist/master/pool-types which webpack 5
// requires for the ClippingPoolManager.worker.ts import but is missing from the
// package's exports map (threads@1.7.0).
const threadsPkgPath = path.resolve(__dirname, '../node_modules/threads/package.json');

if (!fs.existsSync(threadsPkgPath)) {
    console.log('[patch-node-gyp] threads/package.json not found, skipping.');
} else {
    const threadsPkg = JSON.parse(fs.readFileSync(threadsPkgPath, 'utf8'));
    if (threadsPkg.exports && !threadsPkg.exports['./dist/master/pool-types']) {
        threadsPkg.exports['./dist/master/pool-types'] = './dist/master/pool-types.js';
        fs.writeFileSync(threadsPkgPath, JSON.stringify(threadsPkg, null, 2), 'utf8');
        console.log('[patch-node-gyp] Patched threads/package.json (added ./dist/master/pool-types export).');
    } else {
        console.log('[patch-node-gyp] threads/package.json already patched, skipping.');
    }
}
