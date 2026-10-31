import { test } from 'tape';
import { parsePath } from '../src/app/ui/SVGEditor/path-edit/path-geometry';
import {
    distanceToSegment,
    distanceToOutline,
    insideOutline,
    flattenPath,
    outlineBounds,
    pickObject,
    measureObject,
    formatObjectMeasure,
} from '../src/app/ui/SVGEditor/measure/measure-pick';

const near = (t, a, b, msg, eps = 1e-6) => t.ok(Math.abs(a - b) < eps, `${msg} (${a} ≈ ${b})`);
const ID = [1, 0, 0, 1, 0, 0];
const square = (x, y, s) => [{ closed: true, points: [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }] }];

test('distanceToSegment: perpendicular, beyond the ends, zero length', (t) => {
    near(t, distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3, 'perpendicular');
    near(t, distanceToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5, 'beyond the end');
    near(t, distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }), 5, 'zero length');
    t.end();
});

test('distanceToOutline and insideOutline', (t) => {
    const sq = square(0, 0, 10);
    near(t, distanceToOutline(sq, { x: 5, y: 1 }), 1, 'inside, near the top edge');
    near(t, distanceToOutline(sq, { x: 0, y: 5 }), 0, 'on the closing edge');
    near(t, distanceToOutline([{ closed: false, points: sq[0].points }], { x: 0, y: 5 }), 5, 'open: no closing edge');
    t.ok(insideOutline(sq, { x: 5, y: 5 }), 'inside');
    t.notOk(insideOutline(sq, { x: 15, y: 5 }), 'outside');
    t.notOk(insideOutline([{ closed: false, points: sq[0].points }], { x: 5, y: 5 }), 'open outlines have no inside');
    t.equal(distanceToOutline([], { x: 0, y: 0 }), Infinity, 'no outline');
    t.end();
});

test('flattenPath: lines kept, cubics subdivided, matrix applied', (t) => {
    const lines = flattenPath(parsePath('M0 0 L10 0'), [2, 0, 0, 2, 5, 5]);
    t.deepEqual(lines, [{ closed: false, points: [{ x: 5, y: 5 }, { x: 25, y: 5 }] }], 'line scaled and moved');
    const curve = flattenPath(parsePath('M0 0 C0 10 10 10 10 0'), ID, 8);
    t.equal(curve[0].points.length, 9, 'cubic in 8 pieces');
    near(t, curve[0].points[4].y, 7.5, 'curve middle');
    const closed = flattenPath(parsePath('M0 0 L10 0 L10 10 Z'), ID);
    t.ok(closed[0].closed, 'closed kept');
    t.equal(closed[0].points.length, 3, 'closing segment is implicit');
    t.deepEqual(outlineBounds(closed), { x: 0, y: 0, width: 10, height: 10 }, 'bounds');
    t.equal(outlineBounds([]), null, 'no bounds');
    t.end();
});

test('pickObject: nearest outline within tolerance, top-most on ties, inside only for small shapes', (t) => {
    const a = { id: 'a', outlines: square(0, 0, 100) };
    const b = { id: 'b', outlines: [{ closed: false, points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] }] };
    const small = { id: 'small', outlines: square(200, 200, 10) };
    const cands = [a, b, small];
    t.equal(pickObject(cands, { x: 50, y: 3 }, 6, 30), 'a', 'near the square edge');
    t.equal(pickObject(cands, { x: 50, y: 48 }, 6, 30), 'b', 'near the line inside the square');
    t.equal(pickObject(cands, { x: 50, y: 20 }, 6, 30), null, 'inside a big shape, far from its outline: nothing');
    t.equal(pickObject(cands, { x: 205, y: 205 }, 2, 30), 'small', 'inside a small closed shape');
    t.equal(pickObject(cands, { x: 500, y: 500 }, 6, 30), null, 'far away');
    const c = { id: 'c', outlines: square(0, 0, 100) };
    t.equal(pickObject([a, c], { x: 50, y: 0 }, 6, 30), 'c', 'same distance: the later (top-most) wins');
    const inner = { id: 'inner', outlines: square(202, 202, 4) };
    t.equal(pickObject([small, inner], { x: 204, y: 204 }, 1, 30), 'inner', 'inside two small shapes: the smaller');
    t.end();
});

test('measureObject: straight line has length, Δx, Δy, angle', (t) => {
    const m = measureObject({ type: 'path', path: parsePath('M0 0 L60 -13.3'), matrix: ID }, 1);
    t.equal(m.kind, 'line', 'kind');
    near(t, m.values.length, Math.hypot(60, 13.3), 'length');
    near(t, m.values.dx, 60, 'Δx');
    near(t, m.values.dy, 13.3, 'Δy up');
    t.deepEqual(m.points, [{ x: 0, y: 0 }, { x: 60, y: -13.3 }], 'end points');
    const f = formatObjectMeasure(m, k => k);
    t.equal(f.title, '61.5 mm', 'title');
    t.equal(f.details, 'Δx 60.0 · Δy 13.3 · 12.5°', 'details');
    const pen = measureObject({ type: 'path', path: parsePath('M0 0 L10 0 M10 0 L10 10'), matrix: ID }, 1);
    t.equal(pen.kind, 'path', 'pen polyline (chained) is an open path');
    near(t, pen.values.length, 20, 'polyline length');
    t.equal(formatObjectMeasure(pen, k => k).title, 'Length 20.0 mm', 'path title');
    const line = measureObject({ type: 'line', x1: 0, y1: 0, x2: 3, y2: 4, matrix: [2, 0, 0, 2, 0, 0] }, 1);
    t.equal(line.kind, 'line', 'line element');
    near(t, line.values.length, 10, 'transform applied');
    t.end();
});

test('measureObject: circle has radius, diameter, a radius line and a diameter dimension', (t) => {
    const m = measureObject({ type: 'ellipse', cx: 50, cy: 50, rx: 10, ry: 10, matrix: [1.5, 0, 0, 1.5, 0, 0] }, 1);
    t.equal(m.kind, 'circle', 'kind');
    near(t, m.values.radius, 15, 'radius scaled');
    near(t, m.values.diameter, 30, 'diameter');
    near(t, m.values.circumference, 2 * Math.PI * 15, 'circumference');
    const r = m.dims.find(d => d.key === 'radius');
    const dia = m.dims.find(d => d.key === 'diameter');
    t.ok(r && dia, 'radius and diameter lines');
    t.deepEqual(r.from, { x: 75, y: 75 }, 'radius from the centre');
    near(t, Math.hypot(r.to.x - 75, r.to.y - 75), 15, 'radius to the edge');
    near(t, Math.hypot(dia.to.x - dia.from.x, dia.to.y - dia.from.y), 30, 'diameter length');
    const f = formatObjectMeasure(m, k => k);
    t.equal(f.title, 'R 15.0 mm · Ø 30.0 mm', 'title');
    t.equal(f.details, 'Circumference 94.2 mm', 'details');
    t.end();
});

test('measureObject: ellipse has circumference, width, height with dimension lines', (t) => {
    // rotated by 90°: width and height follow the shape, not the canvas axes
    const m = measureObject({ type: 'ellipse', cx: 0, cy: 0, rx: 20, ry: 10, matrix: [0, 1, -1, 0, 100, 100] }, 1);
    t.equal(m.kind, 'ellipse', 'kind');
    near(t, m.values.width, 40, 'width');
    near(t, m.values.height, 20, 'height');
    near(t, m.values.circumference, 96.88448, 'Ramanujan circumference', 1e-4);
    const w = m.dims.find(d => d.key === 'width');
    const h = m.dims.find(d => d.key === 'height');
    near(t, Math.hypot(w.to.x - w.from.x, w.to.y - w.from.y), 40, 'width dimension length');
    near(t, Math.hypot(h.to.x - h.from.x, h.to.y - h.from.y), 20, 'height dimension length');
    const f = formatObjectMeasure(m, k => k);
    t.equal(f.title, 'Circumference 96.9 mm', 'title');
    t.equal(f.details, 'Width 40.0 · Height 20.0 mm', 'details');
    t.end();
});

test('measureObject: dimension lines sit outside the shape', (t) => {
    const m = measureObject({ type: 'rect', x: 0, y: 0, width: 40, height: 20, radius: 0, matrix: ID }, 0.5);
    const w = m.dims.find(d => d.key === 'width');
    const h = m.dims.find(d => d.key === 'height');
    t.ok(w.from.y < 0 && w.to.y < 0, 'width line above the top edge');
    t.ok(h.from.x > 40 && h.to.x > 40, 'height line right of the right edge');
    near(t, w.from.y, -7, 'offset 14 px at 0.5 mm per px');
    t.end();
});

test('measureObject: rectangle with and without corner radius', (t) => {
    const m = measureObject({ type: 'rect', x: 0, y: 0, width: 40, height: 20, radius: 0, matrix: ID }, 1);
    t.equal(m.kind, 'rect', 'kind');
    near(t, m.values.perimeter, 120, 'perimeter');
    t.equal(formatObjectMeasure(m, k => k).title, 'Perimeter 120.0 mm', 'title');
    t.equal(formatObjectMeasure(m, k => k).details, 'Width 40.0 · Height 20.0 mm', 'details');
    const r = measureObject({ type: 'rect', x: 0, y: 0, width: 40, height: 20, radius: 5, matrix: ID }, 1);
    near(t, r.values.cornerRadius, 5, 'corner radius');
    near(t, r.values.perimeter, 120 - 40 + 10 * Math.PI, 'perimeter with rounded corners');
    t.equal(formatObjectMeasure(r, k => k).details, 'Width 40.0 · Height 20.0 · R 5.0 mm', 'details with radius');
    t.end();
});

test('measureObject: closed path and imported SVG', (t) => {
    const m = measureObject({ type: 'path', path: parsePath('M0 0 L30 0 L30 40 Z'), matrix: ID }, 1);
    t.equal(m.kind, 'closed', 'kind');
    near(t, m.values.perimeter, 120, 'perimeter');
    near(t, m.values.width, 30, 'bounding width');
    near(t, m.values.height, 40, 'bounding height');
    t.equal(formatObjectMeasure(m, k => k).title, 'Perimeter 120.0 mm', 'title');
    const svg = measureObject({ type: 'svg', x: 0, y: 0, width: 50, height: 30, length: 321.04, matrix: ID }, 1);
    t.equal(svg.kind, 'svg', 'svg kind');
    t.equal(formatObjectMeasure(svg, k => k).title, 'Length 321.0 mm', 'svg title');
    t.equal(formatObjectMeasure(svg, k => k).details, 'Width 50.0 · Height 30.0 mm', 'svg details');
    const loading = measureObject({ type: 'svg', x: 0, y: 0, width: 50, height: 30, length: null, matrix: ID }, 1);
    t.equal(formatObjectMeasure(loading, k => k).title, 'Length … mm', 'length still loading');
    t.end();
});

test('measureObject: a dimension line that would leave the view goes to the other side', (t) => {
    const view = { x: -100, y: -2, width: 300, height: 300 };
    const m = measureObject({ type: 'rect', x: 0, y: 0, width: 40, height: 20, radius: 0, matrix: ID }, 1, view);
    const w = m.dims.find(d => d.key === 'width');
    t.ok(w.from.y > 20, 'width line below the shape when there is no room above');
    const h = m.dims.find(d => d.key === 'height');
    t.ok(h.from.x > 40, 'height line stays right when it fits');
    const narrow = measureObject({ type: 'rect', x: 0, y: 0, width: 40, height: 20, radius: 0, matrix: ID }, 1, { x: -100, y: -100, width: 150, height: 300 });
    t.ok(narrow.dims.find(d => d.key === 'height').from.x < 0, 'height line left when there is no room right');
    const circle = measureObject({ type: 'ellipse', cx: 0, cy: 0, rx: 10, ry: 10, matrix: ID }, 1, { x: -100, y: -100, width: 200, height: 115 });
    t.ok(circle.dims.find(d => d.key === 'diameter').from.y < -10, 'diameter above when there is no room below');
    t.end();
});

test('measureObject: a pen line (M a L b Z) is a straight line', (t) => {
    const m = measureObject({ type: 'path', path: parsePath('M0 0 L30 40 Z'), matrix: ID }, 1);
    t.equal(m.kind, 'line', 'kind');
    near(t, m.values.length, 50, 'length counted once');
    t.end();
});
