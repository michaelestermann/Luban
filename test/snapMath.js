import { test } from 'tape';
import { buildCandidates, snapBox, snapPoint, boxRefs } from '../src/app/ui/SVGEditor/snap/snap-math';

const ALL_OFF = { grid: false, points: false, centers: false, edges: false, align: false, gridSize: 10 };
const ORIGIN = { x: 0, y: 0 };
const box = (minX, minY, maxX, maxY) => ({ minX, minY, maxX, maxY });
const near = (a, b) => Math.abs(a - b) < 1e-9;

test('buildCandidates: options choose points and lines', (t) => {
    const targets = { boxes: [box(0, 0, 10, 20)], ends: [{ x: 3, y: 4 }], origin: ORIGIN };
    let c = buildCandidates(targets, ALL_OFF);
    t.equal(c.points.length, 0, 'all off: no points');
    t.equal(c.lines.length, 0, 'all off: no lines');

    c = buildCandidates(targets, { ...ALL_OFF, points: true });
    t.equal(c.points.length, 4 + 4 + 1, 'corners, edge mid points and path ends');
    t.ok(c.points.every(p => p.kind !== 'center'), 'no centres');

    c = buildCandidates(targets, { ...ALL_OFF, centers: true });
    t.deepEqual(c.points.map(p => [p.x, p.y, p.kind]), [[5, 10, 'center']], 'only the centre');

    c = buildCandidates(targets, { ...ALL_OFF, edges: true });
    t.equal(c.lines.length, 4, 'edges: 2 x lines and 2 y lines');
    t.ok(c.lines.every(l => l.kind === 'edge'), 'edge lines only');

    c = buildCandidates(targets, { ...ALL_OFF, align: true });
    t.equal(c.lines.length, 6, 'align: edges and centre lines');
    t.equal(c.lines.filter(l => l.kind === 'center').length, 2, 'two centre lines');
    t.end();
});

test('boxRefs: corners, edge mid points and centre with centre flags', (t) => {
    const refs = boxRefs(box(0, 0, 10, 20));
    t.equal(refs.length, 9, '9 refs');
    const centre = refs.find(r => r.x === 5 && r.y === 10);
    t.ok(centre && centre.cx && centre.cy, 'centre flagged on both axes');
    const topMid = refs.find(r => r.x === 5 && r.y === 0);
    t.ok(topMid && topMid.cx && !topMid.cy, 'top mid point: x is a centre, y an edge');
    t.end();
});

test('snapBox: align to another object edge with guide and distance label', (t) => {
    const c = buildCandidates({ boxes: [box(30, 50, 44, 60)], ends: [], origin: ORIGIN }, { ...ALL_OFF, align: true });
    const r = snapBox(box(0, 0, 10, 10), 29.7, 0.2, c, 0.5);
    t.ok(near(r.dx, 30), `left edge onto x = 30 (dx ${r.dx})`);
    t.ok(near(r.dy, 0.2), 'y is free');
    t.ok(r.snapX && !r.snapY, 'only x snapped');
    const g = r.guides.find(gd => gd.x1 === 30 && gd.x2 === 30);
    t.ok(g, 'vertical guide at x = 30');
    t.ok(near(Math.min(g.y1, g.y2), 0.2) && near(Math.max(g.y1, g.y2), 60), 'guide spans both boxes');
    t.ok(g.label && g.label.text === '39.8', `distance to the neighbour (${g.label && g.label.text})`);
    t.ok(near(g.label.y, (10.2 + 50) / 2), 'label in the middle of the gap');
    t.end();
});

test('snapBox: centre to centre', (t) => {
    const c = buildCandidates({ boxes: [box(100, 0, 120, 10)], ends: [], origin: ORIGIN }, { ...ALL_OFF, align: true });
    // moving centre x 5 + 104.8 = 109.8 -> 110
    const r = snapBox(box(0, 30, 10, 40), 104.8, 0, c, 0.5);
    t.ok(near(r.dx, 105), `centre onto centre (dx ${r.dx})`);
    t.end();
});

test('snapBox: edges only snap where the boxes face each other', (t) => {
    const c = buildCandidates({ boxes: [box(30, 0, 40, 10)], ends: [], origin: ORIGIN }, { ...ALL_OFF, edges: true });
    let r = snapBox(box(0, 5, 10, 15), 19.8, 0, c, 0.5);
    t.ok(near(r.dx, 20) && r.snapX, 'right edge onto the neighbour left edge');
    r = snapBox(box(0, 100, 10, 110), 19.8, 0, c, 0.5);
    t.ok(near(r.dx, 19.8) && !r.snapX, 'far away in y: no snap');
    // centre lines are not edge targets
    r = snapBox(box(0, 5, 10, 15), 29.8, 0, c, 0.5);
    t.ok(!r.snapX || near(r.dx, 30) || near(r.dx, 20), 'no centre-line snap');
    r = snapBox(box(0, 5, 10, 15), 30.2, 0, c, 0.5);
    t.ok(near(r.dx, 30), 'left edge onto left edge');
    t.end();
});

test('snapBox: grid', (t) => {
    const c = buildCandidates({ boxes: [], ends: [], origin: { x: 2, y: 0 } }, { ...ALL_OFF, grid: true, gridSize: 5 });
    let r = snapBox(box(0, 0, 3, 3), 1.2, 0, c, 0.5);
    t.ok(!r.snapX && near(r.dx, 1.2), 'between grid lines: free');
    r = snapBox(box(0, 0, 3, 3), 1.8, 0.4, c, 0.5);
    t.ok(near(r.dx, 2), `left edge onto the grid line x = 2 (dx ${r.dx})`);
    t.ok(near(r.dy, 0), 'top edge onto y = 0');
    t.ok(r.guides.some(g => g.kind === 'grid'), 'grid guide');
    t.end();
});

test('snapBox: an object line wins over the grid at the same distance', (t) => {
    const c = buildCandidates({ boxes: [box(20.6, 0, 30, 10)], ends: [], origin: ORIGIN }, { ...ALL_OFF, grid: true, gridSize: 10, align: true });
    const r = snapBox(box(0, 0, 10, 10), 10.3, 0, c, 0.5);
    t.ok(near(r.dx, 10.6), `object line (dx ${r.dx})`);
    t.end();
});

test('snapPoint: end points, centres and alignment', (t) => {
    const targets = { boxes: [box(0, 0, 10, 20)], ends: [{ x: 50, y: 50 }], origin: ORIGIN };
    let c = buildCandidates(targets, { ...ALL_OFF, points: true });
    let r = snapPoint({ x: 50.3, y: 49.8 }, c, 0.5);
    t.ok(near(r.x, 50) && near(r.y, 50), 'onto the path end point');
    t.equal(r.point && r.point.kind, 'end', 'point kind');
    r = snapPoint({ x: 5.2, y: 10.1 }, c, 0.5);
    t.ok(near(r.x, 5.2) && near(r.y, 10.1), 'centres off: free');
    c = buildCandidates(targets, { ...ALL_OFF, centers: true });
    r = snapPoint({ x: 5.2, y: 10.1 }, c, 0.5);
    t.ok(near(r.x, 5) && near(r.y, 10), 'onto the centre');
    c = buildCandidates(targets, { ...ALL_OFF, align: true });
    r = snapPoint({ x: 9.7, y: 80 }, c, 0.5);
    t.ok(near(r.x, 10) && near(r.y, 80), 'aligned with the right edge far below');
    t.ok(r.guides.length === 1 && r.guides[0].x1 === 10, 'one vertical guide');
    t.end();
});

test('snapPoint: restricted axes and point on an edge', (t) => {
    const targets = { boxes: [box(0, 0, 10, 20)], ends: [], origin: ORIGIN };
    let c = buildCandidates(targets, { ...ALL_OFF, points: true, align: true });
    const r = snapPoint({ x: 10.2, y: 20.3 }, c, 0.5, { x: true, y: false });
    t.ok(near(r.x, 10) && near(r.y, 20.3), 'only x snaps, no point snap');
    c = buildCandidates(targets, { ...ALL_OFF, edges: true });
    let e = snapPoint({ x: 10.3, y: 7 }, c, 0.5);
    t.ok(near(e.x, 10) && near(e.y, 7), 'onto the right edge');
    e = snapPoint({ x: 10.3, y: 30 }, c, 0.5);
    t.ok(near(e.x, 10.3), 'beyond the edge: free');
    t.end();
});

test('all off: unchanged', (t) => {
    const c = buildCandidates({ boxes: [box(0, 0, 10, 10)], ends: [{ x: 1, y: 1 }], origin: ORIGIN }, ALL_OFF);
    const r = snapBox(box(20, 20, 30, 30), -10.1, -10.1, c, 1);
    t.ok(near(r.dx, -10.1) && near(r.dy, -10.1) && r.guides.length === 0 && !r.point, 'no snap');
    const p = snapPoint({ x: 1.1, y: 1.1 }, c, 1);
    t.ok(near(p.x, 1.1) && near(p.y, 1.1), 'point unchanged');
    t.end();
});
