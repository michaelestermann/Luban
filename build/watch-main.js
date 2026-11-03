#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const babel = require.resolve('@babel/cli/bin/babel.js');
const children = [
    ['src', '--out-dir', 'output/src', '--ignore', 'src/*/**'],
    ['src/electron-app', '--out-dir', 'output/src/electron-app']
].map(args => spawn(process.execPath, [babel, ...args, '--watch', '--config-file', './babel.config.js'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' }
}));

let stopping = false;
function stop(code) {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    children.forEach(child => child.kill());
}
children.forEach(child => {
    child.on('error', error => {
        console.error(error.message);
        stop(1);
    });
    child.on('exit', code => stop(code === null ? 1 : code));
});
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
