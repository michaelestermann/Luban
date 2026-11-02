import { test } from 'tape';
import { canvasBoxToModel, transformedBox } from '../src/app/ui/SVGEditor/origin/live-box';

const near = (a, b) => Math.abs(a - b) < 1e-9;
const sameBox = (a, b) => near(a.min.x, b.min.x) && near(a.min.y, b.min.y) && near(a.max.x, b.max.x) && near(a.max.y, b.max.y);

test('transformedBox: the move preview translate is part of the element matrix', (t) => {
    // Logo 100 x 100 drawn around its centre (520, 210) on a 400 x 400 canvas half (size 200)
    // element matrix while moving: translate(35 20) translate(520 210) ... translate(-520 -210)
    const bbox = { x: 470, y: 160, width: 100, height: 100 };
    const m = { a: 1, b: 0, c: 0, d: 1, e: 35, f: 20 };
    t.deepEqual(transformedBox(bbox, m), { minX: 505, minY: 180, maxX: 605, maxY: 280 });
    t.end();
});

test('transformedBox: rotated and mirrored elements give their axis-aligned frame', (t) => {
    const bbox = { x: -50, y: -10, width: 100, height: 20 };
    const r = Math.PI / 2;
    const rotated = transformedBox(bbox, { a: Math.cos(r), b: Math.sin(r), c: -Math.sin(r), d: Math.cos(r), e: 100, f: 100 });
    t.ok(near(rotated.minX, 90) && near(rotated.maxX, 110) && near(rotated.minY, 50) && near(rotated.maxY, 150), JSON.stringify(rotated));
    const mirrored = transformedBox(bbox, { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    t.deepEqual(mirrored, { minX: -50, minY: -10, maxX: 50, maxY: 10 });
    t.end();
});

test('canvasBoxToModel: canvas (x + size.x, size.y - y) back to model coordinates (y up)', (t) => {
    const box = canvasBoxToModel({ minX: 505, minY: 180, maxX: 605, maxY: 280 }, { x: 400, y: 400 });
    t.ok(sameBox(box, { min: { x: 105, y: 120 }, max: { x: 205, y: 220 } }), JSON.stringify(box));
    t.end();
});
