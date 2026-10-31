import { test } from 'tape';
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', 'src', 'app');
const I18N_DIR = path.join(ROOT, 'resources', 'i18n');
const LOCALES = ['cs', 'de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'pt-br', 'ru', 'uk', 'zh-CN', 'zh-tw'];
const SOURCE_EXT = /\.(ts|tsx|js|jsx)$/;

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

// Every string literal that starts with "key-Tabs/" ('…', "…" or a `…` without ${}), unescaped.
function tabKeysOf(text) {
    const keys = [];
    const re = /(['"`])(key-Tabs\/(?:\\.|(?!\1)[^\\\n])*)\1/g;
    let m = re.exec(text);
    while (m) {
        if (!(m[1] === '`' && m[2].includes('${'))) {
            keys.push(m[2].replace(/\\(.)/g, '$1'));
        }
        m = re.exec(text);
    }
    return keys;
}

const usedKeys = Array.from(new Set(sourceFiles(ROOT).flatMap((file) => tabKeysOf(fs.readFileSync(file, 'utf8'))))).sort();
const resources = {};
for (const lng of LOCALES) {
    resources[lng] = JSON.parse(fs.readFileSync(path.join(I18N_DIR, lng, 'resource.json'), 'utf8'));
}

test('tabKeysOf finds quoted tab keys and unescapes them', (t) => {
    t.deepEqual(
        // eslint-disable-next-line no-template-curly-in-string
        tabKeysOf('i18n._(\'key-Tabs/Don\\\'t save\'); x = "key-Tabs/Home"; y = `key-Tabs/A`; z = `key-Tabs/${v}`; \'key-Other/x\''),
        ['key-Tabs/Don\'t save', 'key-Tabs/Home', 'key-Tabs/A'],
    );
    t.end();
});

test('the sources use tab keys', (t) => {
    t.ok(usedKeys.length > 50, `found ${usedKeys.length} key-Tabs keys`);
    t.end();
});

test('every tab key used in the sources exists in all 14 locales', (t) => {
    for (const lng of LOCALES) {
        const missing = usedKeys.filter((key) => typeof resources[lng][key] !== 'string' || resources[lng][key] === '');
        t.deepEqual(missing, [], `${lng}: no missing key-Tabs keys`);
    }
    t.end();
});

test('plural variants of tab keys exist in all locales when English has one', (t) => {
    const plurals = Object.keys(resources.en).filter((key) => key.startsWith('key-Tabs/') && key.endsWith('_plural'));
    for (const lng of LOCALES) {
        const missing = plurals.filter((key) => typeof resources[lng][key] !== 'string');
        t.deepEqual(missing, [], `${lng}: no missing plural keys`);
    }
    t.end();
});

test('German translates at least 90 % of the tab keys', (t) => {
    const translated = usedKeys.filter((key) => resources.de[key] !== resources.en[key]);
    const ratio = translated.length / usedKeys.length;
    t.ok(ratio >= 0.9, `German differs from English for ${translated.length}/${usedKeys.length} keys (${Math.round(ratio * 100)} %)`);
    t.end();
});

test('interpolation placeholders of tab keys are kept in every locale', (t) => {
    for (const lng of LOCALES) {
        const broken = usedKeys.filter((key) => {
            const value = resources[lng][key];
            if (typeof value !== 'string') {
                return false;
            }
            const wanted = (resources.en[key] || key).match(/\{\{\s*\w+\s*\}\}/g) || [];
            return wanted.some((p) => !value.includes(p));
        });
        t.deepEqual(broken, [], `${lng}: placeholders kept`);
    }
    t.end();
});
