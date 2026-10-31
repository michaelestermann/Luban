import { test } from 'tape';
import {
    arrayCopyCount,
    arrayTransforms,
    arrayProblem,
    defaultArrayCentre,
    circularStep,
    applyMatrix,
    moveTransformation,
    arrayEntities,
    MAX_ARRAY_COPIES,
} from '../src/app/ui/SVGEditor/combine/array-layout';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const nearPt = (p, q, eps = 1e-6) => near(p.x, q.x, eps) && near(p.y, q.y, eps);

const GRID = { mode: 'grid', columns: 3, rows: 2, gapX: 5, gapY: 10, count: 6, angle: 360, centreX: 0, centreY: 0, rotate: true, group: true };
const BOX = { x: 100, y: 50, width: 20, height: 10 };

test('arrayCopyCount: objects minus the original', (t) => {
    t.equal(arrayCopyCount(GRID), 5, 'grid 3 × 2');
    t.equal(arrayCopyCount({ ...GRID, columns: 1, rows: 1 }), 0, 'grid 1 × 1');
    t.equal(arrayCopyCount({ ...GRID, mode: 'circular', count: 8 }), 7, 'circular 8');
    t.equal(arrayCopyCount({ ...GRID, columns: 2.7, rows: 0 }), 1, 'whole numbers, at least 1');
    t.end();
});

test('grid: copies to the right and downwards, gap between the boxes', (t) => {
    const list = arrayTransforms(GRID, BOX);
    t.equal(list.length, 5);
    const moved = list.map(m => applyMatrix(m, { x: BOX.x, y: BOX.y }));
    t.ok(nearPt(moved[0], { x: 125, y: 50 }), 'first column step = width + gap');
    t.ok(nearPt(moved[1], { x: 150, y: 50 }));
    t.ok(nearPt(moved[2], { x: 100, y: 70 }), 'second row: height + gap lower');
    t.ok(nearPt(moved[4], { x: 150, y: 70 }));
    t.ok(list.every(m => m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1), 'only translations');
    t.end();
});

test('circular: full circle spreads the objects evenly, rotate copies', (t) => {
    const s = { ...GRID, mode: 'circular', count: 4, angle: 360, centreX: 130, centreY: 55, rotate: true };
    t.equal(circularStep(4, 360), 90);
    t.equal(circularStep(4, 180), 60, 'part of a circle: first and last on the ends');
    const list = arrayTransforms(s, BOX);
    t.equal(list.length, 3);
    // selection centre (110, 55) is 20 left of the centre; 90° counter-clockwise on the screen = below it (y down)
    const p = applyMatrix(list[0], { x: 110, y: 55 });
    t.ok(nearPt(p, { x: 130, y: 75 }), `first copy below the centre (${p.x}, ${p.y})`);
    t.ok(nearPt(applyMatrix(list[1], { x: 110, y: 55 }), { x: 150, y: 55 }), 'second opposite');
    t.ok(near(Math.atan2(list[0].b, list[0].a), -Math.PI / 2), 'rotated with the circle');
    t.end();
});

test('circular without rotation only moves the copies', (t) => {
    const s = { ...GRID, mode: 'circular', count: 4, angle: 180, centreX: 130, centreY: 55, rotate: false };
    const list = arrayTransforms(s, BOX);
    t.equal(list.length, 3);
    t.ok(list.every(m => near(m.a, 1) && near(m.b, 0) && near(m.c, 0) && near(m.d, 1)), 'translations');
    t.ok(nearPt(applyMatrix(list[2], { x: 110, y: 55 }), { x: 150, y: 55 }), 'last at 180°');
    t.end();
});

test('arrayProblem names what is wrong', (t) => {
    t.equal(arrayProblem(GRID, BOX), null);
    t.equal(arrayProblem({ ...GRID, columns: 1, rows: 1 }, BOX), 'none', '1 × 1 makes no copies');
    t.equal(arrayProblem({ ...GRID, gapX: -5 }, BOX), null, 'negative gap: overlapping copies are fine');
    t.equal(arrayProblem({ ...GRID, gapX: -20 }, BOX), 'gap', 'copies on the same place');
    t.equal(arrayProblem({ ...GRID, columns: 1, gapX: -50 }, BOX), null, 'gap of an unused direction');
    t.equal(arrayProblem({ ...GRID, rows: 3, gapY: -12 }, BOX), 'gap', 'rows on top of each other');
    t.equal(arrayProblem({ ...GRID, mode: 'circular', count: 1 }, BOX), 'none');
    t.equal(arrayProblem({ ...GRID, mode: 'circular', count: 4, angle: 0 }, BOX), 'angle');
    t.equal(arrayProblem({ ...GRID, columns: 40, rows: 40 }, BOX), 'tooMany');
    t.ok(MAX_ARRAY_COPIES >= 100);
    t.end();
});

test('defaultArrayCentre: one width to the right of the selection centre', (t) => {
    t.deepEqual(defaultArrayCentre(BOX), { x: 130, y: 55 });
    t.end();
});

test('moveTransformation: logical position (Y up) and rotation of a copy', (t) => {
    const size = { x: 200, y: 150 };
    // canvas centre (110, 55) is logical (-90, 95)
    const tr = { positionX: -90, positionY: 95, rotationZ: 0.1 };
    const s = { ...GRID, mode: 'circular', count: 4, angle: 360, centreX: 130, centreY: 55, rotate: true };
    const m = arrayTransforms(s, BOX)[0];
    const moved = moveTransformation(tr, m, size);
    t.ok(near(moved.positionX, -70) && near(moved.positionY, 75), `position (${moved.positionX}, ${moved.positionY})`);
    t.ok(near(moved.rotationZ, 0.1 + Math.PI / 2), 'rotation grows counter-clockwise');
    t.end();
});

test('arrayEntities: free objects and whole groups, not single group members', (t) => {
    const a = { modelID: 'a' };
    const b = { modelID: 'b' };
    const c = { modelID: 'c' };
    const g = { modelID: 'g', children: [b, c] };
    t.deepEqual(arrayEntities([a], [g], null).map(e => e.modelID), ['a']);
    t.deepEqual(arrayEntities([b, c], [g], 'g').map(e => e.modelID), ['g'], 'selected group');
    t.deepEqual(arrayEntities([a, b, c], [g], null).map(e => e.modelID), ['a', 'g'], 'all members selected');
    t.equal(arrayEntities([b], [g], null), null, 'one member of a group');
    t.equal(arrayEntities([], [g], null), null, 'nothing selected');
    t.end();
});
