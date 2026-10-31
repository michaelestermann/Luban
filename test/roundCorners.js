import { test } from 'tape';
import { parsePath } from '../src/app/ui/SVGEditor/path-edit/path-geometry';
import {
    sharpCorners,
    roundAllCorners,
    roundAllCornersD,
    clampRoundRadius,
    roundRadiusLimit,
    initialRoundRadius,
    DEFAULT_ROUND_RADIUS,
    roundTargets,
    roundTargetResult,
} from '../src/app/ui/SVGEditor/path-edit/round-corners';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('sharpCorners finds the corners between two straight segments', (t) => {
    t.equal(sharpCorners(parsePath('M0 0 L10 0 L10 10 L0 10 Z')).length, 4, 'square: 4 corners');
    t.equal(sharpCorners(parsePath('M0 0 L10 0 L10 10')).length, 1, 'open polyline: the ends are not corners');
    t.equal(sharpCorners(parsePath('M0 0 L5 0 L10 0 L10 10 L0 10 Z')).length, 4, 'a point in a straight line is not a corner');
    t.equal(sharpCorners(parsePath('M0 0 C3 -3 7 -3 10 0 L10 10 L0 10 Z')).length, 2, 'corners next to a curve are skipped');
    t.equal(sharpCorners(parsePath('M0 0 L10 0')).length, 0, 'a line has no corners');
    t.end();
});

test('roundAllCorners rounds every corner of a square with the radius', (t) => {
    const result = roundAllCorners(parsePath('M0 0 L20 0 L20 20 L0 20 Z'), 3);
    t.equal(result.count, 4);
    t.notOk(result.clamped);
    t.ok(near(result.minRadius, 3));
    const nodes = result.path[0].nodes;
    t.equal(nodes.length, 8, 'two points per corner');
    t.ok(nodes.some(n => near(n.x, 3) && near(n.y, 0)), 'tangent point on the top side');
    t.ok(nodes.some(n => near(n.x, 20) && near(n.y, 17)), 'tangent point on the right side');
    t.notOk(nodes.some(n => near(n.x, 0) && near(n.y, 0)), 'the sharp corner is gone');
    t.end();
});

test('roundAllCorners shares a short side between two corners', (t) => {
    // 4 wide, 20 high: at most 2 per corner along the short side
    const result = roundAllCorners(parsePath('M0 0 L4 0 L4 20 L0 20 Z'), 5);
    t.equal(result.count, 4);
    t.ok(result.clamped, 'smaller than asked');
    t.ok(near(result.minRadius, 2), `radius ${result.minRadius}`);
    // the two tangent points on the short side meet: one point left there
    const top = result.path[0].nodes.filter(n => near(n.y, 0));
    t.equal(top.length, 1, 'points on the short side merged');
    t.end();
});

test('roundAllCorners on an open polyline uses the whole side next to an end', (t) => {
    const result = roundAllCorners(parsePath('M0 0 L10 0 L10 10'), 4);
    t.equal(result.count, 1);
    const nodes = result.path[0].nodes;
    t.equal(nodes.length, 4);
    t.ok(near(nodes[1].x, 6) && near(nodes[1].y, 0));
    t.ok(near(nodes[2].x, 10) && near(nodes[2].y, 4));
    t.end();
});

test('roundAllCorners: nothing to round or no radius gives null', (t) => {
    t.equal(roundAllCorners(parsePath('M0 0 L10 0'), 2), null, 'no corners');
    t.equal(roundAllCorners(parsePath('M0 0 L10 0 L10 10 Z'), 0), null, 'radius 0');
    t.equal(roundAllCorners(parsePath('M0 0 L10 0 L10 10 Z'), NaN), null, 'no number');
    t.end();
});

test('roundAllCornersD works on path data and on several subpaths', (t) => {
    const d = roundAllCornersD('M0 0 L10 0 L10 10 L0 10 Z M20 0 L30 0 L30 10 Z', 1);
    t.ok(d && typeof d.d === 'string');
    t.equal(d.count, 7);
    const path = parsePath(d.d);
    t.equal(path.length, 2);
    t.equal(path[0].nodes.length, 8);
    t.equal(path[1].nodes.length, 6);
    t.equal(roundAllCornersD('not a path', 1), null);
    t.end();
});

test('clampRoundRadius limits to the maximum and to 0', (t) => {
    t.deepEqual(clampRoundRadius(3, 5), { radius: 3, clamped: false });
    t.deepEqual(clampRoundRadius(8, 5), { radius: 5, clamped: true });
    t.deepEqual(clampRoundRadius(-1, 5), { radius: 0, clamped: true });
    t.deepEqual(clampRoundRadius(8, Infinity), { radius: 8, clamped: false }, 'paths only: no maximum');
    t.deepEqual(clampRoundRadius(NaN, 5), { radius: 0, clamped: false });
    t.end();
});

test('roundRadiusLimit: half the shorter side of the smallest rectangle', (t) => {
    t.equal(roundRadiusLimit([{ width: 40, height: 20 }, { width: 10, height: 30 }]), 5);
    t.equal(roundRadiusLimit([]), Infinity, 'no rectangles');
    t.end();
});

test('initialRoundRadius: the current radius of the first rounded rectangle, else 2 mm', (t) => {
    t.equal(DEFAULT_ROUND_RADIUS, 2);
    t.equal(initialRoundRadius([0, 4, 6]), 4);
    t.equal(initialRoundRadius([0, 0]), 2);
    t.equal(initialRoundRadius([]), 2);
    t.equal(initialRoundRadius([3.33333]), 3.33, 'rounded to 2 decimals');
    t.end();
});

const fakeElem = (nodeName, attrs) => ({ nodeName, getAttribute: (name) => (name in attrs ? String(attrs[name]) : null) });
const isEditable = (elem) => elem.getAttribute('data-point-editable') === 'true';

test('roundTargets: rectangles and editable paths with sharp corners', (t) => {
    const rect = { modelID: 'r', visible: true, elem: fakeElem('rect', { x: 0, y: 0, width: 40, height: 20, rx: 3 }) };
    const path = { modelID: 'p', visible: true, elem: fakeElem('path', { d: 'M0 0 L10 0 L10 10 Z', 'data-point-editable': 'true' }) };
    const imported = { modelID: 'i', visible: true, elem: fakeElem('path', { d: 'M0 0 L10 0 L10 10 Z' }) };
    const smooth = { modelID: 's', visible: true, elem: fakeElem('path', { d: 'M0 0 C5 -5 10 -5 10 0', 'data-point-editable': 'true' }) };
    const hidden = { modelID: 'h', visible: false, elem: fakeElem('rect', { x: 0, y: 0, width: 4, height: 4 }) };
    const image = { modelID: 'img', visible: true, elem: fakeElem('image', { width: 4, height: 4 }) };
    const targets = roundTargets([rect, path, imported, smooth, hidden, image], isEditable);
    t.deepEqual(targets.map(x => [x.model.modelID, x.kind]), [['r', 'rect'], ['p', 'path']]);
    t.equal(targets[0].corners.radii.tl, 3, 'current radius of the rectangle');
    t.equal(targets[1].d, 'M0 0 L10 0 L10 10 Z');
    t.deepEqual(roundTargets([], isEditable), []);
    t.end();
});

test('roundTargetResult: rounded geometry of a target for the preview', (t) => {
    const rect = { model: {}, kind: 'rect', corners: { kind: 'rect', x: 0, y: 0, width: 40, height: 20, radii: { tl: 0, tr: 0, br: 0, bl: 0 } } };
    const r1 = roundTargetResult(rect, 4);
    t.ok(r1.d.startsWith('M'), 'path data');
    t.notOk(r1.clamped);
    t.ok(roundTargetResult(rect, 15).clamped, 'more than half the shorter side');
    const path = { model: {}, kind: 'path', d: 'M0 0 L4 0 L4 20 L0 20 Z' };
    const r2 = roundTargetResult(path, 5);
    t.ok(r2.clamped, 'short sides of a path');
    t.equal(roundTargetResult(path, 0), null, 'radius 0: nothing to show');
    t.end();
});

test('pen tool paths (one subpath per segment) are chained before rounding', (t) => {
    const pen = 'M 0 0 L 20 0 Z M 20 0 L 20 20 Z M 20 20 L 0 20 Z M 0 20 L 0 0 Z';
    const result = roundAllCornersD(pen, 2);
    t.ok(result, 'rounded');
    t.equal(result.count, 4, 'four corners of the drawn square');
    const path = parsePath(result.d);
    t.equal(path.length, 1, 'one closed chain');
    t.ok(path[0].closed);
    const elem = fakeElem('path', { d: pen, id: 'graph-1' });
    t.equal(roundTargets([{ visible: true, elem }], () => true).length, 1, 'a pen path is a target');
    t.end();
});
