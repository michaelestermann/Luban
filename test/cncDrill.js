import test from 'tape';
import SVGParser from '../src/shared/lib/SVGParser';
import {
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
