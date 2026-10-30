import { test } from 'tape';
import {
    parsePath,
    serializePath,
    segmentCount,
    pointAt,
    insertPoint,
    nearestOnSegment,
    getSegment,
    nearestSegment,
    deletePoint,
    splitAt,
    splitSegment,
    closeOpenSubpaths,
    joinEnds,
    hasOpenSubpaths,
    rectToPath,
    ellipseToPath,
    circleToPath,
    lineToPath,
    setPointPosition,
    setPointType,
    getPointType,
} from '../src/app/ui/SVGEditor/path-edit/path-geometry';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const nearPoint = (p, q, eps = 1e-6) => near(p.x, q.x, eps) && near(p.y, q.y, eps);

// Samples every segment of every subpath, returns a flat list of points.
function sample(path, steps = 20) {
    const pts = [];
    path.forEach((sub, si) => {
        for (let i = 0; i < segmentCount(sub); i++) {
            for (let k = 0; k <= steps; k++) {
                pts.push(pointAt(path, si, i, k / steps));
            }
        }
    });
    return pts;
}

// Every sampled point of a lies on b (within eps) and vice versa.
function sameShape(t, a, b, msg) {
    const onPath = (p, path) => {
        const n = nearestSegment(path, p);
        return n && n.distance < 1e-4;
    };
    const ok = sample(a).every((p) => onPath(p, b)) && sample(b).every((p) => onPath(p, a));
    t.ok(ok, msg);
}

function bbox(path) {
    const pts = sample(path, 50);
    return {
        minX: Math.min(...pts.map((p) => p.x)),
        maxX: Math.max(...pts.map((p) => p.x)),
        minY: Math.min(...pts.map((p) => p.y)),
        maxY: Math.max(...pts.map((p) => p.y)),
    };
}

test('pathGeometry: parse and serialize absolute lines', (t) => {
    const path = parsePath('M0 0 L10 0 L10 10');
    t.equal(path.length, 1);
    t.equal(path[0].closed, false);
    t.equal(path[0].nodes.length, 3);
    t.equal(serializePath(path), 'M0 0 L10 0 L10 10');
    t.end();
});

test('pathGeometry: relative commands, H and V become absolute L', (t) => {
    const path = parsePath('m1 1 h10 v10 H1 z');
    t.equal(path[0].closed, true);
    t.equal(path[0].nodes.length, 4);
    t.equal(serializePath(path), 'M1 1 L11 1 L11 11 L1 11 Z');
    t.end();
});

test('pathGeometry: closing point equal to start is merged', (t) => {
    const path = parsePath('M0 0 L10 0 L10 10 L0 0 Z');
    t.equal(path[0].nodes.length, 3);
    t.equal(serializePath(path), 'M0 0 L10 0 L10 10 Z');
    const curved = parsePath('M0 0 L10 0 C10 5 5 10 0 0 Z');
    t.equal(curved[0].nodes.length, 2);
    t.equal(serializePath(curved), 'M0 0 L10 0 C10 5 5 10 0 0 Z');
    t.end();
});

test('pathGeometry: quadratic becomes an equivalent cubic', (t) => {
    const path = parsePath('M0 0 Q5 10 10 0');
    t.equal(serializePath(path), 'M0 0 C3.333 6.667 6.667 6.667 10 0');
    // quadratic midpoint is (5, 5)
    t.ok(nearPoint(pointAt(path, 0, 0, 0.5), { x: 5, y: 5 }));
    t.end();
});

test('pathGeometry: arc becomes cubics on the circle', (t) => {
    const path = parsePath('M10 0 A10 10 0 0 1 -10 0');
    t.ok(path[0].nodes.length >= 2);
    const pts = sample(path);
    t.ok(pts.every((p) => near(Math.hypot(p.x, p.y), 10, 0.01)), 'all samples on radius 10');
    const last = path[0].nodes[path[0].nodes.length - 1];
    t.ok(nearPoint(last, { x: -10, y: 0 }, 1e-6));
    t.end();
});

test('pathGeometry: several subpaths, rounding and round trip', (t) => {
    const d = 'M0 0 L1.23456 2 Z M5 5 l1 1';
    const path = parsePath(d);
    t.equal(path.length, 2);
    t.equal(serializePath(path), 'M0 0 L1.235 2 Z M5 5 L6 6');
    t.equal(serializePath(parsePath(serializePath(path))), serializePath(path));
    t.equal(serializePath(parsePath('M-0.0001 0 L1 1')), 'M0 0 L1 1');
    t.end();
});

test('pathGeometry: parse is immutable-friendly (serialize does not change input)', (t) => {
    const path = parsePath('M0 0 L10 0');
    const copy = JSON.stringify(path);
    insertPoint(path, 0, 0, 0.5);
    deletePoint(parsePath('M0 0 L5 0 L10 0'), 0, 1);
    setPointPosition(path, 0, 0, 3, 3);
    t.equal(JSON.stringify(path), copy);
    t.end();
});

test('pathGeometry: insert on a line keeps the shape', (t) => {
    const path = parsePath('M0 0 L10 0 L10 10');
    const res = insertPoint(path, 0, 0, 0.25);
    t.equal(res[0].nodes.length, 4);
    t.ok(nearPoint(res[0].nodes[1], { x: 2.5, y: 0 }));
    t.equal(serializePath(res), 'M0 0 L2.5 0 L10 0 L10 10');
    sameShape(t, path, res, 'same shape');
    t.end();
});

test('pathGeometry: insert on a cubic keeps the shape', (t) => {
    const path = parsePath('M0 0 C0 10 10 10 10 0 L0 0 Z');
    const res = insertPoint(path, 0, 0, 0.3);
    t.equal(res[0].nodes.length, 3);
    t.ok(nearPoint(res[0].nodes[1], pointAt(path, 0, 0, 0.3)));
    sameShape(t, path, res, 'same shape');
    // the closing segment of a closed subpath can be split too
    const res2 = insertPoint(path, 0, 1, 0.5);
    t.equal(res2[0].nodes.length, 3);
    t.ok(nearPoint(res2[0].nodes[2], { x: 5, y: 0 }));
    sameShape(t, path, res2, 'same shape after splitting the closing segment');
    t.end();
});

test('pathGeometry: nearest segment for a click position', (t) => {
    const path = parsePath('M0 0 L10 0 L10 10 M20 0 C20 10 30 10 30 0');
    const a = nearestSegment(path, { x: 4, y: 1 });
    t.equal(a.subpathIndex, 0);
    t.equal(a.segmentIndex, 0);
    t.ok(near(a.t, 0.4));
    t.ok(near(a.distance, 1));
    const b = nearestSegment(path, { x: 11, y: 7 });
    t.equal(b.segmentIndex, 1);
    t.ok(near(b.t, 0.7));
    const c = nearestSegment(path, { x: 25, y: 9 });
    t.equal(c.subpathIndex, 1);
    t.ok(near(c.t, 0.5, 1e-4));
    t.ok(near(c.distance, 1.5, 1e-4));
    const seg = getSegment(path[0], 0);
    const n = nearestOnSegment(seg, { x: -5, y: 3 });
    t.equal(n.t, 0);
    t.ok(near(n.distance, Math.hypot(5, 3)));
    t.equal(nearestSegment([], { x: 0, y: 0 }), null);
    t.end();
});

test('pathGeometry: delete a point in an open subpath', (t) => {
    const path = parsePath('M0 0 L10 0 L10 10 L0 10');
    t.equal(serializePath(deletePoint(path, 0, 1)), 'M0 0 L10 10 L0 10');
    t.equal(serializePath(deletePoint(path, 0, 0)), 'M10 0 L10 10 L0 10');
    t.equal(serializePath(deletePoint(path, 0, 3)), 'M0 0 L10 0 L10 10');
    // two cubic neighbours keep the outer control points
    const curved = parsePath('M0 0 C0 5 5 5 5 0 C5 -5 10 -5 10 0');
    t.equal(serializePath(deletePoint(curved, 0, 1)), 'M0 0 C0 5 10 -5 10 0');
    // a cubic next to a line becomes a straight line
    const mixed = parsePath('M0 0 C0 5 5 5 5 0 L10 0');
    t.equal(serializePath(deletePoint(mixed, 0, 1)), 'M0 0 L10 0');
    // deleting the end of an open cubic drops its handle
    t.equal(serializePath(deletePoint(curved, 0, 2)), 'M0 0 C0 5 5 5 5 0');
    t.end();
});

test('pathGeometry: delete a point in a closed subpath stays closed', (t) => {
    const path = parsePath('M0 0 L10 0 L10 10 L0 10 Z');
    const res = deletePoint(path, 0, 0);
    t.equal(res[0].closed, true);
    t.equal(serializePath(res), 'M10 0 L10 10 L0 10 Z');
    t.equal(serializePath(deletePoint(path, 0, 2)), 'M0 0 L10 0 L0 10 Z');
    t.end();
});

test('pathGeometry: delete refuses below two points', (t) => {
    t.equal(deletePoint(parsePath('M0 0 L10 0'), 0, 0), null);
    t.equal(deletePoint(parsePath('M0 0 L10 0 L5 5 Z'), 0, 0) !== null, true);
    t.equal(deletePoint(parsePath('M0 0 C0 5 10 5 10 0 Z'), 0, 1), null);
    t.end();
});

test('pathGeometry: split a closed subpath at a point gives one open subpath', (t) => {
    const path = parsePath('M0 0 L10 0 L10 10 L0 10 Z');
    const res = splitAt(path, 0, 2);
    t.equal(res.length, 1);
    t.equal(res[0].closed, false);
    t.equal(serializePath(res), 'M10 10 L0 10 L0 0 L10 0 L10 10');
    sameShape(t, path, res, 'same shape');
    t.end();
});

test('pathGeometry: split an open subpath gives two subpaths', (t) => {
    const path = parsePath('M0 0 L10 0 L10 10 L0 10');
    const res = splitAt(path, 0, 1);
    t.equal(res.length, 2);
    t.equal(serializePath(res), 'M0 0 L10 0 M10 0 L10 10 L0 10');
    t.equal(splitAt(path, 0, 0), null, 'no split at an open end');
    t.equal(splitAt(path, 0, 3), null, 'no split at an open end');
    t.end();
});

test('pathGeometry: split a segment at t', (t) => {
    const open = parsePath('M0 0 L10 0 L10 10');
    t.equal(serializePath(splitSegment(open, 0, 0, 0.5)), 'M0 0 L5 0 M5 0 L10 0 L10 10');
    const closed = parsePath('M0 0 C0 10 10 10 10 0 Z');
    const res = splitSegment(closed, 0, 0, 0.5);
    t.equal(res.length, 1);
    t.equal(res[0].closed, false);
    t.ok(nearPoint(res[0].nodes[0], { x: 5, y: 7.5 }));
    sameShape(t, closed, res, 'same shape');
    t.end();
});

test('pathGeometry: close open subpaths', (t) => {
    const path = parsePath('M0 0 L10 0 L10 10 M20 0 L30 0 L30 10 Z');
    t.equal(hasOpenSubpaths(path), true);
    const res = closeOpenSubpaths(path);
    t.equal(hasOpenSubpaths(res), false);
    t.equal(serializePath(res), 'M0 0 L10 0 L10 10 Z M20 0 L30 0 L30 10 Z');
    t.equal(hasOpenSubpaths(path), true, 'input unchanged');
    t.end();
});

test('pathGeometry: join ends within tolerance', (t) => {
    const path = parsePath('M0 0 L10 0 L10 10 L0.5 0.5 M20 0 L30 0 L30 10 L20 5');
    const { path: res, joined } = joinEnds(path, 1);
    t.equal(joined, 1);
    t.equal(res[0].closed, true);
    t.equal(res[0].nodes.length, 3);
    t.ok(nearPoint(res[0].nodes[0], { x: 0.25, y: 0.25 }));
    t.equal(serializePath(res), 'M0.25 0.25 L10 0 L10 10 Z M20 0 L30 0 L30 10 L20 5');
    t.equal(res[1].closed, false, 'far ends stay open');
    const none = joinEnds(path, 0.1);
    t.equal(none.joined, 0);
    t.equal(serializePath(none.path), serializePath(path));
    // control points move along with the ends
    const curved = parsePath('M0 0 C0 5 10 5 10 0 C10 -5 1 -5 1 0');
    const c = joinEnds(curved, 1);
    t.equal(c.joined, 1);
    t.equal(serializePath(c.path), 'M0.5 0 C0.5 5 10 5 10 0 C10 -5 0.5 -5 0.5 0 Z');
    t.end();
});

test('pathGeometry: rect, line, circle and ellipse to path', (t) => {
    t.equal(rectToPath(1, 2, 10, 20), 'M1 2 L11 2 L11 22 L1 22 Z');
    t.equal(lineToPath(0, 0, 3.5, 4), 'M0 0 L3.5 4');
    const e = parsePath(ellipseToPath(10, 20, 5, 3));
    t.equal(e[0].closed, true);
    t.equal(e[0].nodes.length, 4);
    const b = bbox(e);
    t.ok(near(b.minX, 5, 1e-3) && near(b.maxX, 15, 1e-3), 'x extent');
    t.ok(near(b.minY, 17, 1e-3) && near(b.maxY, 23, 1e-3), 'y extent');
    const c = parsePath(circleToPath(0, 0, 10));
    const pts = sample(c);
    t.ok(pts.every((p) => near(Math.hypot(p.x, p.y), 10, 0.003)), 'circle samples close to radius');
    t.ok(nearPoint(c[0].nodes[0], { x: 10, y: 0 }));
    t.end();
});

test('pathGeometry: setPointPosition moves the neighbouring control points', (t) => {
    const path = parsePath('M0 0 C0 5 5 5 5 0 C5 -5 10 -5 10 0');
    const res = setPointPosition(path, 0, 1, 6, 1);
    t.equal(serializePath(res), 'M0 0 C0 5 6 6 6 1 C6 -4 10 -5 10 0');
    const line = setPointPosition(parsePath('M0 0 L10 0'), 0, 1, 10, 5);
    t.equal(serializePath(line), 'M0 0 L10 5');
    t.end();
});

test('pathGeometry: setPointType smooth makes handles collinear', (t) => {
    const path = parsePath('M0 0 C0 5 4 5 5 0 C8 -2 10 -5 10 0');
    t.equal(getPointType(path, 0, 1), 'corner');
    const res = setPointType(path, 0, 1, 'smooth');
    const n = res[0].nodes[1];
    t.equal(getPointType(res, 0, 1), 'smooth');
    const vin = { x: n.in.x - n.x, y: n.in.y - n.y };
    const vout = { x: n.out.x - n.x, y: n.out.y - n.y };
    t.ok(near(vin.x * vout.y - vin.y * vout.x, 0, 1e-9), 'cross product zero');
    t.ok(vin.x * vout.x + vin.y * vout.y < 0, 'opposite directions');
    t.ok(near(Math.hypot(vin.x, vin.y), Math.hypot(1, 5)), 'incoming length kept');
    t.ok(near(Math.hypot(vout.x, vout.y), Math.hypot(3, 2)), 'outgoing length kept');
    t.ok(nearPoint(n, { x: 5, y: 0 }), 'point did not move');
    t.equal(serializePath(setPointType(path, 0, 1, 'corner')), serializePath(path));
    // a handle next to a straight line is aligned with that line
    const mixed = parsePath('M0 0 L5 0 C8 3 10 5 10 0');
    const m = setPointType(mixed, 0, 1, 'smooth');
    t.ok(near(m[0].nodes[1].out.y, 0), 'handle on the line direction');
    t.ok(m[0].nodes[1].out.x > 5);
    t.equal(getPointType(m, 0, 1), 'smooth');
    t.end();
});
