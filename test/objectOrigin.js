import test from 'tape';
import {
    OBJECT_REFERENCE_GRID,
    anchorReference,
    referenceAnchor,
    boundModelIds,
    createObjectOrigin,
    isOriginBoundToMissingObject,
    objectReferenceBox,
    plateOrigin,
    referencePoint,
    rememberOrigin,
    unionBox,
} from '../src/app/lib/object-origin';

const box = (minX, minY, maxX, maxY) => ({ min: { x: minX, y: minY }, max: { x: maxX, y: maxY } });
const OBJECT = 1; // OriginType.Object
const WORKPIECE = 0;

test('referencePoint: the nine points of a box (y up)', (t) => {
    const b = box(10, 20, 50, 40);
    const expected = {
        'top-left': [10, 40],
        'top-center': [30, 40],
        'top-right': [50, 40],
        'center-left': [10, 30],
        center: [30, 30],
        'center-right': [50, 30],
        'bottom-left': [10, 20],
        'bottom-center': [30, 20],
        'bottom-right': [50, 20],
    };
    for (const [ref, [x, y]] of Object.entries(expected)) {
        t.deepEqual(referencePoint(b, ref), { x, y }, ref);
    }
    t.equal(referencePoint(b, 'front-top'), null, 'unknown reference');
    t.equal(referencePoint(null, 'center'), null, 'no box');
    t.equal(referencePoint(box(Infinity, Infinity, -Infinity, -Infinity), 'center'), null, 'empty box');
    t.end();
});

test('the picker grid lists all nine references, top row first', (t) => {
    t.deepEqual(OBJECT_REFERENCE_GRID, [
        ['top-left', 'top-center', 'top-right'],
        ['center-left', 'center', 'center-right'],
        ['bottom-left', 'bottom-center', 'bottom-right'],
    ]);
    t.end();
});

test('unionBox spans all boxes and skips empty ones', (t) => {
    t.deepEqual(unionBox([box(0, 0, 10, 10), box(-5, 2, 3, 20), null, box(Infinity, Infinity, -Infinity, -Infinity)]), box(-5, 0, 10, 20));
    t.equal(unionBox([]), null);
    t.end();
});

test('createObjectOrigin binds the origin to objects (one undo step stores the whole origin)', (t) => {
    t.deepEqual(createObjectOrigin('bottom-left', ['a', 'b']), { type: OBJECT, reference: 'bottom-left', referenceMetadata: { modelIDs: ['a', 'b'] } });
    t.deepEqual(createObjectOrigin('center', []), { type: OBJECT, reference: 'center', referenceMetadata: {} }, 'nothing selected: not bound');
    t.deepEqual(boundModelIds({ type: OBJECT, reference: 'center', referenceMetadata: { modelIDs: ['x'] } }), ['x']);
    t.deepEqual(boundModelIds({ type: WORKPIECE, reference: 'center', referenceMetadata: { modelIDs: ['x'] } }), [], 'only an object origin is bound');
    t.deepEqual(boundModelIds({ type: OBJECT, reference: 'center' }), [], 'old projects have no metadata');
    t.end();
});

test('objectReferenceBox: bound objects, else all objects of the operations (laser semantics)', (t) => {
    const boxes = { a: box(0, 0, 10, 10), b: box(20, 0, 30, 5) };
    const getBox = id => boxes[id] || null;
    const all = () => [box(-100, -100, 100, 100)];
    const bound = createObjectOrigin('center', ['a', 'b']);
    t.deepEqual(objectReferenceBox(bound, getBox, all), box(0, 0, 30, 10), 'union of the bound objects');
    t.deepEqual(objectReferenceBox(createObjectOrigin('center', ['a', 'gone']), getBox, all), box(0, 0, 10, 10), 'a deleted one is left out');
    t.equal(objectReferenceBox(createObjectOrigin('center', ['gone']), getBox, all), null, 'all bound objects deleted: no box (workpiece origin)');
    t.deepEqual(objectReferenceBox(createObjectOrigin('center', []), getBox, all), box(-100, -100, 100, 100), 'unbound');
    t.equal(objectReferenceBox({ type: WORKPIECE, reference: 'center', referenceMetadata: {} }, getBox, all), null, 'workpiece origin');
    t.end();
});

test('isOriginBoundToMissingObject: fall back to the workpiece origin only when every bound object is gone', (t) => {
    const exists = id => id === 'a';
    t.equal(isOriginBoundToMissingObject(createObjectOrigin('center', ['gone']), exists), true);
    t.equal(isOriginBoundToMissingObject(createObjectOrigin('center', ['a', 'gone']), exists), false);
    t.equal(isOriginBoundToMissingObject(createObjectOrigin('center', []), exists), false, 'unbound');
    t.end();
});

test('plateOrigin: the 3D preview places the workpiece by the canvas coordinate mode for an object origin', (t) => {
    const origin = createObjectOrigin('top-center', ['a']);
    t.deepEqual(plateOrigin(origin, 'bottom-left'), { type: WORKPIECE, reference: 'bottom-left', referenceMetadata: {} });
    const wp = { type: WORKPIECE, reference: 'center', referenceMetadata: {} };
    t.equal(plateOrigin(wp, 'bottom-left'), wp, 'other origins unchanged');
    t.end();
});

test('rememberOrigin: a project specific object origin is not remembered as the default for new projects', (t) => {
    t.equal(rememberOrigin('cnc', { type: WORKPIECE, reference: 'center', referenceMetadata: {} }), true);
    t.equal(rememberOrigin('cnc', createObjectOrigin('center', [])), false);
    t.equal(rememberOrigin('laser', createObjectOrigin('bottom-left', [])), true, 'laser default object origin as before');
    t.equal(rememberOrigin('laser', createObjectOrigin('bottom-left', ['a'])), false, 'bound');
    t.equal(rememberOrigin('laser', createObjectOrigin('top-center', [])), false, 'new reference the laser job setup does not offer');
    t.end();
});

test('anchorReference / referenceAnchor map the picker handles to the references', (t) => {
    t.equal(anchorReference({ x: 'left', y: 'bottom' }), 'bottom-left');
    t.equal(anchorReference({ x: 'center', y: 'top' }), 'top-center');
    t.equal(anchorReference({ x: 'center', y: 'middle' }), 'center');
    t.equal(anchorReference({ x: 'right', y: 'middle' }), 'center-right');
    t.deepEqual(referenceAnchor('center-left'), { x: 'left', y: 'middle' });
    t.deepEqual(referenceAnchor('top-right'), { x: 'right', y: 'top' });
    t.equal(referenceAnchor('front-center'), null, 'not an object reference');
    t.end();
});
