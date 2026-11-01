import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'tape';
import SVGParser from '../src/shared/lib/SVGParser';
import { taskErrorMessage } from '../src/server/services/task-manager/utils/taskErrorMessage';
import { cncFastEditKeys, cncPathTypeOptions, drillFailureMessage, withDrillDefaults } from '../src/app/toolpaths/cnc-drill';
import GcodeGenerator from '../src/server/lib/GcodeGenerator/GcodeGenerator';
import {
    buildDrillMoves,
    generateDrillToolPathFiles,
    generateDrillToolPathObj,
    generateDrillViewPathObj,
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
            t.deepEqual(data[i + 1], { G: 0, Z: 1, F: 'jogSpeed' }, 'retract to 1 mm after peck');
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
    const jog = has({ G: 0, Z: 20, F: 'jogSpeed' }, g21); // up to the top (stop height) before the first travel
    const spindle = has({ M: 3, P: 100 }, jog);
    const p1 = has({ G: 0, X: -30, Y: 15, F: 'jogSpeed' }, spindle);
    const up1 = has({ G: 0, Z: 5 }, p1);
    const p2 = has({ G: 0, X: 30, Y: -15, F: 'jogSpeed' }, up1);
    const up2 = has({ G: 0, Z: 5 }, p2);
    t.ok([g90, g21, jog, spindle, p1, up1, p2, up2].every(i => i >= 0), 'commands in order');
    t.deepEqual(data.slice(-3), [{ M: 5 }, { G: 0, Z: 20 }, { G: 0, X: 0, Y: 0 }], 'ends like the engine: spindle off, stop height, model origin');
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

const drillModelInfo = (extra = {}) => ({
    ...info(),
    mode: 'vector',
    transformation: { ...info().transformation, positionX: 100, positionY: 50, positionZ: 0 },
    gcodeConfig: { targetDepth: 2, stepDown: 1, safetyHeight: 5, stopHeight: 20, jogSpeed: 1500, plungeSpeed: 300 },
    ...extra
});

test('Drill toolpath: toolpath object', async (t) => {
    const obj = generateDrillToolPathObj(await parse(CIRCLE), drillModelInfo());
    t.equal(obj.headType, 'cnc', 'headType');
    t.equal(obj.positionX, 100, 'positionX');
    t.equal(obj.boundingBox.min.z, -2, 'bounding box reaches target depth');
    t.ok(obj.estimatedTime > 0, 'estimated time');
    t.ok(obj.data.length > 0, 'data');
    t.end();
});

test('Drill toolpath: no closed shapes', async (t) => {
    const svg = await parse('<path d="M0 0 L10 10" stroke="black"/>');
    t.throws(() => generateDrillToolPathObj(svg, drillModelInfo({ originalName: 'lines.svg' })), /Drill: no closed shapes found in lines\.svg/);
    t.end();
});

const withTmpdir = async (fn) => {
    const previous = process.env.Tmpdir;
    process.env.Tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'drill-'));
    try {
        await fn(process.env.Tmpdir);
    } finally {
        process.env.Tmpdir = previous;
    }
};

const SVG_FILE = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50">${CIRCLE}</svg>`;

test('Drill toolpath: one file per model', async (t) => {
    await withTmpdir(async (dir) => {
        fs.writeFileSync(path.join(dir, 'a.svg'), SVG_FILE);
        fs.writeFileSync(path.join(dir, 'b.svg'), SVG_FILE);
        const a = drillModelInfo({ uploadName: 'a.svg', toolpathFileName: 'a.json' });
        const b = drillModelInfo({ uploadName: 'b.svg', toolpathFileName: 'b.json' });
        b.transformation = { ...b.transformation, positionX: 150 };
        const filenames = await generateDrillToolPathFiles([a, b]);
        t.deepEqual(filenames, ['a.json', 'b.json'], 'filenames');
        t.equal(JSON.parse(fs.readFileSync(path.join(dir, 'a.json'), 'utf8')).positionX, 100, 'first model position');
        t.equal(JSON.parse(fs.readFileSync(path.join(dir, 'b.json'), 'utf8')).positionX, 150, 'second model position');
    });
    t.end();
});

test('Drill toolpath: rotary rejected', async (t) => {
    await withTmpdir(async (dir) => {
        fs.writeFileSync(path.join(dir, 'a.svg'), SVG_FILE);
        const rotary = drillModelInfo({ uploadName: 'a.svg', toolpathFileName: 'a.json', materials: { isRotate: true } });
        try {
            await generateDrillToolPathFiles([rotary]);
            t.fail('should reject');
        } catch (err) {
            t.ok(/rotary mode is not supported/.test(err.message), 'rotary error');
        }
    });
    t.end();
});

test('Drill view path: marks holes', async (t) => {
    const view = generateDrillViewPathObj(await parse(CIRCLE), drillModelInfo({ toolParams: { toolDiameter: 2 } }));
    t.equal(view.width, 100, 'width');
    t.equal(view.height, 50, 'height');
    // like CncToolPathGenerator: rows are reversed, so data[0] is the top row; 10 cells per mm
    const cell = (x, y) => view.data[Math.round(view.height * 10 / 2 - y * 10)][Math.round(x * 10 + view.width * 10 / 2)];
    t.equal(cell(-30, 15).y, -2, 'hole center at target depth');
    t.equal(cell(-25, 15).y, 0, '5 mm away untouched');
    t.equal(view.isRotate, false, 'flat');
    t.end();
});

test('Drill errors: task error message from worker failure value', (t) => {
    t.equal(taskErrorMessage(new Error('Drill: rotary mode is not supported')), 'Drill: rotary mode is not supported', 'Error object');
    t.equal(taskErrorMessage('Drill: no closed shapes found in a.svg'), 'Drill: no closed shapes found in a.svg', 'string');
    t.equal(taskErrorMessage({ message: 'Drill: x' }), 'Drill: x', 'serialized error');
    t.equal(taskErrorMessage(undefined), '', 'nothing');
    t.end();
});

test('Drill errors: only drill failures are surfaced', (t) => {
    t.equal(drillFailureMessage({ taskStatus: 'failed', errorMessage: 'Drill: rotary mode is not supported' }), 'Drill: rotary mode is not supported');
    t.equal(drillFailureMessage({ taskStatus: 'failed', errorMessage: 'Slice Error' }), null, 'engine failures keep the generic message');
    t.equal(drillFailureMessage({ taskStatus: 'failed' }), null, 'no message');
    t.end();
});

test('Drill UI: quick-edit keys without work speed and step over', (t) => {
    const keys = ['pathType', 'targetDepth', 'workSpeed', 'plungeSpeed', 'stepDown', 'stepOver'];
    t.deepEqual(cncFastEditKeys(keys, { pathType: 'drill' }), ['pathType', 'targetDepth', 'plungeSpeed', 'stepDown']);
    t.deepEqual(cncFastEditKeys(keys, { pathType: 'path' }), keys, 'other methods unchanged');
    t.end();
});

test('Drill UI: no drill option on rotary material', (t) => {
    const options = { path: 'On the Path', outline: 'Outline', pocket: 'Fill', drill: 'Drill' };
    t.deepEqual(Object.keys(cncPathTypeOptions(options, true)), ['path', 'outline', 'pocket']);
    t.deepEqual(cncPathTypeOptions(options, false), options);
    t.end();
});

test('Drill UI: choosing drill disables tabs', (t) => {
    t.deepEqual(withDrillDefaults({ pathType: 'drill' }), { pathType: 'drill', enableTab: false });
    t.deepEqual(withDrillDefaults({ pathType: 'path' }), { pathType: 'path' });
    t.deepEqual(withDrillDefaults({ targetDepth: 2 }), { targetDepth: 2 });
    t.end();
});

// Z of every travel (G0 with X or Y), in order
const travelHeights = (data) => {
    let z = null;
    const heights = [];
    for (const c of data) {
        if ('Z' in c) {
            z = c.Z;
        }
        if (c.G === 0 && ('X' in c || 'Y' in c)) {
            heights.push(z);
        }
    }
    return heights;
};

test('Drill moves: travel to the first hole happens at the top (stop height), then down', (t) => {
    const data = buildDrillMoves([{ x: 1, y: 2 }, { x: 5, y: 6 }], config({ safetyHeight: 2, stopHeight: 10 }));
    const firstXY = data.findIndex(c => c.G === 0 && 'X' in c);
    const zBefore = data.slice(0, firstXY).filter(c => 'Z' in c).map(c => c.Z);
    t.equal(zBefore[zBefore.length - 1], 10, 'at stop height when moving to the first hole');
    t.ok(zBefore.every(z => z >= 10), 'never below stop height before the first travel');
    t.deepEqual(travelHeights(data).slice(0, 2), [10, 2], 'first hole from the top, next hole at jog height');
    t.end();
});

test('Drill moves: no travel below the jog height', (t) => {
    const data = buildDrillMoves([{ x: 1, y: 2 }, { x: 5, y: 6 }, { x: 9, y: 1 }], config({ safetyHeight: 3, stopHeight: 1 }));
    t.ok(travelHeights(data).every(z => z >= 3), 'all XY travel at or above the jog height');
    t.end();
});

test('Drill moves: the tool leaves the hole at the retract speed', (t) => {
    const data = buildDrillMoves(ONE_POINT, config({ retractSpeed: 2400 }));
    const outs = data.filter((c, i) => i > 0 && data[i - 1].G === 1);
    t.ok(outs.length === 3 && outs.every(c => c.G === 0 && c.F === 'retractSpeed'), 'every move out of the hole uses the retract speed');
    t.end();
});

test('Drill moves: projects without a retract speed leave the hole at the jog speed', (t) => {
    const data = buildDrillMoves(ONE_POINT, config());
    const outs = data.filter((c, i) => i > 0 && data[i - 1].G === 1);
    t.ok(outs.length > 0 && outs.every(c => c.F === 'jogSpeed'), 'jog speed instead of the plunge speed (modal F)');
    t.end();
});
