import test from 'tape';
import { svgSource } from '../src/app/ui/SVGEditor/measure/model-geometry';

// fetch of these urls fails in node: the source parses as "null" (cannot be parsed), which is enough to
// see how often the listeners are called
const model = (name) => ({ resource: { originalFile: { path: `/data/Tmp/${name}.svg` } } });
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

test('modelGeometry: a listener asked again while the file loads is called once', async (t) => {
    let calls = 0;
    const onLoaded = () => {
        calls++;
    };
    for (let i = 0; i < 5; i++) {
        t.equal(svgSource(model('once'), onLoaded), null, 'loading');
    }
    await settle();
    t.equal(calls, 1, 'called once');
    t.end();
});

test('modelGeometry: different listeners are each called', async (t) => {
    const calls = { a: 0, b: 0 };
    svgSource(model('two'), () => calls.a++);
    svgSource(model('two'), () => calls.b++);
    await settle();
    t.deepEqual(calls, { a: 1, b: 1 });
    t.end();
});

test('modelGeometry: re-rendering on every loaded file stays linear (decompose selects many parts)', async (t) => {
    // like the Geometry row: every loaded file re-renders, the render asks for all files again
    // the files arrive one after another
    const realFetch = global.fetch;
    global.fetch = (url) => new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('offline')), 2 * Number(/many-(\d+)/.exec(url)[1]));
    });
    const models = Array.from({ length: 20 }, (_, i) => model(`many-${i}`));
    let renders = 0;
    const onLoaded = () => {
        renders++;
        if (renders > 1000) {
            return;
        }
        models.forEach((m) => svgSource(m, onLoaded));
    };
    models.forEach((m) => svgSource(m, onLoaded));
    await settle();
    global.fetch = realFetch;
    t.ok(renders <= models.length, `${renders} re-renders for ${models.length} files`);
    t.end();
});
