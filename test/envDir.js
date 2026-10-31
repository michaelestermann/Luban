import { test } from 'tape';
import { isValidDocId, resolveEnvDir } from '../src/server/lib/env-dir';

const ID = '3b241101-e2bb-4255-8caf-4136c566a962';

test('resolveEnvDir without docId uses base/headType', (t) => {
    t.equal(resolveEnvDir('/u/env', 'cnc'), '/u/env/cnc');
    t.equal(resolveEnvDir('/u/env', 'laser', undefined), '/u/env/laser');
    t.equal(resolveEnvDir('/u/env', 'laser', null), '/u/env/laser', 'null is no docId');
    t.end();
});

test('resolveEnvDir with a valid docId uses base/docs/<id>', (t) => {
    t.equal(resolveEnvDir('/u/env', 'cnc', ID), `/u/env/docs/${ID}`);
    t.end();
});

test('resolveEnvDir rejects ../, slashes and empty string (throws)', (t) => {
    t.throws(() => resolveEnvDir('/u/env', 'cnc', '../cnc'), /invalid docId/);
    t.throws(() => resolveEnvDir('/u/env', 'cnc', `${ID}/../../x`), /invalid docId/);
    t.throws(() => resolveEnvDir('/u/env', 'cnc', 'a\b'), /invalid docId/);
    t.throws(() => resolveEnvDir('/u/env', 'cnc', ''), /invalid docId/);
    t.throws(() => resolveEnvDir('/u/env', 'cnc', 42), /invalid docId/);
    t.end();
});

test('isValidDocId accepts a v4 uuid and rejects cnc', (t) => {
    t.ok(isValidDocId(ID));
    t.notOk(isValidDocId('cnc'));
    t.notOk(isValidDocId(ID.toUpperCase()), 'upper case is not what uuid() produces');
    t.notOk(isValidDocId(`${ID}x`));
    t.notOk(isValidDocId(undefined));
    t.notOk(isValidDocId({}));
    t.end();
});
