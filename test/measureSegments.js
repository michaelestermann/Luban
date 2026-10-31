import { test } from 'tape';
import { parsePath } from '../src/app/ui/SVGEditor/path-edit/path-geometry';
import SVGParser from '../src/shared/lib/SVGParser';
import {
    fitArc,
    pathSegments,
    rectSegments,
    parsedSegments,
    pickSegment,
    measureSegment,
    formatSegmentMeasure,
    formatSegmentSum,
} from '../src/app/ui/SVGEditor/measure/measure-segments';

const near = (t, a, b, msg, eps = 1e-6) => t.ok(Math.abs(a - b) < eps, `${msg} (${a} ≈ ${b})`);
const ID = [1, 0, 0, 1, 0, 0];
const words = { Length: 'Length', Arc: 'Arc', segments: 'segments', Circumference: 'Circumference' };
const tr = (k) => words[k] || k;
const arcPoints = (cx, cy, r, from, to, n) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
        const a = ((from + ((to - from) * i) / n) * Math.PI) / 180;
        pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return pts;
};

test('fitArc: points on a circle give centre, radius and sweep; lines and wobbly curves give null', (t) => {
    const fit = fitArc(arcPoints(10, 20, 5, 0, 90, 12));
    t.ok(fit, 'quarter circle fits');
    near(t, fit.centre.x, 10, 'centre x');
    near(t, fit.centre.y, 20, 'centre y');
    near(t, fit.radius, 5, 'radius');
    near(t, fit.sweep, 90, 'sweep in degrees');
    near(t, fitArc(arcPoints(0, 0, 5, 90, -180, 30)).sweep, 270, 'clockwise sweep is positive too');
    t.equal(fitArc([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }]), null, 'collinear: no arc');
    const wobbly = arcPoints(0, 0, 10, 0, 90, 12).map((p, i) => (i === 3 ? { x: p.x * 1.05, y: p.y * 1.05 } : p));
    t.equal(fitArc(wobbly), null, '5% off the circle: no arc');
    const slightly = arcPoints(0, 0, 10, 0, 90, 12).map((p, i) => (i === 3 ? { x: p.x * 1.004, y: p.y * 1.004 } : p));
    t.ok(fitArc(slightly), '0.4% off the circle still fits (1% tolerance)');
    t.equal(fitArc(arcPoints(0, 0, 1000, 0, 1, 8)), null, 'a nearly straight piece (1 degree) is no arc');
    t.end();
});

test('pathSegments: one segment per piece between two nodes, matrix applied', (t) => {
    const segs = pathSegments(parsePath('M0 0 L10 0 L10 10 C10 20 0 20 0 10'), [2, 0, 0, 2, 1, 1]);
    t.equal(segs.length, 3, 'two lines and a curve');
    t.equal(segs[0].kind, 'line', 'first is a line');
    t.deepEqual([segs[0].points[0], segs[0].points[segs[0].points.length - 1]], [{ x: 1, y: 1 }, { x: 21, y: 1 }], 'line end points in canvas units');
    near(t, segs[0].length, 20, 'line length scaled');
    t.equal(segs[2].kind, 'curve', 'cubic is a curve');
    t.ok(segs[2].points.length > 8, 'curve sampled');
    t.ok(segs[2].bounds.width > 0 && segs[2].bounds.height > 0, 'bounds known');
    const closed = pathSegments(parsePath('M0 0 L10 0 L10 10 Z'), ID);
    t.equal(closed.length, 3, 'closed triangle: the closing side is a segment too');
    near(t, closed[2].length, Math.hypot(10, 10), 'closing side length');
    t.end();
});

test('pathSegments: an SVG arc (rx = ry) becomes one arc segment with radius and sweep', (t) => {
    // a half circle of radius 10: unarc gives two cubics, they are one arc again
    const segs = pathSegments(parsePath('M0 0 L10 0 A10 10 0 0 1 30 0 L40 0'), ID);
    t.equal(segs.length, 3, 'line, arc, line');
    const m = measureSegment(segs[1]);
    t.equal(m.kind, 'arc', 'arc detected');
    near(t, m.radius, 10, 'radius', 0.01);
    near(t, m.sweep, 180, 'sweep', 1e-2);
    near(t, m.length, Math.PI * 10, 'arc length (cubic approximation)', 0.01);
    t.end();
});

test('pathSegments: a rounded corner from cubics is an arc; a circle path is one closed circle', (t) => {
    const k = 0.5522847498 * 5;
    const corner = pathSegments(parsePath(`M0 0 L20 0 C${20 + k} 0 25 ${5 - k} 25 5 L25 30`), ID);
    t.equal(corner.length, 3, 'line, corner, line');
    const m = measureSegment(corner[1]);
    t.equal(m.kind, 'arc', 'kappa cubic is an arc');
    near(t, m.radius, 5, 'corner radius', 0.01);
    near(t, m.sweep, 90, 'corner sweep', 0.2);
    const circle = pathSegments(parsePath('M10 0 A10 10 0 1 1 -10 0 A10 10 0 1 1 10 0 Z'), ID);
    t.equal(circle.length, 1, 'whole circle is one segment');
    const c = measureSegment(circle[0]);
    t.equal(c.kind, 'circle', 'closed arc run is a circle');
    near(t, c.radius, 10, 'circle radius', 0.01);
    near(t, c.diameter, 20, 'diameter', 0.01);
    near(t, c.length, 2 * Math.PI * 10, 'circumference', 0.02);
    t.end();
});

test('pathSegments: non uniform scale makes the arc an ellipse piece: no radius', (t) => {
    const segs = pathSegments(parsePath('M0 0 A10 10 0 0 1 20 0'), [2, 0, 0, 1, 0, 0]);
    // the arc is split into cubics by the parser; stretched they are no longer one circle
    t.ok(segs.length >= 1, 'curve segments');
    t.ok(segs.every(s => measureSegment(s).kind === 'curve'), 'stretched arc: plain curves with their length');
    t.end();
});

test('pathSegments: a straight cubic measures as a line', (t) => {
    const m = measureSegment(pathSegments(parsePath('M0 0 C3 4 6 8 9 12'), ID)[0]);
    t.equal(m.kind, 'line', 'collinear control points');
    near(t, m.length, 15, 'length', 1e-6);
    t.end();
});

test('rectSegments: four sides, rounded corners as arcs', (t) => {
    const sharp = rectSegments(0, 0, 40, 20, 0, ID);
    t.equal(sharp.length, 4, 'four sides');
    t.deepEqual(sharp.map(s => Math.round(s.length)), [40, 20, 40, 20], 'side lengths');
    const round = rectSegments(0, 0, 40, 20, 5, [1, 0, 0, 1, 0, 0]);
    t.equal(round.length, 8, 'four sides and four corners');
    near(t, round[0].length, 30, 'top side without the corners');
    const corner = measureSegment(round[1]);
    t.equal(corner.kind, 'arc', 'corner is an arc');
    near(t, corner.radius, 5, 'corner radius', 1e-3);
    near(t, corner.sweep, 90, 'corner sweep', 1e-3);
    t.end();
});

test('parsedSegments: SVGParser output split at its nodes, mapped, arcs from A and circles', async (t) => {
    const svg = await new SVGParser().parse(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">'
        + '<path d="M0 0 L10 0 A10 10 0 0 1 30 0 C30 10 40 10 40 0" />'
        + '<polygon points="50,50 60,50 60,60" />'
        + '<circle cx="80" cy="80" r="1" />'
        + '<rect x="0" y="60" width="40" height="20" rx="4" />'
        + '</svg>'
    );
    const map = p => ({ x: p.x * 2, y: p.y * 2 });
    const segs = parsedSegments(svg.shapes, map, true);
    const kinds = segs.map(s => measureSegment(s).kind);
    // path: line, arc, curve; polygon: 3 lines; circle; rect: 4 lines + 4 arcs
    t.deepEqual(kinds.slice(0, 3), ['line', 'arc', 'curve'], 'path pieces');
    near(t, measureSegment(segs[0]).length, 20, 'line mapped (scale 2)', 1e-6);
    near(t, measureSegment(segs[1]).radius, 20, 'arc radius mapped', 0.01);
    near(t, measureSegment(segs[1]).sweep, 180, 'arc sweep', 0.5);
    t.deepEqual(kinds.slice(3, 6), ['line', 'line', 'line'], 'polygon sides');
    t.equal(kinds[6], 'circle', 'small circle (few points) is still a circle');
    near(t, measureSegment(segs[6]).radius, 2, 'circle radius mapped', 0.01);
    t.equal(segs.length, 15, 'rect: 4 sides + 4 corners');
    t.equal(kinds.slice(7).filter(k => k === 'arc').length, 4, 'rect corners are arcs');
    near(t, measureSegment(segs[8]).radius, 8, 'rect corner radius mapped', 0.05);
    const stretched = parsedSegments(svg.shapes, p => ({ x: p.x * 2, y: p.y }), false);
    t.notEqual(measureSegment(stretched[6]).kind, 'circle', 'stretched: the circle is no circle');
    t.end();
});

test('parsedSegments: plain polylines without node marks split at every point', (t) => {
    const shapes = [{ visibility: true, paths: [{ closed: false, points: [[0, 0], [10, 0], [10, 10]] }] }];
    const segs = parsedSegments(shapes, p => p, true);
    t.equal(segs.length, 2, 'two lines');
    t.deepEqual(segs.map(s => s.kind), ['line', 'line'], 'lines');
    t.equal(parsedSegments([{ visibility: false, paths: shapes[0].paths }], p => p, true).length, 0, 'hidden shapes skipped');
    t.end();
});

test('parsedSegments: short lines on a circle (exported arcs) are one arc; polygons and split lines stay lines', (t) => {
    // a side, a rounded corner of radius 2 from 8 short lines, a side
    const pts = [[0, 20], [0, 2]];
    for (let i = 1; i <= 8; i++) {
        const a = Math.PI + (Math.PI / 2) * (i / 8);
        pts.push([2 + 2 * Math.cos(a), 2 + 2 * Math.sin(a)]);
    }
    pts.push([20, 0]);
    const segs = parsedSegments([{ visibility: true, paths: [{ closed: false, points: pts }] }], p => p, true);
    t.deepEqual(segs.map(s => measureSegment(s).kind), ['line', 'arc', 'line'], 'side, corner, side');
    const corner = measureSegment(segs[1]);
    near(t, corner.radius, 2, 'corner radius', 0.01);
    near(t, corner.sweep, 90, 'corner sweep', 0.01);
    near(t, measureSegment(segs[0]).length, 18, 'side keeps its length');
    const hexagon = [];
    for (let i = 0; i < 6; i++) {
        hexagon.push([10 * Math.cos((i * Math.PI) / 3), 10 * Math.sin((i * Math.PI) / 3)]);
    }
    const hex = parsedSegments([{ visibility: true, paths: [{ closed: true, points: hexagon }] }], p => p, true);
    t.equal(hex.length, 6, 'a hexagon keeps its six sides');
    t.ok(hex.every(s => s.kind === 'line'), 'hexagon sides are lines');
    const split = parsedSegments([{ visibility: true, paths: [{ closed: false, points: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] }] }], p => p, true);
    t.ok(split.every(s => s.kind === 'line'), 'collinear pieces stay lines');
    t.end();
});

test('pickSegment: nearest segment within tolerance, bounding box prefilter', (t) => {
    const segs = pathSegments(parsePath('M0 0 L10 0 L10 10 L0 10'), ID);
    t.equal(pickSegment(segs, { x: 5, y: 0.5 }, 1), 0, 'top');
    t.equal(pickSegment(segs, { x: 9.6, y: 5 }, 1), 1, 'right');
    t.equal(pickSegment(segs, { x: 5, y: 5 }, 1), -1, 'middle: nothing');
    t.equal(pickSegment(segs, { x: 9.8, y: 0.1 }, 1), 0, 'corner: the nearer one (equal distance: the first)');
    t.equal(pickSegment([], { x: 0, y: 0 }, 1), -1, 'no segments');
    t.end();
});

test('measureSegment and formatSegmentMeasure: line, arc, curve, circle; formatSegmentSum', (t) => {
    const line = measureSegment(pathSegments(parsePath('M0 0 L30 -40'), ID)[0]);
    t.equal(line.kind, 'line', 'line');
    near(t, line.length, 50, 'length');
    near(t, line.dx, 30, 'dx');
    near(t, line.dy, 40, 'dy upwards (canvas y down)');
    const lf = formatSegmentMeasure(line, tr);
    t.equal(lf.title, '50.0 mm', 'line title');
    t.ok(/Δx 30.0 · Δy 40.0/.test(lf.details), `line details ${lf.details}`);
    const arc = measureSegment(pathSegments(parsePath('M10 0 A10 10 0 0 1 0 10'), ID)[0]);
    const af = formatSegmentMeasure(arc, tr);
    t.equal(af.title, `Arc ${(Math.PI * 5).toFixed(1)} mm`, 'arc title');
    t.equal(af.details, 'R 10.0 mm · 90.0°', 'arc details');
    near(t, arc.mid.x, 10 * Math.SQRT1_2, 'arc mid point x', 0.05);
    const curve = measureSegment(pathSegments(parsePath('M0 0 C0 10 20 -10 20 0'), ID)[0]);
    t.equal(curve.kind, 'curve', 'S curve is no arc');
    t.ok(/^Length \d+\.\d mm$/.test(formatSegmentMeasure(curve, tr).title), 'curve title');
    const circle = measureSegment(pathSegments(parsePath('M10 0 A10 10 0 1 1 -10 0 A10 10 0 1 1 10 0 Z'), ID)[0]);
    t.equal(formatSegmentMeasure(circle, tr).title, 'R 10.0 mm · Ø 20.0 mm', 'circle title');
    const sum = formatSegmentSum([line, arc], tr);
    t.equal(sum.title, `2 segments · ${(50 + Math.PI * 5).toFixed(1)} mm`, 'sum');
    t.end();
});
