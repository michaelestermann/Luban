import test from 'tape';
import { savedLayerOrder, withLayerPositionZ } from '../src/app/models/z-order';

const m = (id, z) => ({ modelID: id, transformation: { positionZ: z } });
const ids = list => list.map(x => x.modelID);

test('a project saved with its layer order keeps the order of the file', (t) => {
    // drawn shapes have positionZ 0, imported files a positive one: the file order wins
    const models = [m('svg-a', 0.02), m('svg-b', 1.12), m('rect', 0), m('svg-c', 0.04)];
    t.deepEqual(ids(savedLayerOrder(models, true)), ['svg-a', 'svg-b', 'rect', 'svg-c']);
    t.end();
});

test('an older project is sorted by positionZ, objects without one keep their place in the file', (t) => {
    const models = [m('a', 0.06), m('rect', 0), m('b', 0.02), m('c', 0.04), m('pen')];
    t.deepEqual(ids(savedLayerOrder(models, false)), ['b', 'rect', 'c', 'a', 'pen'], 'ranked ones sorted among their slots');
    t.end();
});

test('an older project with consistent positionZ keeps its order; equal values keep the file order', (t) => {
    const models = [m('a', 0.02), m('b', 0.04), m('c', 0.04), m('d', 0.08)];
    t.deepEqual(ids(savedLayerOrder(models, false)), ['a', 'b', 'c', 'd']);
    t.deepEqual(ids(savedLayerOrder([], false)), []);
    t.end();
});

test('saving writes positionZ from the layer order (back to front) without touching the models', (t) => {
    const configs = [{ modelID: 'rect', transformation: { positionZ: 0, positionX: 3 } }, { modelID: 'svg', transformation: { positionZ: 1.12 } }];
    const saved = withLayerPositionZ(configs, 0.02);
    t.deepEqual(saved.map(c => c.transformation.positionZ), [0.02, 0.04]);
    t.equal(saved[0].transformation.positionX, 3, 'other values kept');
    t.equal(configs[0].transformation.positionZ, 0, 'input unchanged');
    t.end();
});

test('reopening a saved project restores the same order (round trip)', (t) => {
    const layers = [m('rect', 0), m('svg', 1.12), m('pen', 0.02)];
    const saved = withLayerPositionZ(layers, 0.02);
    t.deepEqual(ids(savedLayerOrder(saved, true)), ['rect', 'svg', 'pen'], 'new loader');
    t.deepEqual(ids(savedLayerOrder(saved, false)), ['rect', 'svg', 'pen'], 'a loader that only trusts positionZ gets the same order');
    t.end();
});
