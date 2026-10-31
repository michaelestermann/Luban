import { test } from 'tape';
import {
    FLATTEN_TOLERANCE,
    flattenPath,
    outlineFromD,
    elementD,
    viewBoxMatrix,
    outlineFromPolylines,
    mergeOutlines,
    weld,
    subtract,
    intersect,
    offsetOutline,
    polygonsToD,
    polygonsArea,
    outlineIsEmpty,
    combineMembership,
} from '../src/app/ui/SVGEditor/combine/shape-ops';
import { parsePath } from '../src/app/ui/SVGEditor/path-edit/path-geometry';

const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

const bounds = (polys) => {
    const pts = polys.flat();
    return {
        minX: Math.min(...pts.map(p => p.x)),
        maxX: Math.max(...pts.map(p => p.x)),
        minY: Math.min(...pts.map(p => p.y)),
        maxY: Math.max(...pts.map(p => p.y)),
    };
};

const rect = (x, y, w, h) => outlineFromD(`M${x} ${y} H${x + w} V${y + h} H${x} Z`);
const circle = (cx, cy, r) => outlineFromD(elementD('circle', n => ({ cx, cy, r }[n] ?? null)));

test('flattenPath: lines stay exact, curves within the tolerance', (t) => {
    const square = flattenPath(parsePath('M0 0 L10 0 L10 10 L0 10 Z'));
    t.equal(square.closed.length, 1, 'one closed polygon');
    t.equal(square.closed[0].length, 4, 'four corners, no repeated start');
    t.equal(square.open.length, 0);

    const c = circle(0, 0, 50);
    t.equal(c.closed.length, 1);
    const worst = Math.max(...c.closed[0].map((p, i, arr) => {
        const q = arr[(i + 1) % arr.length];
        // sagitta of the chord against the true circle
        const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        return 50 - Math.hypot(mid.x, mid.y);
    }));
    t.ok(worst <= FLATTEN_TOLERANCE + 0.01, `chord error ${worst.toFixed(4)} mm is small`);
    t.ok(FLATTEN_TOLERANCE <= 0.05, 'tolerance is at most 0.05 mm');

    const open = flattenPath(parsePath('M0 0 L10 0 L10 10'));
    t.equal(open.closed.length, 0);
    t.equal(open.open.length, 1);
    t.equal(open.open[0].length, 3);
    t.end();
});

test('outlineFromD: pen tool format and a matrix', (t) => {
    // pen tool: every segment its own subpath, chained and closed
    const pen = outlineFromD('M0 0 L10 0 Z M10 0 L10 10 Z M10 10 L0 0 Z');
    t.equal(pen.closed.length, 1, 'pen triangle is one closed polygon');
    t.equal(pen.closed[0].length, 3);
    const moved = outlineFromD('M0 0 H10 V10 H0 Z', [2, 0, 0, 2, 100, 50]);
    const b = bounds(moved.closed);
    t.deepEqual([b.minX, b.minY, b.maxX, b.maxY], [100, 50, 120, 70], 'scaled and moved');
    // a closed two point subpath is a line, not an area
    const line = outlineFromD('M0 0 L10 0 Z');
    t.equal(line.closed.length, 0);
    t.equal(line.open.length, 1);
    t.end();
});

test('elementD: draw tool shapes', (t) => {
    const attrs = (o) => (n) => (o[n] === undefined ? null : String(o[n]));
    t.ok(elementD('rect', attrs({ x: 0, y: 0, width: 10, height: 5 })).startsWith('M'));
    const rounded = outlineFromD(elementD('rect', attrs({ x: 0, y: 0, width: 20, height: 10, rx: 3 })));
    const area = polygonsArea(rounded.closed);
    // flattened arcs lie inside the true arcs, by at most the tolerance
    t.ok(near(area, 200 - (4 - Math.PI) * 9, 2 * Math.PI * 3 * FLATTEN_TOLERANCE), `rounded rect area ${area.toFixed(3)}`);
    t.ok(elementD('ellipse', attrs({ cx: 5, cy: 5, rx: 4, ry: 2 })));
    t.ok(elementD('line', attrs({ x1: 0, y1: 0, x2: 4, y2: 4 })));
    t.equal(elementD('path', attrs({ d: 'M0 0 L1 1' })), 'M0 0 L1 1');
    t.equal(elementD('text', attrs({})), null, 'text is not a shape');
    t.end();
});

test('viewBoxMatrix: meet, slice and none', (t) => {
    const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    // 100x50 viewBox into a 200x200 box: meet scales by 2, centred vertically
    const meet = viewBoxMatrix([0, 0, 100, 50], { x: 10, y: 20, width: 200, height: 200 }, null);
    t.deepEqual(apply(meet, 0, 0), [10, 70]);
    t.deepEqual(apply(meet, 100, 50), [210, 170]);
    const none = viewBoxMatrix([0, 0, 100, 50], { x: 0, y: 0, width: 200, height: 200 }, 'none');
    t.deepEqual(apply(none, 100, 50), [200, 200]);
    const slice = viewBoxMatrix([0, 0, 100, 50], { x: 0, y: 0, width: 200, height: 200 }, 'xMinYMin slice');
    t.deepEqual(apply(slice, 100, 50), [400, 200]);
    const offset = viewBoxMatrix([-50, -25, 100, 50], { x: 0, y: 0, width: 100, height: 50 }, null);
    t.deepEqual(apply(offset, -50, -25), [0, 0]);
    t.end();
});

test('outlineFromPolylines: parsed SVG shapes with a matrix', (t) => {
    const o = outlineFromPolylines([
        { closed: true, points: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] },
        { closed: false, points: [[0, 0], [5, 5]] },
    ], [1, 0, 0, 1, 5, 5]);
    t.equal(o.closed.length, 1);
    t.equal(o.closed[0].length, 4, 'repeated end point removed');
    t.deepEqual(o.closed[0][0], { x: 5, y: 5 });
    t.equal(o.open.length, 1);
    const merged = mergeOutlines([o, rect(0, 0, 1, 1)]);
    t.equal(merged.closed.length, 2);
    t.ok(outlineIsEmpty({ closed: [], open: [] }));
    t.end();
});

test('weld: overlapping, disjoint, inside and three shapes', (t) => {
    const a = rect(0, 0, 10, 10);
    const b = rect(5, 5, 10, 10);
    const ab = weld([a, b]);
    t.equal(ab.length, 1, 'overlapping squares become one outline');
    t.ok(near(polygonsArea(ab), 175), 'area 100 + 100 - 25');

    const far = weld([a, rect(20, 0, 5, 5)]);
    t.equal(far.length, 2, 'disjoint shapes stay two outlines in one path');
    t.ok(near(polygonsArea(far), 125));

    const inner = weld([a, rect(2, 2, 3, 3)]);
    t.equal(inner.length, 1, 'a shape inside another disappears');
    t.ok(near(polygonsArea(inner), 100));

    const three = weld([a, b, rect(8, 0, 10, 4)]);
    t.equal(three.length, 1);

    const rc = weld([rect(0, 0, 20, 20), circle(20, 10, 5)]);
    t.equal(rc.length, 1, 'rect + circle');
    t.ok(near(polygonsArea(rc), 400 + Math.PI * 25 / 2, Math.PI * 5 * FLATTEN_TOLERANCE), 'half the circle sticks out');

    // a shape with a hole keeps the hole where nothing covers it
    const ring = outlineFromD('M0 0 H30 V30 H0 Z M10 10 H20 V20 H10 Z');
    const ringWeld = weld([ring, rect(40, 0, 5, 5)]);
    t.ok(near(polygonsArea(ringWeld), 900 - 100 + 25), 'hole kept');
    t.end();
});

test('subtract and intersect', (t) => {
    const a = rect(0, 0, 10, 10);
    const b = rect(5, 5, 10, 10);
    t.ok(near(polygonsArea(subtract(a, [b])), 75), 'bottom minus top');
    const hole = subtract(rect(0, 0, 30, 30), [rect(10, 10, 10, 10)]);
    t.equal(hole.length, 2, 'outer outline and a hole');
    t.ok(near(polygonsArea(hole), 800));
    t.ok(near(polygonsArea(subtract(a, [b, rect(-5, -5, 7, 7)])), 75 - 4), 'all shapes above are cut out');
    t.ok(near(polygonsArea(intersect([a, b])), 25), 'overlap');
    t.ok(near(polygonsArea(intersect([a, b, rect(0, 0, 7, 7)])), 4), 'overlap of three');
    t.equal(intersect([a, rect(20, 20, 1, 1)]).length, 0, 'no overlap: empty');
    t.equal(subtract(rect(2, 2, 1, 1), [a]).length, 0, 'fully covered: empty');
    t.end();
});

test('offsetOutline: sides and corners', (t) => {
    const sq = rect(0, 0, 10, 10);
    const round = offsetOutline(sq, 2, 'outside', 'round');
    t.equal(round.inside.length, 0);
    t.ok(near(polygonsArea(round.outside), 100 + 4 * 20 + Math.PI * 4, 0.15), 'round corners');
    const sharp = offsetOutline(sq, 2, 'outside', 'sharp');
    t.ok(near(polygonsArea(sharp.outside), 196), 'sharp corners: 14 x 14');
    const b = bounds(sharp.outside);
    t.deepEqual([b.minX, b.minY, b.maxX, b.maxY].map(v => Math.round(v * 1000) / 1000), [-2, -2, 12, 12]);
    const chamfer = offsetOutline(sq, 2, 'outside', 'chamfer');
    const ca = polygonsArea(chamfer.outside);
    t.ok(ca > 100 + 80 && ca < 196 - 0.5, `chamfer between ${ca.toFixed(2)}`);

    const inside = offsetOutline(sq, 2, 'inside', 'sharp');
    t.equal(inside.outside.length, 0);
    t.ok(near(polygonsArea(inside.inside), 36), 'inside: 6 x 6');
    const both = offsetOutline(sq, 1, 'both', 'sharp');
    t.ok(near(polygonsArea(both.outside), 144));
    t.ok(near(polygonsArea(both.inside), 64));
    t.equal(offsetOutline(sq, 6, 'inside', 'round').inside.length, 0, 'too far inside: empty');

    // a hole grows when the outline grows
    const ring = outlineFromD('M0 0 H30 V30 H0 Z M10 10 H20 V20 H10 Z');
    const ringOut = offsetOutline(ring, 1, 'outside', 'sharp');
    t.ok(near(polygonsArea(ringOut.outside), 32 * 32 - 8 * 8), 'hole shrinks by the distance');

    // an open path gets an outline around it
    const open = outlineFromD('M0 0 L10 0');
    const openRound = offsetOutline(open, 1, 'outside', 'round');
    t.ok(near(polygonsArea(openRound.outside), 20 + Math.PI, 0.1), 'round ends');
    const openInside = offsetOutline(open, 1, 'inside', 'sharp');
    t.ok(near(polygonsArea(openInside.outside), 24), 'open paths: outline with square ends on any side');
    t.end();
});

test('polygonsToD: closed path data, far away coordinates keep precision', (t) => {
    const d = polygonsToD([[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }]]);
    t.equal(d, 'M0 0 L10 0 L10 10 Z', 'repeated start dropped');
    const far = weld([rect(1000, 1000, 10, 10), rect(1005, 1000, 10, 10)]);
    const b = bounds(far);
    t.deepEqual([b.minX, b.minY, b.maxX, b.maxY], [1000, 1000, 1015, 1010]);
    t.equal(polygonsToD([]), '');
    t.end();
});

test('combineMembership: the result takes the place of the bottom input', (t) => {
    // bottom input in the operation: replaced in place, other inputs leave
    t.deepEqual(combineMembership(['x', 'a', 'y', 'b'], ['a', 'b'], 'a', 'r'), ['x', 'r', 'y']);
    // only a non-bottom input: it leaves
    t.deepEqual(combineMembership(['x', 'b'], ['a', 'b'], 'a', 'r'), ['x']);
    // only inputs, bottom not among them: would become empty, keeps the result
    t.deepEqual(combineMembership(['b', 'c'], ['a', 'b', 'c'], 'a', 'r'), ['r']);
    // no input: unchanged
    t.deepEqual(combineMembership(['x', 'y'], ['a'], 'a', 'r'), ['x', 'y']);
    t.end();
});
