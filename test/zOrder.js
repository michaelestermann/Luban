import test from 'tape';
import { frontmostAt, indexWithout, insertAt, moveToEdge, orderedMemberIds, reorderFromDisplay, replaceInLayers } from '../src/app/models/z-order';
import LayerOrderOperation2D from '../src/app/flux/operation-history/LayerOrderOperation2D';

const e = id => ({ modelID: id });

test('bring to front moves the selected entities to the end (front), keeping their order', (t) => {
    const list = [e('a'), e('b'), e('c'), e('d')];
    t.deepEqual(moveToEdge(list, [list[2], list[0]], 'front').map(x => x.modelID), ['b', 'd', 'a', 'c']);
    t.end();
});

test('send to back moves the selected entities to the start (back), keeping their order', (t) => {
    const list = [e('a'), e('b'), e('c'), e('d')];
    t.deepEqual(moveToEdge(list, [list[3], list[1]], 'back').map(x => x.modelID), ['b', 'd', 'a', 'c']);
    t.end();
});

test('moving entities that are not in the list changes nothing', (t) => {
    const list = [e('a'), e('b')];
    t.deepEqual(moveToEdge(list, [e('x')], 'front').map(x => x.modelID), ['a', 'b']);
    t.end();
});

test('an operation cuts its objects in the order of its chips, not of the object list', (t) => {
    const memberIds = ['c', 'a', 'b'];
    const leafs = [{ modelID: 'a', visible: true }, { modelID: 'b', visible: false }, { modelID: 'c', visible: true }];
    t.deepEqual(orderedMemberIds(memberIds, leafs), ['c', 'a'], 'chip order, hidden and missing objects left out');
    t.end();
});

test('dragging in the object list (front on top) reorders the layers', (t) => {
    const models = [e('back'), e('mid'), e('front')]; // list shows: front, mid, back
    // drag the top row (front) below the last row (back) -> it becomes the backmost
    t.deepEqual(reorderFromDisplay(models, 0, 2).map(x => x.modelID), ['front', 'back', 'mid']);
    // drag the bottom row (back) to the top -> it becomes the frontmost
    t.deepEqual(reorderFromDisplay(models, 2, 0).map(x => x.modelID), ['mid', 'front', 'back']);
    t.end();
});

test('replaceInLayers: added models take the place of the anchor', (t) => {
    const ids = list => list.join('');
    // combine: inputs b and d leave, the result r goes where the bottom input b was
    t.equal(ids(replaceInLayers(['a', 'b', 'c', 'd', 'e'], ['b', 'd'], ['r'], 'b')), 'arce');
    // offset keeping the original: results right above it
    t.equal(ids(replaceInLayers(['a', 'b', 'c'], [], ['r', 's'], 'b')), 'abrsc');
    // added models already in the list (just created) are moved
    t.equal(ids(replaceInLayers(['a', 'b', 'c', 'r'], ['b'], ['r'], 'b')), 'arc');
    // unknown anchor: on top
    t.equal(ids(replaceInLayers(['a', 'b'], [], ['r'], 'x')), 'abr');
    t.end();
});

test('a click hits the front-most object where objects overlap (layer order, not positionZ)', (t) => {
    const list = [{ modelID: 'back', hit: true }, { modelID: 'mid', hit: false }, { modelID: 'front', hit: true }];
    t.equal(frontmostAt(list, m => m.hit).modelID, 'front');
    t.equal(frontmostAt(list, () => false), null, 'nothing hit');
    t.end();
});

test('a layer order change is one undo step: undo restores the order before, redo the order after', (t) => {
    const a = e('a'), b = e('b'), c = e('c');
    const applied = [];
    const modelGroup = { applyLayerOrder: (models) => applied.push(models.map(x => x.modelID).join('')) };
    let changes = 0;
    const operation = new LayerOrderOperation2D({ modelGroup, layerBefore: [a, b, c], layerAfter: [b, c, a], onChange: () => changes++ });
    operation.undo();
    operation.redo();
    t.deepEqual(applied, ['abc', 'bca']);
    t.equal(changes, 2, 'the view is refreshed each time');
    t.end();
});

test('objects deleted in one step go back to their places when undone one after the other', (t) => {
    const [a, b, c, d, f] = ['a', 'b', 'c', 'd', 'f'].map(e);
    const list = [a, b, c, d, f];
    // delete b and d in one step; undo puts b back first, then d
    const ib = indexWithout(list, b, [d]);
    const id = indexWithout(list, d, []);
    t.deepEqual([ib, id], [1, 3]);
    let now = [a, c, f];
    now = insertAt(now, b, ib);
    now = insertAt(now, d, id);
    t.deepEqual(now.map(x => x.modelID), ['a', 'b', 'c', 'd', 'f']);
    t.deepEqual(insertAt([a, c], b, -1).map(x => x.modelID), ['a', 'c', 'b'], 'no place: at the front (end)');
    t.end();
});
