#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

(function main() {
  const srcPkg = path.resolve(__dirname, '../src/package.json');
  const destDir = path.resolve(__dirname, '../dist/Luban/src');
  const destPkg = path.join(destDir, 'package.json');

  ensureDirSync(destDir);
  fs.copyFileSync(srcPkg, destPkg);
  // Also ensure a minimal index for server folder exists isn't needed here; only package.json needed for main.js import.
  console.log(`Copied ${srcPkg} -> ${destPkg}`);
})();
