import { test } from 'tape';
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', 'src', 'app');
const I18N_DIR = path.join(ROOT, 'resources', 'i18n');
const LOCALES = ['cs', 'de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'pt-br', 'ru', 'uk', 'zh-CN', 'zh-tw'];
const SOURCE_EXT = /\.(ts|tsx|js|jsx)$/;
const PREFIX = 'key-CncLaser/Origin';

function sourceFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== 'resources' && entry.name !== 'node_modules') {
                out.push(...sourceFiles(full));
            }
        } else if (SOURCE_EXT.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

/**
 * Origin keys of a source: quoted literals 'key-CncLaser/Origin-…' / 'key-CncLaser/OriginPoint-…' and the
 * templates `${K}…` of a file that declares `const K = 'key-CncLaser/Origin-'`.
 */
function originKeysOf(text) {
    const keys = [];
    const literal = /(['"`])(key-CncLaser\/Origin(?:Point)?-(?:\\.|(?!\1)[^\\\n])*)\1/g;
    let m = literal.exec(text);
    while (m) {
        if (!(m[1] === '`' && m[2].includes('${'))) {
            keys.push(m[2].replace(/\\(.)/g, '$1'));
        }
        m = literal.exec(text);
    }
    const k = /const (\w+) = '(key-CncLaser\/Origin-)';/.exec(text);
    if (k) {
        const template = new RegExp(`\`\\$\\{${k[1]}\\}((?:\\\\.|[^\`\\\\$])*)\``, 'g');
        let n = template.exec(text);
        while (n) {
            keys.push(k[2] + n[1].replace(/\\(.)/g, '$1'));
            n = template.exec(text);
        }
    }
    // the K prefix itself and "key-CncLaser/Origin-…" in comments are no keys
    return keys.filter(key => !/^key-CncLaser\/Origin(Point)?-…?$/.test(key));
}

const usedKeys = Array.from(new Set(sourceFiles(ROOT).flatMap(file => originKeysOf(fs.readFileSync(file, 'utf8'))))).sort();
const resources = {};
for (const lng of LOCALES) {
    resources[lng] = JSON.parse(fs.readFileSync(path.join(I18N_DIR, lng, 'resource.json'), 'utf8'));
}

// keys of the work origin dialog / phase 2: German must be translated
const PHASE2 = [
    'Set work origin', 'Reference', 'Selection · {{count}} objects', 'All objects ({{count}})', 'Nothing selected', 'current',
    'Arrow keys move the point', 'Pick on the canvas', 'Offset', 'Follow the objects when they move', 'Reset to workpiece origin',
    'Origin on the workpiece', 'Job extent from origin', 'Reference frame', 'Work origin', 'Enter applies · Esc cancels', 'Apply',
    'Cancel', 'Origin outside the workpiece', 'Part of the selection lies outside the workpiece', 'Frame of the rotated object ({{deg}}°)',
    'Set work origin… (Shift+O)', 'At X {{x}} · Y {{y}} mm on the workpiece', 'Offset {{offset}} mm · follows the object',
    'Offset {{offset}} mm · fixed', 'Edit…', 'Work origin: {{label}}', 'Change in Design', 'Extent X {{x}} · Y {{y}}', 'Offset {{offset}} mm',
    'Shift+O', 'Close', 'Preview zoom', '{{count}} objects',
].map(s => `${PREFIX}-${s}`);

test('originKeysOf: literals and K templates', (t) => {
    // eslint-disable-next-line no-template-curly-in-string
    const src = "const K = 'key-CncLaser/Origin-'; t(`${K}Apply`); i18n._('key-CncLaser/OriginPoint-centre'); x = `${K}{{count}} objects`;";
    t.deepEqual(originKeysOf(src).sort(), ['key-CncLaser/Origin-Apply', 'key-CncLaser/Origin-{{count}} objects', 'key-CncLaser/OriginPoint-centre'].sort());
    t.end();
});

test('the sources use the phase-2 origin keys', (t) => {
    for (const key of PHASE2) {
        t.ok(usedKeys.includes(key), `used: ${key}`);
    }
    t.end();
});

test('every origin key used in the sources exists in all 14 locales', (t) => {
    for (const lng of LOCALES) {
        const missing = usedKeys.filter(key => typeof resources[lng][key] !== 'string' || !resources[lng][key]);
        t.deepEqual(missing, [], `${lng}: no missing origin keys`);
    }
    t.end();
});

test('German: phase-2 keys are translated and keep their placeholders', (t) => {
    for (const key of PHASE2) {
        const en = resources.en[key];
        const de = resources.de[key];
        if (key.endsWith('-Shift+O') === false) {
            t.notEqual(de, en, `de translated: ${key}`);
        }
        const ph = s => (String(s).match(/\{\{\w+\}\}/g) || []).sort().join(',');
        t.equal(ph(de), ph(en), `placeholders kept: ${key}`);
    }
    t.end();
});

test('German point names are the 9 spec names', (t) => {
    const names = ['top left', 'top centre', 'top right', 'middle left', 'centre', 'middle right', 'bottom left', 'bottom centre', 'bottom right']
        .map(n => resources.de[`key-CncLaser/OriginPoint-${n}`]);
    t.deepEqual(names, ['oben links', 'oben Mitte', 'oben rechts', 'Mitte links', 'Mitte', 'Mitte rechts', 'unten links', 'unten Mitte', 'unten rechts']);
    t.end();
});
