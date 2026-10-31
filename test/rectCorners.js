import { test } from 'tape';
import { parsePath, pointAt } from '../src/app/ui/SVGEditor/path-edit/path-geometry';
import {
    maxCornerRadius,
    clampRadii,
    radiiEqual,
    roundedRectPathD,
    readRoundedRect,
    flipRadii,
    rectElementRadius,
    planCorners,
    readCorners,
} from '../src/app/ui/SVGEditor/path-edit/rect-corners';
import SVGParser from '../src/shared/lib/SVGParser';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const R = (tl, tr, br, bl) => ({ tl, tr, br, bl });

test('maxCornerRadius is half the shorter side', (t) => {
    t.equal(maxCornerRadius(40, 20), 10);
    t.equal(maxCornerRadius(5, 30), 2.5);
    t.equal(maxCornerRadius(0, 30), 0);
    t.end();
});

test('clampRadii clamps every corner to 0 .. half the shorter side', (t) => {
    t.deepEqual(clampRadii(R(2, 3, 4, 5), 40, 20), { radii: R(2, 3, 4, 5), clamped: false });
    t.deepEqual(clampRadii(R(30, 3, -1, 10), 40, 20), { radii: R(10, 3, 0, 10), clamped: true }, 'too large and negative');
    t.deepEqual(clampRadii(R(NaN, 1, 1, 1), 40, 20).radii.tl, 0, 'invalid number is 0');
    t.end();
});

test('radiiEqual', (t) => {
    t.ok(radiiEqual(R(3, 3, 3, 3)));
    t.notOk(radiiEqual(R(3, 3, 3, 2)));
    t.ok(radiiEqual(R(3, 3, 3, 3 + 1e-9)), 'within tolerance');
    t.end();
});

test('roundedRectPathD: quarter circle arcs as cubics, sharp corners as one point', (t) => {
    const path = parsePath(roundedRectPathD(0, 0, 40, 20, R(5, 0, 2, 0)));
    t.equal(path.length, 1);
    t.ok(path[0].closed, 'closed');
    // tl: 2 points, tr: 1, br: 2, bl: 1
    t.equal(path[0].nodes.length, 6, '6 points');
    const xs = path[0].nodes.map(n => n.x);
    const ys = path[0].nodes.map(n => n.y);
    t.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [0, 40, 0, 20], 'box kept');
    // the middle of the tl arc lies on the circle around (5, 5)
    const tlStart = path[0].nodes.findIndex(n => near(n.x, 0) && near(n.y, 5));
    t.ok(tlStart >= 0, 'tl arc starts at (0, 5)');
    const mid = pointAt(path, 0, tlStart, 0.5);
    t.ok(near(Math.hypot(mid.x - 5, mid.y - 5), 5, 0.01), `arc middle on the circle (${Math.hypot(mid.x - 5, mid.y - 5)})`);
    t.end();
});

test('roundedRectPathD merges points where two arcs meet (radius = half side)', (t) => {
    const path = parsePath(roundedRectPathD(0, 0, 20, 20, R(10, 10, 10, 10)));
    t.equal(path[0].nodes.length, 4, 'a circle: 4 points');
    t.ok(path[0].nodes.every(n => n.in && n.out), 'all points smooth');
    const pill = parsePath(roundedRectPathD(0, 0, 40, 20, R(10, 10, 10, 10)));
    t.equal(pill[0].nodes.length, 6, 'pill: ends merged on the short sides');
    t.end();
});

test('readRoundedRect recognises generated paths and their radii', (t) => {
    const d = roundedRectPathD(10, 20, 40, 30, R(5, 0, 2, 15));
    const info = readRoundedRect(d);
    t.ok(info, 'recognised');
    t.deepEqual([info.x, info.y, info.width, info.height].map(v => Math.round(v * 1000) / 1000), [10, 20, 40, 30], 'box');
    t.deepEqual(Object.values(info.radii).map(v => Math.round(v * 1000) / 1000), [5, 0, 2, 15], 'radii');
    t.ok(readRoundedRect(roundedRectPathD(0, 0, 20, 20, R(10, 10, 10, 10))), 'circle-like');
    t.ok(readRoundedRect('M0 0 L10 0 L10 10 L0 10 Z'), 'plain rectangle: radii 0');
    t.equal(readRoundedRect('M0 0 L10 0 L12 10 L0 10 Z'), null, 'not a rectangle');
    t.equal(readRoundedRect('M0 0 L10 0 L10 10'), null, 'open');
    t.equal(readRoundedRect(`${d} M100 100 L110 100 L110 110 Z`), null, 'two subpaths');
    // a corner point moved by point editing
    t.equal(readRoundedRect(d.replace(/^M10 /, 'M11 ')), null, 'changed path');
    t.end();
});

test('flipRadii maps corners of a mirrored shape', (t) => {
    t.deepEqual(flipRadii(R(1, 2, 3, 4), false, false), R(1, 2, 3, 4));
    t.deepEqual(flipRadii(R(1, 2, 3, 4), true, false), R(2, 1, 4, 3), 'horizontal');
    t.deepEqual(flipRadii(R(1, 2, 3, 4), false, true), R(4, 3, 2, 1), 'vertical');
    t.deepEqual(flipRadii(R(1, 2, 3, 4), true, true), R(3, 4, 1, 2), 'both');
    t.end();
});

test('rectElementRadius follows the SVG rules for rx / ry', (t) => {
    t.equal(rectElementRadius(null, null, 40, 20), 0);
    t.equal(rectElementRadius('4', null, 40, 20), 4, 'rx only');
    t.equal(rectElementRadius(null, '3', 40, 20), 3, 'ry only');
    t.equal(rectElementRadius('50', '50', 40, 20), 10, 'clamped');
    t.end();
});

test('planCorners: equal radii stay on the rect, unequal ones need a path', (t) => {
    t.deepEqual(planCorners('rect', R(4, 4, 4, 4)), { kind: 'rect', radius: 4 });
    t.deepEqual(planCorners('rect', R(0, 0, 0, 0)), { kind: 'rect', radius: 0 });
    t.deepEqual(planCorners('rect', R(4, 0, 4, 4)), { kind: 'path' });
    t.deepEqual(planCorners('path', R(4, 4, 4, 4)), { kind: 'path' }, 'a path stays a path');
    t.end();
});

test('SVGParser draws rounded rect corners as circular arcs', async (t) => {
    const svg = await new SVGParser().parse(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">'
        + '<rect x="0" y="0" width="40" height="20" rx="8" /></svg>'
    );
    const points = svg.shapes[0].paths[0].points;
    // every point of the outline near the top right corner is 8 from (32, 8) or on a side
    const corner = points.filter(p => p[0] > 32 && p[1] < 8);
    t.ok(corner.length > 0, 'points on the arc');
    const worst = Math.max(...corner.map(p => Math.abs(Math.hypot(p[0] - 32, p[1] - 8) - 8)));
    t.ok(worst < 0.05, `arc points on the circle (max error ${worst.toFixed(3)})`);
    t.end();
});

test('readCorners: radii of a rect element or of a rounded rectangle path', (t) => {
    const attrs = (o) => (name) => (name in o ? String(o[name]) : null);
    t.deepEqual(readCorners('rect', attrs({ x: 1, y: 2, width: 40, height: 20, rx: 4 })),
        { kind: 'rect', x: 1, y: 2, width: 40, height: 20, radii: R(4, 4, 4, 4) });
    t.deepEqual(readCorners('rect', attrs({ x: 0, y: 0, width: 40, height: 20 })).radii, R(0, 0, 0, 0), 'no rx');
    const d = roundedRectPathD(0, 0, 40, 20, R(5, 0, 2, 0));
    t.deepEqual(readCorners('path', attrs({ d, 'data-rounded-rect': 'true' })).kind, 'path');
    t.equal(readCorners('path', attrs({ d })), null, 'path without the mark');
    t.equal(readCorners('path', attrs({ d: 'M0 0 L1 1', 'data-rounded-rect': 'true' })), null, 'changed by point editing');
    t.equal(readCorners('ellipse', attrs({ rx: 3 })), null, 'ellipse');
    t.equal(readCorners('rect', attrs({ x: 0, y: 0, width: 0, height: 20 })), null, 'empty rect');
    t.end();
});

test('roundedRectPathD merges points that almost meet (rounded radius)', (t) => {
    // 47.9723 is half of 95.94459 rounded to 4 decimals
    const path = parsePath(roundedRectPathD(0, 0, 143.9, 95.94459, R(5, 47.9723, 47.9723, 47.9723)));
    t.equal(path[0].nodes.length, 7, 'no zero length segment on the right side');
    t.ok(readRoundedRect(roundedRectPathD(0, 0, 143.9, 95.94459, R(5, 47.9723, 47.9723, 47.9723))), 'recognised');
    t.end();
});

test('readRoundedRect reads a path written with 3 decimals', (t) => {
    const d = 'M570.617 114.752 C570.617 111.991 572.856 109.752 575.617 109.752 L666.562 109.752 C693.056 109.752 714.534 131.23 714.534 157.724 '
        + 'C714.534 184.219 693.056 205.697 666.562 205.697 L618.589 205.697 C592.095 205.697 570.617 184.219 570.617 157.724 Z';
    const info = readRoundedRect(d);
    t.ok(info, 'recognised');
    t.ok(info && near(info.radii.tl, 5, 1e-3) && near(info.radii.br, 47.972, 1e-3), 'radii');
    t.end();
});
