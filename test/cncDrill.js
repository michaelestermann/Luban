import test from 'tape';
import SVGParser from '../src/shared/lib/SVGParser';
import GcodeGenerator from '../src/server/lib/GcodeGenerator/GcodeGenerator';
import {
    buildDrillMoves,
    getDrillPoints,
    orderPoints
} from '../src/server/lib/ToolPathGenerator/DrillToolPathGenerator';

const parse = (body, w = 100, h = 50) => new SVGParser().parse(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
);

const info = (t = {}) => ({
    sourceType: 'svg',
    transformation: { width: 100, height: 50, scaleX: 1, scaleY: 1, rotationZ: 0, ...t }
});

const near = (t, point, x, y, msg) => {
    t.ok(point && Math.abs(point.x - x) < 0.01 && Math.abs(point.y - y) < 0.01,
        `${msg}: expected (${x}, ${y}), got ${point && `(${point.x}, ${point.y})`}`);
};

const CIRCLE = '<circle cx="20" cy="10" r="5"/>';

test('Drill points: circle -> center', async (t) => {
    const points = getDrillPoints(await parse(CIRCLE), info());
    t.equal(points.length, 1, 'one point');
    near(t, points[0], -30, 15, 'center relative to model center, Y up');
    t.end();
});

test('Drill points: two circles -> two points', async (t) => {
    const points = getDrillPoints(await parse(`${CIRCLE}<circle cx="80" cy="40" r="5"/>`), info());
    t.equal(points.length, 2, 'two points');
    near(t, points[1], 30, -15, 'second circle');
    t.end();
});

test('Drill points: open path ignored', async (t) => {
    const points = getDrillPoints(await parse('<path d="M0 0 L10 10" stroke="black"/>'), info());
    t.deepEqual(points, [], 'no points');
    t.end();
});

test('Drill points: duplicated circle -> one point', async (t) => {
    const points = getDrillPoints(await parse(CIRCLE + CIRCLE), info());
    t.equal(points.length, 1, 'one point');
    t.end();
});

test('Drill points: concentric circles yield one point', async (t) => {
    const points = getDrillPoints(await parse(`${CIRCLE}<circle cx="20" cy="10" r="3"/>`), info());
    t.equal(points.length, 1, 'one point');
    t.end();
});

test('Drill points: hidden shape ignored', async (t) => {
    const points = getDrillPoints(await parse('<circle cx="20" cy="10" r="5" visibility="hidden"/>'), info());
    t.deepEqual(points, [], 'no points');
    t.end();
});

test('Drill points: scaled model', async (t) => {
    const points = getDrillPoints(await parse(CIRCLE), info({ width: 200, height: 100 }));
    near(t, points[0], -60, 30, 'scaled center');
    t.end();
});

test('Drill points: rotated and mirrored model', async (t) => {
    const rotated = getDrillPoints(await parse(CIRCLE), info({ rotationZ: Math.PI / 2 }));
    near(t, rotated[0], -15, -30, 'rotated 90 degrees counter-clockwise');
    const mirrored = getDrillPoints(await parse(CIRCLE), info({ scaleX: -1 }));
    near(t, mirrored[0], 30, 15, 'mirrored in X');
    t.end();
});

test('Drill points: orderPoints nearest neighbour', (t) => {
    const ordered = orderPoints([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 1, y: 0 }]);
    t.deepEqual(ordered, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 10, y: 0 }], 'nearest first');
    t.end();
});

const config = (c = {}) => ({ targetDepth: 3, stepDown: 1, safetyHeight: 5, stopHeight: 20, ...c });
const plunges = (data) => data.filter(c => c.G === 1).map(c => c.Z);
const ONE_POINT = [{ x: 0, y: 0 }];

test('Drill moves: pecks to depth', (t) => {
    const data = buildDrillMoves(ONE_POINT, config());
    t.deepEqual(plunges(data), [-1, -2, -3], 'three pecks');
    data.forEach((c, i) => {
        if (c.G === 1) {
            t.equal(c.F, 'plungeSpeed', 'plunge uses plungeSpeed placeholder');
            t.deepEqual(data[i + 1], { G: 0, Z: 1 }, 'retract to 1 mm after peck');
        }
    });
    t.end();
});

test('Drill moves: non-multiple depth', (t) => {
    t.deepEqual(plunges(buildDrillMoves(ONE_POINT, config({ targetDepth: 2.5 }))), [-1, -2, -2.5]);
    t.end();
});

test('Drill moves: float drift', (t) => {
    t.deepEqual(plunges(buildDrillMoves(ONE_POINT, config({ targetDepth: 0.3, stepDown: 0.1 }))), [-0.1, -0.2, -0.3]);
    t.end();
});

test('Drill moves: single plunge', (t) => {
    t.deepEqual(plunges(buildDrillMoves(ONE_POINT, config({ stepDown: 5 }))), [-3], 'step down > depth');
    t.deepEqual(plunges(buildDrillMoves(ONE_POINT, config({ stepDown: 0 }))), [-3], 'step down 0');
    t.end();
});

test('Drill moves: low jog height', (t) => {
    const data = buildDrillMoves(ONE_POINT, config({ safetyHeight: 0.5 }));
    const retracts = data.filter((c, i) => i > 0 && data[i - 1].G === 1);
    t.ok(retracts.length > 0 && retracts.every(c => c.G === 0 && c.Z === 0.5), 'retract plane is jog height');
    t.end();
});

test('Drill moves: sequence', (t) => {
    const data = buildDrillMoves([{ x: -30, y: 15 }, { x: 30, y: -15 }], config());
    const has = (obj, from = 0) => data.findIndex((c, i) => i >= from && JSON.stringify(c) === JSON.stringify(obj));
    const g90 = has({ G: 90 });
    const g21 = has({ G: 21 }, g90);
    const jog = has({ G: 0, Z: 5, F: 'jogSpeed' }, g21);
    const spindle = has({ M: 3, P: 100 }, jog);
    const p1 = has({ G: 0, X: -30, Y: 15, F: 'jogSpeed' }, spindle);
    const up1 = has({ G: 0, Z: 5 }, p1);
    const p2 = has({ G: 0, X: 30, Y: -15, F: 'jogSpeed' }, up1);
    const up2 = has({ G: 0, Z: 5 }, p2);
    t.ok([g90, g21, jog, spindle, p1, up1, p2, up2].every(i => i >= 0), 'commands in order');
    t.deepEqual(data[data.length - 1], { G: 0, Z: 20 }, 'ends at stop height');
    t.end();
});

test('Drill moves: parseAsCNC integration', (t) => {
    const data = buildDrillMoves([{ x: -30, y: 15 }], config());
    const lines = new GcodeGenerator().parseAsCNC({ data, positionX: 100, positionY: 50 }, { jogSpeed: 1500, plungeSpeed: 300 });
    t.ok(lines.includes('G0 X70.00 Y65.00 F1500'), 'travel offset by model position');
    t.ok(lines.includes('G1 Z-1.00 F300'), 'peck with plunge speed');
    t.end();
});

test('Drill moves: sub-micron depth terminates', (t) => {
    t.deepEqual(plunges(buildDrillMoves(ONE_POINT, config({ targetDepth: 0.0004 }))), [], 'no peck, no endless loop');
    t.end();
});

test('Drill moves: tiny step down terminates', (t) => {
    const depths = plunges(buildDrillMoves(ONE_POINT, config({ targetDepth: 0.01, stepDown: 0.0001 })));
    t.equal(depths[depths.length - 1], -0.01, 'reaches target depth');
    t.end();
});
