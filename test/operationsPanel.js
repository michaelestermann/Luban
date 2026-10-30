import test from 'tape';
import {
    OPERATION_COLORS,
    operationColor,
    getMemberIds,
    getModelOperationColors,
    expandSelection,
    canRemoveMember,
    getAddSelectedState,
    getOperationMethodId
} from '../src/app/toolpaths/operations-panel';

const tp = (type, ids, extra = {}) => ({ type, modelMap: new Map(ids.map((id) => [id, {}])), ...extra });

test('operation colour by toolpath index, wrapping around', (t) => {
    t.deepEqual(OPERATION_COLORS, ['#1d4ed8', '#d97706', '#0891b2', '#be185d', '#15803d', '#7c3aed']);
    t.equal(operationColor(0), '#1d4ed8');
    t.equal(operationColor(3), '#be185d');
    t.equal(operationColor(6), '#1d4ed8');
    t.equal(operationColor(7), '#d97706');
    t.end();
});

test('member ids in toolpath order, missing map is empty', (t) => {
    t.deepEqual(getMemberIds(tp('vector', ['a', 'b'])), ['a', 'b']);
    t.deepEqual(getMemberIds({ type: 'vector' }), []);
    t.end();
});

test('a model gets the colours of the toolpaths it is in, in milling order', (t) => {
    const toolPaths = [tp('vector', ['a', 'b']), tp('vector', ['b']), tp('vector', ['c']), tp('vector', ['b', 'c'])];
    t.deepEqual(getModelOperationColors(toolPaths, 'b'), ['#1d4ed8', '#d97706', '#be185d']);
    t.deepEqual(getModelOperationColors(toolPaths, 'a'), ['#1d4ed8']);
    t.deepEqual(getModelOperationColors(toolPaths, 'x'), []);
    t.deepEqual(getModelOperationColors(undefined, 'a'), []);
    t.end();
});

test('selection is expanded to the children of groups', (t) => {
    const a = { modelID: 'a' };
    const c1 = { modelID: 'c1' };
    const c2 = { modelID: 'c2' };
    const group = { modelID: 'g', children: [c1, c2] };
    t.deepEqual(expandSelection([a, group]), [a, c1, c2]);
    t.deepEqual(expandSelection([{ modelID: 'e', children: [] }]), [{ modelID: 'e', children: [] }]);
    t.deepEqual(expandSelection(null), []);
    t.end();
});

test('the last object of a toolpath cannot be removed', (t) => {
    t.equal(canRemoveMember(2, false), true);
    t.equal(canRemoveMember(1, false), false);
    t.equal(canRemoveMember(0, false), false);
    t.equal(canRemoveMember(3, true), false, 'blocked mode');
    t.end();
});

test('+ Add selected state', (t) => {
    const vectorTp = tp('vector', ['a']);
    const a = { modelID: 'a', mode: 'vector', sourceType: 'svg' };
    const b = { modelID: 'b', mode: 'vector', sourceType: 'svg' };
    const img = { modelID: 'i', mode: 'greyscale', sourceType: 'raster' };
    t.equal(getAddSelectedState(vectorTp, [], false), 'no-selection');
    t.equal(getAddSelectedState(vectorTp, [b], true), 'blocked');
    t.equal(getAddSelectedState(vectorTp, [a], false), 'already-added');
    t.equal(getAddSelectedState(vectorTp, [img], false), 'incompatible');
    t.equal(getAddSelectedState(vectorTp, [a, img], false), 'already-added', 'compatible ones already in');
    t.equal(getAddSelectedState(vectorTp, [b], false), 'ok');
    t.equal(getAddSelectedState(vectorTp, [img, b], false), 'ok', 'any compatible new one enables it');
    t.equal(getAddSelectedState(vectorTp, [{ modelID: 'g', children: [b] }], false), 'ok', 'group children');
    t.end();
});

test('operation method id', (t) => {
    t.equal(getOperationMethodId({ type: 'vector', gcodeConfig: { pathType: 'outline' } }, 'cnc'), 'outline');
    t.equal(getOperationMethodId({ type: 'vector', gcodeConfig: { pathType: 'drill' } }, 'cnc'), 'drill');
    t.equal(getOperationMethodId({ type: 'vector', gcodeConfig: { pathType: 'pocket' } }, 'cnc'), 'fill', 'CNC pocket is the Fill method');
    t.equal(getOperationMethodId({ type: 'image', gcodeConfig: {} }, 'cnc'), 'carve');
    t.equal(getOperationMethodId({ type: 'sculpt', gcodeConfig: { sliceMode: 'linkage' } }, 'cnc'), 'linkage');
    t.equal(getOperationMethodId({ type: 'vector', gcodeConfig: { pathType: 'fill' } }, 'laser'), 'fill');
    t.equal(getOperationMethodId({ type: 'image', gcodeConfig: { pathType: 'fill' } }, 'laser'), 'fill');
    t.equal(getOperationMethodId({ type: 'vector' }, 'laser'), null);
    t.end();
});
