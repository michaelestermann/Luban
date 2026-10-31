import { test } from 'tape';
import { labelCovers, placeLabel } from '../src/app/ui/SVGEditor/label-placement';

const VIEW = { x: 0, y: 0, width: 1000, height: 800 };
const SIZE = { width: 150, height: 40 };
const GAP = 16;

const rectOf = (p, size = SIZE) => ({ x: p.x, y: p.y, width: size.width, height: size.height });
// distance of a point to a rect (0 inside)
const distance = (r, p) => Math.hypot(
    Math.max(r.x - p.x, 0, p.x - (r.x + r.width)),
    Math.max(r.y - p.y, 0, p.y - (r.y + r.height))
);
const inside = (r, view) => r.x >= view.x - 1e-9 && r.y >= view.y - 1e-9
    && r.x + r.width <= view.x + view.width + 1e-9 && r.y + r.height <= view.y + view.height + 1e-9;

test('placeLabel: default bottom-right of the cursor, clear of it', (t) => {
    const cursor = { x: 400, y: 300 };
    const p = placeLabel({ cursor, size: SIZE, view: VIEW });
    t.equal(p.quadrant, 'bottom-right', 'bottom-right');
    t.ok(p.x >= cursor.x + GAP, 'right of the cursor by the gap');
    t.ok(p.y >= cursor.y + GAP, 'below the cursor by the gap');
    t.ok(distance(rectOf(p), cursor) >= GAP, 'at least the gap away');
    t.end();
});

test('placeLabel: bottom-right leaves the cursor graphic free', (t) => {
    const cursor = { x: 400, y: 300 };
    const p = placeLabel({ cursor, size: SIZE, view: VIEW, cursorSize: { width: 14, height: 22 } });
    t.equal(p.quadrant, 'bottom-right');
    t.ok(p.y >= cursor.y + 22 + GAP, 'below the arrow');
    t.end();
});

test('placeLabel: flips at the view edges and stays inside', (t) => {
    const cases = [
        { cursor: { x: 950, y: 300 }, expect: 'bottom-left' },
        { cursor: { x: 400, y: 780 }, expect: 'top-right' },
        { cursor: { x: 990, y: 790 }, expect: 'top-left' },
        { cursor: { x: 10, y: 10 }, expect: 'bottom-right' },
        { cursor: { x: 990, y: 10 }, expect: 'bottom-left' },
        { cursor: { x: 10, y: 790 }, expect: 'top-right' },
    ];
    for (const { cursor, expect } of cases) {
        const p = placeLabel({ cursor, size: SIZE, view: VIEW });
        t.equal(p.quadrant, expect, `${cursor.x},${cursor.y}: ${expect}`);
        t.ok(inside(rectOf(p), VIEW), 'inside the view');
        t.ok(distance(rectOf(p), cursor) >= GAP, 'clear of the cursor');
    }
    t.end();
});

test('placeLabel: an offset view (rulers, mode bar) is respected', (t) => {
    const view = { x: 76, y: 64, width: 900, height: 700 };
    const p = placeLabel({ cursor: { x: 90, y: 70 }, size: SIZE, view });
    t.ok(inside(rectOf(p), view), 'inside the offset view');
    t.equal(p.quadrant, 'bottom-right');
    t.end();
});

test('placeLabel: avoids the snap marker and other points', (t) => {
    const cursor = { x: 400, y: 300 };
    // snap marker right below the cursor where the default label would go
    const snap = { x: 450, y: 340 };
    const p = placeLabel({ cursor, avoid: [snap], size: SIZE, view: VIEW });
    t.notEqual(p.quadrant, 'bottom-right', 'not over the snap marker');
    t.ok(distance(rectOf(p), snap) >= GAP, 'clear of the snap marker');
    t.ok(distance(rectOf(p), cursor) >= GAP, 'clear of the cursor');

    // points in the two lower quadrants: goes up
    const q = placeLabel({ cursor, avoid: [{ x: 450, y: 340 }, { x: 330, y: 340 }], size: SIZE, view: VIEW });
    t.equal(q.quadrant, 'top-right');
    t.end();
});

test('placeLabel: snapped point away from the raw cursor is cleared too', (t) => {
    // the drawn point jumped to the snap point 6 px from the mouse
    const cursor = { x: 400, y: 300 };
    const snapped = { x: 406, y: 304 };
    const p = placeLabel({ cursor, avoid: [snapped], size: SIZE, view: VIEW });
    t.ok(distance(rectOf(p), snapped) >= GAP, 'clear of the snapped point');
    t.ok(distance(rectOf(p), cursor) >= GAP, 'clear of the cursor');
    t.end();
});

test('placeLabel: prefers a side the in-progress segment does not cross', (t) => {
    const cursor = { x: 400, y: 300 };
    // segment coming from the bottom right into the cursor
    const p = placeLabel({ cursor, segments: [[{ x: 700, y: 600 }, cursor]], size: SIZE, view: VIEW });
    t.notEqual(p.quadrant, 'bottom-right', 'not over the line');
    const seg = placeLabel({ cursor, segments: [[{ x: 100, y: 300 }, cursor]], size: SIZE, view: VIEW });
    t.equal(seg.quadrant, 'bottom-right', 'a line from the left does not matter');
    t.end();
});

test('placeLabel: never covers the cursor, a grid of positions', (t) => {
    let bad = 0;
    for (let x = 0; x <= 1000; x += 37) {
        for (let y = 0; y <= 800; y += 29) {
            const cursor = { x, y };
            const snap = { x: x + 12, y: y - 9 };
            const p = placeLabel({ cursor, avoid: [snap], size: SIZE, view: VIEW });
            const r = rectOf(p);
            if (!inside(r, VIEW) || distance(r, cursor) < GAP || distance(r, snap) < GAP) {
                bad++;
            }
        }
    }
    t.equal(bad, 0, 'clear and inside everywhere');
    t.end();
});

test('labelCovers: a rect near points', (t) => {
    const r = { x: 100, y: 100, width: 50, height: 20 };
    t.ok(labelCovers(r, [{ x: 120, y: 110 }]), 'inside');
    t.ok(labelCovers(r, [{ x: 160, y: 110 }]), 'within the gap');
    t.notOk(labelCovers(r, [{ x: 170, y: 110 }]), 'outside the gap');
    t.notOk(labelCovers(r, [{ x: 160, y: 110 }], 4), 'smaller gap');
    t.notOk(labelCovers(r, []), 'no points');
    t.notOk(labelCovers(r, [null]), 'missing points are skipped');
    t.end();
});
