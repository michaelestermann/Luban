import test from 'tape';
import {
    createFreeOrigin,
    createGroupOrigin,
    createWorkpieceFrameOrigin,
    extentFromOrigin,
    isOutsideWorkpiece,
    normalizeOrigin,
    originAfterDrop,
    originOffset,
    originShift,
    rebindOnUngroup,
    resolveReferenceBox,
    sameOrigin,
    withOffset,
    workpieceModelBox,
    workpieceOrigin,
    boundGroupId,
    isWorkpieceFrameOrigin,
} from '../src/app/lib/work-origin';
import { createObjectOrigin } from '../src/app/lib/object-origin';

const box = (minX, minY, maxX, maxY) => ({ min: { x: minX, y: minY }, max: { x: maxX, y: maxY } });
const logo = box(70, 140, 170, 240);
const text = box(180, 150, 300, 190);
const plate = box(60, 40, 350, 120);
const wp = box(0, 0, 400, 300);
const boxes = { logo, text, plate };

const ctx = (groups = {}) => ({
    getBox: (id) => boxes[id] || null,
    getGroupMemberIds: (id) => groups[id] || null,
    allBoxes: () => [logo, text, plate],
    workpieceBox: wp,
});

const fallback = { type: 0, reference: 'bottom-left', referenceMetadata: {} };

test('originOffset: default zero, finite values only', (t) => {
    t.deepEqual(originOffset({ type: 1, reference: 'center', referenceMetadata: {} }), { x: 0, y: 0 });
    t.deepEqual(originOffset({ type: 1, reference: 'center', referenceMetadata: { offset: { x: 5, y: 0 } } }), { x: 5, y: 0 });
    t.deepEqual(originOffset({ type: 1, reference: 'center', referenceMetadata: { offset: { x: 'a', y: 1 } } }), { x: 0, y: 0 });
    t.deepEqual(originOffset(null), { x: 0, y: 0 });
    t.end();
});

test('withOffset drops a zero offset and does not mutate', (t) => {
    const o = createObjectOrigin('bottom-left', ['logo']);
    t.equal('offset' in withOffset(o, { x: 0, y: 0 }).referenceMetadata, false);
    t.deepEqual(withOffset(o, { x: 5, y: -2.5 }).referenceMetadata.offset, { x: 5, y: -2.5 });
    t.deepEqual(o.referenceMetadata, { modelIDs: ['logo'] }, 'unchanged');
    t.equal('offset' in withOffset(withOffset(o, { x: 5, y: 0 }), null).referenceMetadata, false, 'null removes');
    t.end();
});

test('createGroupOrigin keeps member ids', (t) => {
    t.deepEqual(createGroupOrigin('top-right', 'g1', ['a', 'b']), { type: 1, reference: 'top-right', referenceMetadata: { groupID: 'g1', modelIDs: ['a', 'b'] } });
    t.equal(boundGroupId(createGroupOrigin('top-right', 'g1', ['a'])), 'g1');
    t.equal(boundGroupId(createObjectOrigin('top-right', ['a'])), null);
    t.equal(isWorkpieceFrameOrigin(createWorkpieceFrameOrigin('center')), true);
    t.deepEqual(createWorkpieceFrameOrigin('top-right'), { type: 1, reference: 'top-right', referenceMetadata: { workpiece: true } });
    t.deepEqual(workpieceOrigin('center'), { type: 0, reference: 'center', referenceMetadata: {} });
    t.end();
});

test('resolveReferenceBox: group uses live members, falls back to stored ids', (t) => {
    const g = createGroupOrigin('top-right', 'g1', ['logo', 'text']);
    t.deepEqual(resolveReferenceBox(g, ctx({ g1: ['logo'] })), logo, 'live members');
    t.deepEqual(resolveReferenceBox(g, ctx()), box(70, 140, 300, 240), 'group gone: stored ids');
    t.end();
});

test('resolveReferenceBox: workpiece frame and unbound', (t) => {
    t.deepEqual(resolveReferenceBox(createWorkpieceFrameOrigin('top-right'), ctx()), wp);
    t.deepEqual(resolveReferenceBox(createObjectOrigin('center', []), ctx()), box(60, 40, 350, 240));
    t.equal(resolveReferenceBox(workpieceOrigin('bottom-left'), ctx()), null, 'workpiece origin has no box');
    t.end();
});

test('originShift: point plus offset', (t) => {
    t.deepEqual(originShift(withOffset(createObjectOrigin('bottom-left', ['logo']), { x: 5, y: 0 }), ctx()), { x: 75, y: 140 });
    t.deepEqual(originShift(createFreeOrigin('bottom-left', { x: 12.5, y: -3 }), ctx()), { x: 12.5, y: -3 });
    t.equal(originShift(workpieceOrigin('bottom-left'), ctx()), null);
    t.equal(originShift(withOffset(createObjectOrigin('bottom-left', ['gone']), { x: 5, y: 0 }), ctx()), null, 'bound objects gone');
    t.equal(originShift({ type: 2, reference: 'bottom-left', referenceMetadata: { offset: { x: 5, y: 0 } } }, ctx()), null, 'locking block');
    t.deepEqual(originShift(createWorkpieceFrameOrigin('center'), ctx()), { x: 200, y: 150 });
    t.end();
});

test('workpieceModelBox per coordinate mode', (t) => {
    t.deepEqual(workpieceModelBox({ x: 400, y: 300 }, { x: 1, y: 1 }), box(0, 0, 400, 300));
    t.deepEqual(workpieceModelBox({ x: 400, y: 300 }, { x: 0, y: 0 }), box(-200, -150, 200, 150));
    t.deepEqual(workpieceModelBox({ x: 400, y: 300 }, { x: 1, y: -1 }), box(0, -300, 400, 0));
    t.equal(workpieceModelBox({ x: 0, y: 300 }, { x: 1, y: 1 }), null);
    t.end();
});

test('normalizeOrigin: old 4.16 files load unchanged', (t) => {
    const old = { type: 1, reference: 'bottom-left', referenceMetadata: { modelIDs: ['a'] } };
    t.deepEqual(normalizeOrigin(old, fallback), old);
    t.deepEqual(normalizeOrigin({ type: 0, reference: 'center' }, fallback), { type: 0, reference: 'center', referenceMetadata: {} });
    t.equal('offset' in normalizeOrigin({ type: 1, reference: 'center', referenceMetadata: { offset: { x: '5', y: null } } }, fallback).referenceMetadata, false);
    t.equal('offset' in normalizeOrigin({ type: 1, reference: 'center', referenceMetadata: { offset: { x: 0, y: 0 } } }, fallback).referenceMetadata, false);
    t.equal('groupID' in normalizeOrigin({ type: 1, reference: 'center', referenceMetadata: { groupID: 3 } }, fallback).referenceMetadata, false);
    t.deepEqual(normalizeOrigin({ type: 7, reference: 'center', referenceMetadata: {} }, fallback), fallback);
    t.deepEqual(normalizeOrigin(null, fallback), fallback);
    t.deepEqual(normalizeOrigin({ type: 1, reference: 'front-top', referenceMetadata: {} }, fallback), fallback);
    t.deepEqual(normalizeOrigin({ type: 1, reference: 'top-right', referenceMetadata: { groupID: 'g', modelIDs: ['a'], workpiece: true, offset: { x: 1, y: 2 } } }, fallback),
        { type: 1, reference: 'top-right', referenceMetadata: { groupID: 'g', modelIDs: ['a'], workpiece: true, offset: { x: 1, y: 2 } } }, 'new keys kept');
    t.end();
});

test('sameOrigin ignores id order', (t) => {
    t.equal(sameOrigin(createObjectOrigin('center', ['a', 'b']), createObjectOrigin('center', ['b', 'a'])), true);
    t.equal(sameOrigin(withOffset(createObjectOrigin('center', ['a']), { x: 5, y: 0 }), createObjectOrigin('center', ['a'])), false);
    t.equal(sameOrigin(createGroupOrigin('center', 'g', ['a', 'b']), createObjectOrigin('center', ['a', 'b'])), false);
    t.equal(sameOrigin(createObjectOrigin('center', ['a']), createObjectOrigin('top-left', ['a'])), false);
    t.equal(sameOrigin(null, null), true);
    t.end();
});

test('originAfterDrop resets the offset', (t) => {
    const before = withOffset(createObjectOrigin('bottom-left', ['logo']), { x: 5, y: 0 });
    const r = originAfterDrop(before, createObjectOrigin('top-left', ['logo']));
    t.equal('offset' in r.origin.referenceMetadata, false);
    t.deepEqual(r.removedOffset, { x: 5, y: 0 });
    t.equal(originAfterDrop(createObjectOrigin('bottom-left', ['logo']), createObjectOrigin('top-left', ['logo'])).removedOffset, null);
    t.end();
});

test('rebindOnUngroup', (t) => {
    const g = withOffset(createGroupOrigin('top-right', 'g1', ['a', 'b']), { x: 5, y: 0 });
    t.deepEqual(rebindOnUngroup(g, 'g1', ['a', 'b']), { type: 1, reference: 'top-right', referenceMetadata: { modelIDs: ['a', 'b'], offset: { x: 5, y: 0 } } });
    t.equal(rebindOnUngroup(g, 'other', ['x']), null);
    t.equal(rebindOnUngroup(workpieceOrigin('center'), 'g1', ['a']), null);
    t.end();
});

test('isOutsideWorkpiece: edges are inside', (t) => {
    t.equal(isOutsideWorkpiece({ x: 0, y: 0 }, wp), false);
    t.equal(isOutsideWorkpiece({ x: 400, y: 300 }, wp), false);
    t.equal(isOutsideWorkpiece({ x: -0.01, y: 10 }, wp), true);
    t.equal(isOutsideWorkpiece({ x: 10, y: 300.01 }, wp), true);
    t.equal(isOutsideWorkpiece({ x: 10, y: 10 }, null), false);
    t.equal(isOutsideWorkpiece(null, wp), false);
    t.end();
});

test('extentFromOrigin', (t) => {
    t.deepEqual(extentFromOrigin(logo, { x: 75, y: 140 }), { minX: -5, maxX: 95, minY: 0, maxY: 100 });
    t.equal(extentFromOrigin(null, { x: 0, y: 0 }), null);
    t.end();
});
