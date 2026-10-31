import { test } from 'tape';
import { measureInfo, nearestSnap, boxSnapPoints, formatMeasure } from '../src/app/ui/SVGEditor/measure/measure-math';

test('measureInfo: distance, Δx, Δy (Y up) and angle', (t) => {
    // canvas coordinates: Y grows downwards
    const m = measureInfo({ x: 0, y: 0 }, { x: 60, y: -13.3 });
    t.ok(Math.abs(m.distance - Math.hypot(60, 13.3)) < 1e-9, 'distance');
    t.equal(m.dx, 60, 'Δx');
    t.equal(m.dy, 13.3, 'Δy is positive upwards');
    t.ok(Math.abs(m.angle - 12.498) < 0.01, `angle ${m.angle}`);
    t.equal(measureInfo({ x: 10, y: 10 }, { x: 0, y: 10 }).angle, 180, 'to the left: 180°');
    t.equal(measureInfo({ x: 0, y: 0 }, { x: 0, y: 10 }).angle, -90, 'downwards: -90°');
    t.equal(measureInfo({ x: 5, y: 5 }, { x: 5, y: 5 }).angle, 0, 'same point: 0°');
    t.end();
});

test('formatMeasure', (t) => {
    const f = formatMeasure(measureInfo({ x: 0, y: 0 }, { x: 60, y: -13.3 }));
    t.equal(f.distance, '61.5 mm', 'distance');
    t.equal(f.details, 'Δx 60.0 · Δy 13.3 · 12.5°', 'details');
    t.end();
});

test('boxSnapPoints: corners, edge mid points and centre', (t) => {
    const pts = boxSnapPoints({ x: 0, y: 0, width: 10, height: 20 });
    t.equal(pts.length, 9, '9 points');
    t.deepEqual(pts.find(p => p.kind === 'center'), { x: 5, y: 10, kind: 'center' }, 'centre');
    t.equal(pts.filter(p => p.kind === 'corner').length, 4, '4 corners');
    t.equal(pts.filter(p => p.kind === 'mid').length, 4, '4 mid points');
    t.end();
});

test('nearestSnap within tolerance', (t) => {
    const candidates = [{ x: 0, y: 0, kind: 'corner' }, { x: 10, y: 0, kind: 'end' }, { x: 13, y: 0, kind: 'center' }];
    t.deepEqual(nearestSnap(candidates, { x: 11, y: 1 }, 8), { x: 10, y: 0, kind: 'end' }, 'nearest one');
    t.equal(nearestSnap(candidates, { x: 30, y: 30 }, 8), null, 'none in reach');
    t.equal(nearestSnap([], { x: 0, y: 0 }, 8), null, 'no candidates');
    t.deepEqual(nearestSnap(candidates, { x: 0, y: 8 }, 8), candidates[0], 'exactly at the tolerance');
    t.end();
});
