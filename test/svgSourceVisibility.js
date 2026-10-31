import fs from 'fs';
import os from 'os';
import path from 'path';
import { test } from 'tape';
import { ensureVisibleSvgSource, stripHiddenVisibility } from '../src/server/lib/svg-source-visibility';
import { cleanSourceClone } from '../src/app/models/svg-source';

const HIDDEN_SVG = '<svg viewBox="0 0 10 10"><path d="M0 0L10 0" stroke="black" visibility="hidden"/>'
    + '<path d="M0 0L0 10" visibility=\'hidden\' id="b"/></svg>';

test('stripHiddenVisibility removes every hidden flag and nothing else', (t) => {
    t.equal(
        stripHiddenVisibility(HIDDEN_SVG),
        '<svg viewBox="0 0 10 10"><path d="M0 0L10 0" stroke="black"/><path d="M0 0L0 10" id="b"/></svg>'
    );
    t.equal(stripHiddenVisibility('<path visibility="visible"/>'), '<path visibility="visible"/>', 'visible stays');
    t.end();
});

test('ensureVisibleSvgSource uses a cleaned copy for a visible model', (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luban-svg-'));
    fs.writeFileSync(path.join(dir, 'a.svg'), HIDDEN_SVG);
    fs.writeFileSync(path.join(dir, 'b.svg'), '<svg><path d="M0 0"/></svg>');

    const name = ensureVisibleSvgSource(dir, 'a.svg', true);
    t.equal(name, 'a-visible.svg', 'new upload name');
    t.notOk(/visibility/.test(fs.readFileSync(path.join(dir, name), 'utf8')), 'copy has no hidden flag');
    t.equal(fs.readFileSync(path.join(dir, 'a.svg'), 'utf8'), HIDDEN_SVG, 'original file is untouched');

    t.equal(ensureVisibleSvgSource(dir, 'b.svg', true), 'b.svg', 'clean file keeps its name');
    t.equal(ensureVisibleSvgSource(dir, 'a.svg', false), 'a.svg', 'a hidden model keeps its hidden source');
    t.equal(ensureVisibleSvgSource(dir, 'missing.svg', true), 'missing.svg', 'missing file keeps its name');
    t.equal(ensureVisibleSvgSource(dir, 'img.png', true), 'img.png', 'non-svg keeps its name');
    fs.rmSync(dir, { recursive: true, force: true });
    t.end();
});

test('cleanSourceClone drops the editor visibility unless the model is hidden', (t) => {
    const fakeElement = () => {
        const attrs = { visibility: 'hidden', d: 'M0 0' };
        return { attrs, removeAttribute: (n) => { delete attrs[n]; } };
    };
    const visible = cleanSourceClone(fakeElement(), true);
    t.deepEqual(visible.attrs, { d: 'M0 0' }, 'visible model: visibility removed');
    const undef = cleanSourceClone(fakeElement(), undefined);
    t.deepEqual(undef.attrs, { d: 'M0 0' }, 'unknown visibility counts as visible');
    const hidden = cleanSourceClone(fakeElement(), false);
    t.deepEqual(hidden.attrs, { visibility: 'hidden', d: 'M0 0' }, 'hidden model keeps it');
    t.end();
});
