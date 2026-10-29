import test from 'tape';
import serializeByKey from '../src/server/lib/serialize-by-key';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('serializeByKey: same key runs one at a time', async (t) => {
    const run = serializeByKey();
    const events = [];
    const job = (name) => async () => {
        events.push(`${name} start`);
        await delay(20);
        events.push(`${name} end`);
    };
    await Promise.all([run('cnc', job('a')), run('cnc', job('b'))]);
    t.deepEqual(events, ['a start', 'a end', 'b start', 'b end'], 'no overlap');
    t.end();
});

test('serializeByKey: different keys run in parallel', async (t) => {
    const run = serializeByKey();
    const events = [];
    const job = (name) => async () => {
        events.push(`${name} start`);
        await delay(20);
        events.push(`${name} end`);
    };
    await Promise.all([run('cnc', job('cnc')), run('laser', job('laser'))]);
    t.deepEqual(events.slice(0, 2), ['cnc start', 'laser start'], 'both started before either ended');
    t.end();
});

test('serializeByKey: a failure does not block the next call', async (t) => {
    const run = serializeByKey();
    const first = run('cnc', async () => { throw new Error('boom'); });
    const second = run('cnc', async () => 'ok');
    try {
        await first;
        t.fail('first should reject');
    } catch (err) {
        t.equal(err.message, 'boom', 'first rejects with its own error');
    }
    t.equal(await second, 'ok', 'second still runs and resolves');
    t.end();
});
