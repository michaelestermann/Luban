import { test } from 'tape';
// the app resolves i18next from src/node_modules, so the test must init that instance
import i18next from '../src/node_modules/i18next';
import i18n from '../src/app/lib/i18n';

test('i18n._ with a count option uses the plain key when there is no plural entry', async (t) => {
    await i18next.init({
        lng: 'en',
        fallbackLng: 'en',
        resources: {
            en: {
                resource: {
                    'key-Test-{{count}} objects': '{{count}} objects',
                    'key-Test-{{count}} files': '{{count}} file',
                    'key-Test-{{count}} files_plural': '{{count}} files',
                },
            },
        },
        ns: ['resource'],
        defaultNS: 'resource',
        keySeparator: false,
        nsSeparator: false,
        pluralSeparator: '_',
        contextSeparator: '_',
        interpolation: { escapeValue: false },
    });

    t.equal(i18n._('key-Test-{{count}} objects', { count: 3 }), '3 objects', 'no plural entry: plain key, interpolated');
    t.equal(i18n._('key-Test-{{count}} files', { count: 3 }), '3 files', 'plural entry is still used when present');
    t.end();
});
