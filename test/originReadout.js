import { test } from 'tape';
import {
    anchorPoint,
    originRelativePosition,
    moveDeltaForValue,
    formatReadout,
    originCarriedBySelection,
} from '../src/app/lib/origin-readout';

// Logo (70,140)-(170,240) of the "Sign" fixture, model mm (y up)
const LOGO = { min: { x: 70, y: 140 }, max: { x: 170, y: 240 } };
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('anchorPoint: the 9 handles of the axis-aligned frame', (t) => {
    t.deepEqual(anchorPoint(LOGO, { x: 'left', y: 'bottom' }), { x: 70, y: 140 });
    t.deepEqual(anchorPoint(LOGO, { x: 'right', y: 'top' }), { x: 170, y: 240 });
    t.deepEqual(anchorPoint(LOGO, { x: 'center', y: 'middle' }), { x: 120, y: 190 });
    t.deepEqual(anchorPoint(LOGO, { x: 'center', y: 'top' }), { x: 120, y: 240 });
    t.equal(anchorPoint(null, { x: 'left', y: 'bottom' }), null);
    t.end();
});

test('anchorPoint: a mirrored box (min > max) is normalised first', (t) => {
    const mirrored = { min: { x: 170, y: 140 }, max: { x: 70, y: 240 } };
    t.deepEqual(anchorPoint(mirrored, { x: 'left', y: 'bottom' }), { x: 70, y: 140 });
    t.end();
});

test('originRelativePosition: origin on the object bottom-left + anchor bottom-left = 0 / 0', (t) => {
    const zero = { x: 70, y: 140 };
    t.deepEqual(originRelativePosition(LOGO, { x: 'left', y: 'bottom' }, zero), { x: 0, y: 0 });
    t.deepEqual(originRelativePosition(LOGO, { x: 'right', y: 'top' }, zero), { x: 100, y: 100 });
    t.deepEqual(originRelativePosition(LOGO, { x: 'center', y: 'middle' }, zero), { x: 50, y: 50 });
    t.end();
});

test('originRelativePosition: an offset X 5 moves the zero, so the bottom-left reads -5 / 0', (t) => {
    const zero = { x: 75, y: 140 };
    t.deepEqual(originRelativePosition(LOGO, { x: 'left', y: 'bottom' }, zero), { x: -5, y: 0 });
    t.end();
});

test('originRelativePosition: no work origin point = the canvas zero (workpiece origin, unchanged)', (t) => {
    t.deepEqual(originRelativePosition(LOGO, { x: 'left', y: 'bottom' }, null), { x: 70, y: 140 });
    // top-right coordinate mode: model coordinates are negative on the workpiece, axes as in the G-code
    const tr = { min: { x: -330, y: -160 }, max: { x: -230, y: -60 } };
    t.deepEqual(originRelativePosition(tr, { x: 'right', y: 'top' }, null), { x: -230, y: -60 });
    t.equal(originRelativePosition(null, { x: 'left', y: 'bottom' }, null), null);
    t.end();
});

test('moveDeltaForValue: typed - shown, so the anchor lands on the typed coordinate', (t) => {
    t.ok(near(moveDeltaForValue(-5, 10), 15));
    t.ok(near(moveDeltaForValue(12.34, 12.34), 0));
    t.ok(near(moveDeltaForValue(0, -20), -20));
    t.end();
});

test('formatReadout: one decimal, never "-0.0"', (t) => {
    t.equal(formatReadout(0), '0.0');
    t.equal(formatReadout(-0.0000001), '0.0');
    t.equal(formatReadout(-0.04), '0.0');
    t.equal(formatReadout(-5), '-5.0');
    t.equal(formatReadout(99.96), '100.0');
    t.end();
});

const object = (ids, extra = {}) => ({ type: 1, reference: 'bottom-left', referenceMetadata: { modelIDs: ids, ...extra } });
const ctx = (groups = {}, job = []) => ({
    getGroupMemberIds: (id) => (Object.prototype.hasOwnProperty.call(groups, id) ? groups[id] : null),
    jobModelIds: () => job,
});

test('originCarriedBySelection: origin on the selected object = self', (t) => {
    t.equal(originCarriedBySelection(object(['logo']), ['logo'], ctx()), 'self');
    t.equal(originCarriedBySelection(object(['logo']), ['text'], ctx()), null);
    t.end();
});

test('originCarriedBySelection: origin on a group with a member selected = group, the whole group = self', (t) => {
    const origin = object(['a', 'b'], { groupID: 'g1' });
    t.equal(originCarriedBySelection(origin, ['a'], ctx({ g1: ['a', 'b'] })), 'group');
    t.equal(originCarriedBySelection(origin, ['a', 'b'], ctx({ g1: ['a', 'b'] })), 'self');
    // live members win over the stored ids
    t.equal(originCarriedBySelection(origin, ['c'], ctx({ g1: ['a', 'b', 'c'] })), 'group');
    t.equal(originCarriedBySelection(origin, ['d'], ctx({ g1: ['a', 'b'] })), null);
    t.end();
});

test('originCarriedBySelection: selection origin of several objects', (t) => {
    const origin = object(['a', 'b']);
    t.equal(originCarriedBySelection(origin, ['a', 'b'], ctx()), 'self');
    t.equal(originCarriedBySelection(origin, ['a'], ctx()), 'frame');
    t.equal(originCarriedBySelection(origin, ['a', 'b', 'c'], ctx()), 'part');
    t.equal(originCarriedBySelection(origin, ['b', 'c'], ctx()), 'part');
    t.equal(originCarriedBySelection(origin, ['c'], ctx()), null);
    t.end();
});

test('originCarriedBySelection: origin on one object, a selection that contains it = part', (t) => {
    t.equal(originCarriedBySelection(object(['logo']), ['logo', 'text'], ctx()), 'part');
    t.end();
});

test('originCarriedBySelection: unbound "all objects" origin only when the selection holds every job object', (t) => {
    const all = { type: 1, reference: 'bottom-left', referenceMetadata: {} };
    const c = ctx({}, ['a', 'b', 'c']);
    t.equal(originCarriedBySelection(all, ['a'], c), null);
    t.equal(originCarriedBySelection(all, ['a', 'b'], c), null);
    t.equal(originCarriedBySelection(all, ['a', 'b', 'c'], c), 'self');
    t.equal(originCarriedBySelection(all, ['a', 'b', 'c', 'd'], c), 'part');
    t.equal(originCarriedBySelection(all, ['a'], ctx({}, [])), null);
    t.end();
});

test('originCarriedBySelection: workpiece, workpiece-frame, free and locking-block origins never', (t) => {
    t.equal(originCarriedBySelection({ type: 0, reference: 'bottom-left', referenceMetadata: {} }, ['a'], ctx({}, ['a'])), null);
    t.equal(originCarriedBySelection({ type: 0, reference: 'center', referenceMetadata: { offset: { x: 5, y: 0 } } }, ['a'], ctx({}, ['a'])), null);
    t.equal(originCarriedBySelection({ type: 1, reference: 'center', referenceMetadata: { workpiece: true } }, ['a'], ctx({}, ['a'])), null);
    t.equal(originCarriedBySelection({ type: 2, reference: 'bottom-left', referenceMetadata: {} }, ['a'], ctx({}, ['a'])), null);
    t.equal(originCarriedBySelection(null, ['a'], ctx()), null);
    t.equal(originCarriedBySelection(object(['a']), [], ctx()), null);
    t.end();
});
