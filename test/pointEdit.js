import { test } from 'tape';
import { parsePath, serializePath } from '../src/app/ui/SVGEditor/path-edit/path-geometry';
import {
    isPenFormat,
    normalizePenPath,
    listNodes,
    nodeOrdinal,
    stepNode,
    segmentPoints,
    readPathFromSegments,
    parseNumbers,
    toLogical,
    toCanvas,
    joinDraggedEnd,
    countNodes,
} from '../src/app/ui/SVGEditor/path-edit/point-edit';

// pen tool output: one subpath per segment, straight lines as "M a L b Z"
const PEN_OPEN = 'M 0 0 L 10 0 Z M 10 0 L 10 10 Z M 10 10 C 12 12, 14 14, 20 20';
const PEN_CLOSED = 'M 0 0 L 10 0 Z M 10 0 L 10 10 Z M 10 10 L 0 0 Z';

test('isPenFormat detects pen tool output', (t) => {
    t.ok(isPenFormat(parsePath(PEN_OPEN)), 'pen segments');
    t.ok(isPenFormat(parsePath(PEN_CLOSED)), 'pen closed polygon');
    t.notOk(isPenFormat(parsePath('M 0 0 L 10 0 L 10 10')), 'plain polyline');
    t.notOk(isPenFormat(parsePath('M 0 0 L 10 0')), 'open straight line is not pen output');
    t.notOk(isPenFormat(parsePath('M 0 0 L 10 0 L 10 10 Z')), 'closed polygon');
    t.notOk(isPenFormat([]), 'empty');
    t.end();
});

test('normalizePenPath chains pen segments in drawing order', (t) => {
    const p = normalizePenPath(parsePath(PEN_OPEN));
    t.equal(p.length, 1, 'one subpath');
    t.equal(p[0].closed, false, 'open');
    t.deepEqual(p[0].nodes.map((n) => [n.x, n.y]), [[0, 0], [10, 0], [10, 10], [20, 20]], 'nodes in order');
    t.deepEqual(p[0].nodes[2].out, { x: 12, y: 12 }, 'curve handle kept');
    t.deepEqual(p[0].nodes[3].in, { x: 14, y: 14 }, 'curve handle kept');
    t.equal(serializePath(p), 'M0 0 L10 0 L10 10 C12 12 14 14 20 20', 'serialized');
    t.end();
});

test('normalizePenPath closes a chain that ends at its start', (t) => {
    const p = normalizePenPath(parsePath(PEN_CLOSED));
    t.equal(p.length, 1, 'one subpath');
    t.equal(p[0].closed, true, 'closed');
    t.equal(p[0].nodes.length, 3, 'three nodes');
    t.equal(serializePath(p), 'M0 0 L10 0 L10 10 Z', 'serialized');
    t.end();
});

test('normalizePenPath joins pieces that only connect later and reversed pieces', (t) => {
    // a-b, c-d, then b-c bridges the two chains; e-d is reversed
    const p = normalizePenPath(parsePath('M 0 0 L 1 0 Z M 2 0 L 3 0 Z M 1 0 L 2 0 Z M 4 0 L 3 0 Z'));
    t.equal(p.length, 1, 'one subpath');
    t.deepEqual(p[0].nodes.map((n) => n.x), [0, 1, 2, 3, 4], 'chained');
    // separate pieces stay separate
    const q = normalizePenPath(parsePath('M 0 0 L 1 0 Z M 5 5 L 6 5 Z'));
    t.equal(q.length, 2, 'two subpaths');
    t.end();
});

test('normalizePenPath leaves other paths alone', (t) => {
    const d = 'M0 0 L10 0 L10 10 M10 10 L20 10';
    t.equal(serializePath(normalizePenPath(parsePath(d))), d, 'unchanged');
    t.end();
});

test('reversed curve pieces swap their handles', (t) => {
    const p = normalizePenPath(parsePath('M 0 0 L 10 0 Z M 20 0 C 18 5, 12 5, 10 0'));
    t.equal(p.length, 1, 'one subpath');
    t.deepEqual(p[0].nodes.map((n) => n.x), [0, 10, 20], 'order');
    t.deepEqual(p[0].nodes[1].out, { x: 12, y: 5 }, 'out handle');
    t.deepEqual(p[0].nodes[2].in, { x: 18, y: 5 }, 'in handle');
    t.end();
});

test('listNodes, nodeOrdinal, countNodes and stepNode walk all subpaths', (t) => {
    const p = parsePath('M0 0L1 0L2 0M5 5L6 6');
    t.equal(countNodes(p), 5, 'count');
    t.deepEqual(listNodes(p)[3], { subpathIndex: 1, nodeIndex: 0 }, 'flat list');
    t.equal(nodeOrdinal(p, 1, 1), 4, 'ordinal');
    t.equal(nodeOrdinal(p, 3, 0), -1, 'invalid');
    t.deepEqual(stepNode(p, 0, 2, 1), { subpathIndex: 1, nodeIndex: 0 }, 'next crosses subpaths');
    t.deepEqual(stepNode(p, 1, 1, 1), { subpathIndex: 0, nodeIndex: 0 }, 'next wraps');
    t.deepEqual(stepNode(p, 0, 0, -1), { subpathIndex: 1, nodeIndex: 1 }, 'previous wraps');
    t.deepEqual(stepNode(p, null, null, 1), { subpathIndex: 0, nodeIndex: 0 }, 'no selection: first');
    t.deepEqual(stepNode(p, null, null, -1), { subpathIndex: 1, nodeIndex: 1 }, 'no selection: last');
    t.equal(stepNode([], null, null, 1), null, 'empty path');
    t.end();
});

test('segmentPoints lists every segment with its points, closing segment included', (t) => {
    const p = parsePath('M0 0L10 0C10 5 5 10 0 10Z');
    const segs = segmentPoints(p);
    t.equal(segs.length, 3, 'three segments');
    t.deepEqual(segs[0], { subpathIndex: 0, segmentIndex: 0, fromIndex: 0, toIndex: 1, points: [[0, 0], [10, 0]] }, 'line');
    t.deepEqual(segs[1].points, [[10, 0], [10, 5], [5, 10], [0, 10]], 'cubic');
    t.deepEqual(segs[2], { subpathIndex: 0, segmentIndex: 2, fromIndex: 2, toIndex: 0, points: [[0, 10], [0, 0]] }, 'closing line');
    t.end();
});

test('readPathFromSegments takes node positions and handles from moved segments', (t) => {
    const p = parsePath('M0 0L10 0C10 5 5 10 0 10Z');
    const segs = segmentPoints(p).map((s) => ({ ...s, points: s.points.map((q) => [...q]) }));
    // node 1 moved to (12, 1) in both segments, a handle moved
    segs[0].points[1] = [12, 1];
    segs[1].points[0] = [12, 1];
    segs[1].points[1] = [13, 6];
    const r = readPathFromSegments(p, segs);
    t.deepEqual([r[0].nodes[1].x, r[0].nodes[1].y], [12, 1], 'node moved');
    t.deepEqual(r[0].nodes[1].out, { x: 13, y: 6 }, 'handle moved');
    t.deepEqual(r[0].nodes[2].in, { x: 5, y: 10 }, 'other handle kept');
    t.deepEqual([p[0].nodes[1].x, p[0].nodes[1].y], [10, 0], 'input unchanged');
    t.end();
});

test('parseNumbers reads negative and exponent numbers', (t) => {
    t.deepEqual(parseNumbers('M -1.5 2 L 3e-7 .5, -4'), [-1.5, 2, 3e-7, 0.5, -4], 'numbers');
    t.end();
});

test('toLogical and toCanvas convert like the Position fields (Y up)', (t) => {
    const size = { x: 200, y: 150 };
    t.deepEqual(toLogical({ x: 210, y: 140 }, size), { x: 10, y: 10 }, 'to logical');
    t.deepEqual(toCanvas({ x: 10, y: 10 }, size), { x: 210, y: 140 }, 'to canvas');
    t.end();
});

test('joinDraggedEnd closes a subpath when one end is dropped on the other', (t) => {
    const p = parsePath('M0 0L10 0L10 10L0 0');
    const r = joinDraggedEnd(p, 0, 3);
    t.equal(r[0].closed, true, 'closed');
    t.equal(r[0].nodes.length, 3, 'ends merged');
    t.equal(joinDraggedEnd(p, 0, 1), p, 'middle node: unchanged');
    const q = parsePath('M0 0L10 0L10 10L0 1');
    t.equal(joinDraggedEnd(q, 0, 3), q, 'ends apart: unchanged');
    // only the dragged subpath is joined
    const two = parsePath('M0 0L10 0L10 10L0 0M20 0L30 0L30 10L20 0');
    const j = joinDraggedEnd(two, 1, 0);
    t.equal(j[0].closed, false, 'other subpath stays open');
    t.equal(j[1].closed, true, 'dragged subpath closed');
    t.end();
});
