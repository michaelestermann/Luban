import test from 'tape';
import SVGParser from '../src/shared/lib/SVGParser';
import CNCToolPathGenerator from '../src/server/lib/ToolPathGenerator/CncToolPathGenerator';
import { getCncMethodTiles } from '../src/app/toolpaths/toolpath-step';

const parse = (body) => new SVGParser().parse(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">${body}</svg>`
);

const GEN_INFO = { gcodeConfig: { targetDepth: 1 }, materials: { isRotate: false } };

// flat end mill with 2 mm diameter: the contour moves by 1 mm
const FLAT_2MM = { targetDepth: 1, toolAngle: 180, toolShaftDiameter: 2 };

const xRange = (path) => {
    const xs = path.points.map(p => p[0]);
    return [Math.min(...xs), Math.max(...xs)].map(v => Math.round(v * 100) / 100);
};

const contours = async (body, pathType) => {
    const svg = await parse(body);
    new CNCToolPathGenerator(GEN_INFO)._processPathType(svg, pathType, { ...FLAT_2MM });
    return svg.shapes.flatMap(shape => shape.paths).map(xRange);
};

const SQUARE = '<path d="M10 10 H30 V30 H10 Z" />';
const RING = '<path d="M0 0 H40 V40 H0 Z M10 10 V30 H30 V10 Z" fill-rule="evenodd" />';

test('inside: a closed contour is cut inside the line', async (t) => {
    t.deepEqual(await contours(SQUARE, 'inside'), [[11, 29]]);
    t.end();
});

test('outline: a closed contour is still cut outside the line', async (t) => {
    t.deepEqual(await contours(SQUARE, 'outline'), [[9, 31]]);
    t.end();
});

test('inside: the tool stays in the material of a shape with a hole', async (t) => {
    // outer contour moves in, the hole gets bigger
    t.deepEqual(await contours(RING, 'inside'), [[1, 39], [9, 31]]);
    t.end();
});

test('outline: the material of a shape with a hole keeps its size', async (t) => {
    t.deepEqual(await contours(RING, 'outline'), [[-1, 41], [11, 29]]);
    t.end();
});

test('inside: a V-bit moves the contour by the radius it needs for the depth', async (t) => {
    const svg = await parse(SQUARE);
    // 90° V-bit, 1 mm deep: radius tan(45°) * 1 = 1 mm
    new CNCToolPathGenerator(GEN_INFO)._processPathType(svg, 'inside', { targetDepth: 1, toolAngle: 90, toolShaftDiameter: 6 });
    t.deepEqual(xRange(svg.shapes[0].paths[0]), [11, 29]);
    t.end();
});

test('inside is a method tile after Outline, also on rotary material', (t) => {
    t.deepEqual(getCncMethodTiles(false).map(tile => tile.value), ['path', 'outline', 'inside', 'pocket', 'drill']);
    t.deepEqual(getCncMethodTiles(true).map(tile => tile.value), ['path', 'outline', 'inside', 'pocket']);
    t.end();
});
