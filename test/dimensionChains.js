import { test } from 'tape';
import { dimensionChains, moveForDimension, workpieceBox, allObjectChains } from '../src/app/ui/SVGEditor/measure/dimension-chains';

const box = (minX, minY, maxX, maxY) => ({ minX, minY, maxX, maxY });
const work = box(0, 0, 200, 100);
const both = { edges: true, between: true };
const find = (segs, side, kind) => segs.find(s => s.side === side && s.kind === kind);

test('dimensionChains: only workpiece edges without neighbours', (t) => {
    const sel = box(40, 30, 70, 52);
    const segs = dimensionChains(sel, [], work, both);
    t.equal(segs.length, 4, 'one per side');
    const left = find(segs, 'left', 'edge');
    t.deepEqual([left.axis, left.from, left.to, left.value, left.editable], ['x', 0, 40, 40, true], 'left');
    t.equal(left.at, 41, 'drawn through the selection centre');
    t.equal(find(segs, 'right', 'edge').value, 130, 'right');
    t.equal(find(segs, 'top', 'edge').value, 30, 'top');
    t.equal(find(segs, 'bottom', 'edge').value, 48, 'bottom');
    t.end();
});

test('dimensionChains: neighbour in a direction makes a chain', (t) => {
    const sel = box(40, 30, 70, 52);
    const circle = box(100, 35, 140, 75);
    const below = box(0, 90, 10, 95); // not overlapping in X: ignored for top/bottom
    const segs = dimensionChains(sel, [circle, below], work, both);
    const toCircle = find(segs, 'right', 'object');
    t.deepEqual([toCircle.from, toCircle.to, toCircle.value, toCircle.editable], [70, 100, 30, true], 'selection to neighbour');
    const circleToEdge = find(segs, 'right', 'edge');
    t.deepEqual([circleToEdge.from, circleToEdge.to, circleToEdge.value, circleToEdge.editable], [140, 200, 60, false], 'neighbour to edge, read-only');
    t.equal(find(segs, 'bottom', 'edge').value, 48, 'object outside the X range is no neighbour');
    t.end();
});

test('dimensionChains: options', (t) => {
    const sel = box(40, 30, 70, 52);
    const circle = box(100, 35, 140, 75);
    const edgesOnly = dimensionChains(sel, [circle], work, { edges: true, between: false });
    t.equal(find(edgesOnly, 'right', 'edge').value, 130, 'edges only: selection to edge');
    t.notOk(find(edgesOnly, 'right', 'object'), 'no object distance');
    const betweenOnly = dimensionChains(sel, [circle], work, { edges: false, between: true });
    t.equal(betweenOnly.length, 1, 'between only: just the neighbour');
    t.equal(dimensionChains(sel, [circle], null, both).length, 1, 'no workpiece: only neighbours');
    t.end();
});

test('dimensionChains: overlapping objects and selection outside the workpiece', (t) => {
    const sel = box(-10, 30, 20, 52);
    const overlapping = box(10, 40, 30, 50);
    const segs = dimensionChains(sel, [overlapping], work, both);
    t.notOk(find(segs, 'left', 'edge'), 'beyond the edge: no negative distance');
    t.notOk(segs.some(s => s.kind === 'object'), 'overlapping box is no neighbour');
    t.end();
});

test('moveForDimension moves the selection so the distance becomes the value', (t) => {
    const sel = box(40, 30, 70, 52);
    const segs = dimensionChains(sel, [box(100, 35, 140, 75)], work, both);
    t.deepEqual(moveForDimension(find(segs, 'left', 'edge'), sel, 50), { dx: 10, dy: 0 }, 'left edge 40 -> 50');
    t.deepEqual(moveForDimension(find(segs, 'right', 'object'), sel, 20), { dx: 10, dy: 0 }, 'gap to neighbour 30 -> 20');
    t.deepEqual(moveForDimension(find(segs, 'top', 'edge'), sel, 10), { dx: 0, dy: -20 }, 'top 30 -> 10');
    t.deepEqual(moveForDimension(find(segs, 'bottom', 'edge'), sel, 40), { dx: 0, dy: 8 }, 'bottom 48 -> 40');
    t.end();
});

test('workpieceBox from the editor coordinate settings', (t) => {
    // origin in the centre (factor 0): workpiece centred on the canvas centre (size)
    t.deepEqual(workpieceBox({ x: 200, y: 200 }, { x: 100, y: 60 }, { x: 0, y: 0 }), box(150, 170, 250, 230), 'centre');
    // bottom left origin (factor 1, 1 as in COORDINATE_MODE_BOTTOM_LEFT)
    t.deepEqual(workpieceBox({ x: 200, y: 200 }, { x: 100, y: 60 }, { x: 1, y: 1 }), box(200, 140, 300, 200), 'bottom left');
    t.equal(workpieceBox({ x: 200, y: 200 }, { x: 0, y: 0 }, { x: 0, y: 0 }), null, 'no size');
    t.end();
});

test('allObjectChains: read-only chains of every object, shared gaps once', (t) => {
    const a = box(10, 10, 20, 20);
    const b = box(40, 10, 50, 20);
    const segs = allObjectChains([a, b], work, both);
    t.ok(segs.every(s => !s.editable), 'read-only');
    t.equal(segs.filter(s => s.kind === 'object').length, 1, 'gap between a and b once');
    t.end();
});
