// Cross-platform clean script to remove build directories without relying on bash/WSL
const fs = require('fs');
const path = require('path');

function rmrf(target) {
  try {
    const p = path.resolve(__dirname, '..', target);
    fs.rmSync(p, { recursive: true, force: true });
    // Also try to remove if target is a file path without project root join
  } catch (e) {
    // ignore
  }
  try {
    fs.rmSync(path.resolve(target), { recursive: true, force: true });
  } catch (e) {
    // ignore
  }
}

rmrf('dist');
rmrf('output');
