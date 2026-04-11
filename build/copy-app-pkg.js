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
  const distDir = path.resolve(__dirname, '../dist/Luban');
  const distSrcDir = path.join(distDir, 'src');

  // 1) dist/Luban/package.json — used by electron-builder as the app package
  // 2) dist/Luban/src/package.json — imported by main.js via `./package.json`
  ensureDirSync(distDir);
  ensureDirSync(distSrcDir);

  const rootDest = path.join(distDir, 'package.json');
  const srcDest = path.join(distSrcDir, 'package.json');
  fs.copyFileSync(srcPkg, rootDest);
  fs.copyFileSync(srcPkg, srcDest);

  console.log(`Copied ${srcPkg} -> ${rootDest}`);
  console.log(`Copied ${srcPkg} -> ${srcDest}`);
})();
