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
  console.log(`Copied ${srcPkg} -> ${destPkg}`);

  // Also copy to dist/Luban/package.json so that `npm install --omit=dev`
  // inside dist/Luban uses the right package.json and doesn't walk up to the
  // root, which would wrongly trigger the root postinstall scripts.
  const distLubanPkg = path.resolve(__dirname, '../dist/Luban/package.json');
  fs.copyFileSync(srcPkg, distLubanPkg);
  console.log(`Copied ${srcPkg} -> ${distLubanPkg}`);
})();
