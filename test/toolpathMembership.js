import test from 'tape';
import {
    canAddToToolPath,
    withModelAdded,
    withModelRemoved
} from '../src/app/toolpaths/membership';
import UpdateToolPathMembershipOperation from '../src/app/flux/operation-history/UpdateToolPathMembershipOperation';

test('vector model fits vector toolpath', (t) => {
    t.equal(canAddToToolPath({ type: 'vector' }, { mode: 'vector', sourceType: 'svg' }), true);
    t.equal(canAddToToolPath({ type: 'vector' }, { mode: 'vector', sourceType: 'dxf' }), true);
    t.equal(canAddToToolPath({ type: 'image' }, { mode: 'bw', sourceType: 'raster' }), true);
    t.equal(canAddToToolPath({ type: 'image' }, { mode: 'halftone', sourceType: 'raster' }), true);
    t.equal(canAddToToolPath({ type: 'sculpt' }, { mode: 'mesh', sourceType: '3d' }), true);
    t.end();
});

test('incompatible type', (t) => {
    t.equal(canAddToToolPath({ type: 'vector' }, { mode: 'greyscale', sourceType: 'raster' }), false);
    t.equal(canAddToToolPath({ type: 'image' }, { mode: 'vector', sourceType: 'svg' }), false);
    t.equal(canAddToToolPath({ type: 'sculpt' }, { mode: 'vector', sourceType: 'svg' }), false);
    t.equal(canAddToToolPath({ type: 'other' }, { mode: 'vector', sourceType: 'svg' }), false);
    t.end();
});

test('add keeps order and no duplicates', (t) => {
    t.deepEqual(withModelAdded(['a', 'b'], 'c'), ['a', 'b', 'c']);
    t.deepEqual(withModelAdded(['a', 'b'], 'a'), ['a', 'b']);
    const ids = ['a'];
    withModelAdded(ids, 'b');
    t.deepEqual(ids, ['a'], 'input not mutated');
    t.end();
});

test('remove missing id is a no-op', (t) => {
    t.deepEqual(withModelRemoved(['a', 'b'], 'z'), ['a', 'b']);
    t.deepEqual(withModelRemoved(['a', 'b', 'c'], 'b'), ['a', 'c']);
    t.end();
});

test('membership operation undo restores previous ids', (t) => {
    const toolPath = { id: 'tp', status: 'success', modelMap: new Map([['a', { x: 1 }]]) };
    let updated = 0;
    const toolPathGroup = { _updated: () => { updated++; }, checkoutToolPathStatus: () => {} };
    const op = new UpdateToolPathMembershipOperation({
        toolPath,
        toolPathGroup,
        before: ['a'],
        after: ['a', 'b']
    });
    op.redo();
    t.deepEqual([...toolPath.modelMap.keys()], ['a', 'b']);
    t.equal(toolPath.status, 'warning');
    op.undo();
    t.deepEqual([...toolPath.modelMap.keys()], ['a']);
    t.deepEqual(toolPath.modelMap.get('a'), { x: 1 }, 'existing entry kept');
    t.equal(updated, 2);
    t.end();
});
