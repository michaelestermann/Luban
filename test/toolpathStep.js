import test from 'tape';
import {
    getToolPathCardStatus,
    getCncMethodTiles
} from '../src/app/toolpaths/toolpath-step';

test('card status: a successful toolpath is up to date while the preview is valid', (t) => {
    t.equal(getToolPathCardStatus({ status: 'success', visible: true }, false), 'up-to-date');
    t.equal(getToolPathCardStatus({ status: 'success', visible: true }, true), 'needs-preview');
    t.end();
});

test('card status: idle and warning toolpaths need a preview', (t) => {
    t.equal(getToolPathCardStatus({ status: 'idle', visible: true }, false), 'needs-preview');
    t.equal(getToolPathCardStatus({ status: 'warning', visible: true }, false), 'needs-preview');
    t.equal(getToolPathCardStatus({ status: undefined, visible: true }, false), 'needs-preview');
    t.end();
});

test('card status: running and failed win over the preview flag', (t) => {
    t.equal(getToolPathCardStatus({ status: 'running', visible: true }, false), 'generating');
    t.equal(getToolPathCardStatus({ status: 'running', visible: true }, true), 'generating');
    t.equal(getToolPathCardStatus({ status: 'failed', visible: true }, false), 'failed');
    t.equal(getToolPathCardStatus({ status: 'failed', visible: true }, true), 'failed');
    t.end();
});

test('card status: hidden toolpaths are not previewed', (t) => {
    t.equal(getToolPathCardStatus({ status: 'success', visible: false }, false), 'hidden');
    t.equal(getToolPathCardStatus({ status: 'warning', visible: false }, true), 'hidden');
    t.equal(getToolPathCardStatus(null, false), 'needs-preview');
    t.end();
});

test('CNC method tiles: path, outline, fill (pocket), drill with the select values', (t) => {
    t.deepEqual(getCncMethodTiles(false).map(tile => tile.value), ['path', 'outline', 'pocket', 'drill']);
    t.deepEqual(getCncMethodTiles(false).map(tile => tile.icon), ['path', 'outline', 'fill', 'drill']);
    t.end();
});

test('CNC method tiles: no drill on rotary material', (t) => {
    t.deepEqual(getCncMethodTiles(true).map(tile => tile.value), ['path', 'outline', 'pocket']);
    t.end();
});
