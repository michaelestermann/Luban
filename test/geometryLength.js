import { test } from 'tape';
import {
    segmentLength,
    pathLength,
    pathDLength,
    ellipsePerimeter,
    circleCircumference,
    rectPerimeter,
    polylineLength,
    shapesLength,
    formatMm,
    geometryRows,
    sumLengths,
    cutLength,
    selectionGeometry,
    outlineDLength,
} from '../src/app/ui/SVGEditor/measure/geometry-length';
import { parsePath, ellipseToPath } from '../src/app/ui/SVGEditor/path-edit/path-geometry';

const near = (t, actual, expected, tol, msg) => t.ok(Math.abs(actual - expected) <= tol, `${msg} (${actual} ≈ ${expected})`);

test('segmentLength of lines and cubic béziers', (t) => {
    near(t, segmentLength({ from: { x: 0, y: 0 }, to: { x: 3, y: 4 }, c1: null, c2: null }), 5, 1e-12, 'line 3-4-5');
    // a cubic with collinear control points is a straight line
    near(t, segmentLength({ from: { x: 0, y: 0 }, to: { x: 30, y: 0 }, c1: { x: 10, y: 0 }, c2: { x: 20, y: 0 } }), 30, 1e-9, 'straight cubic');
    // quarter circle approximation (kappa) has length ≈ π/2 · r
    const k = 0.5522847498;
    const quarter = { from: { x: 100, y: 0 }, to: { x: 0, y: 100 }, c1: { x: 100, y: 100 * k }, c2: { x: 100 * k, y: 100 } };
    near(t, segmentLength(quarter), Math.PI * 50, 0.05, 'quarter circle');
    t.end();
});

test('pathLength sums subpaths and closing segments', (t) => {
    near(t, pathDLength('M0 0 L10 0 L10 10 L0 10 Z'), 40, 1e-9, 'closed square');
    near(t, pathDLength('M0 0 L10 0 L10 10 L0 10'), 30, 1e-9, 'open square');
    near(t, pathDLength('M0 0 L10 0 M0 5 L10 5'), 20, 1e-9, 'two subpaths');
    near(t, pathLength(parsePath(ellipseToPath(0, 0, 10, 10))), 2 * Math.PI * 10, 0.02, 'circle from 4 cubics');
    near(t, pathDLength('M0 0 A10 10 0 0 1 20 0'), Math.PI * 10, 0.02, 'arc');
    t.equal(pathDLength(''), 0, 'empty d');
    t.end();
});

test('ellipse, circle and rectangle perimeters', (t) => {
    near(t, circleCircumference(20), 125.66370614, 1e-6, 'circle r 20');
    near(t, ellipsePerimeter(10, 10), 2 * Math.PI * 10, 1e-9, 'ellipse that is a circle');
    // reference: exact perimeter of a=10, b=5 is 48.44224110
    near(t, ellipsePerimeter(10, 5), 48.44224110, 1e-4, 'ellipse 10 x 5 (Ramanujan II)');
    // Ramanujan II is 0.04 % short for a flat ellipse
    near(t, ellipsePerimeter(10, 0), 40, 0.02, 'flat ellipse');
    t.equal(rectPerimeter(30, 22), 104, 'rectangle');
    t.end();
});

test('polylineLength and shapesLength (SVGParser output) with scale', (t) => {
    t.equal(polylineLength([[0, 0], [3, 4], [3, 10]]), 11, 'polyline');
    t.equal(polylineLength([[1, 1]]), 0, 'single point');
    const shapes = [
        { visibility: true, paths: [{ closed: true, points: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]] }] },
        { visibility: true, paths: [{ closed: false, points: [[0, 0], [0, 5]] }] },
        { visibility: false, paths: [{ closed: false, points: [[0, 0], [100, 0]] }] },
    ];
    t.equal(shapesLength(shapes, 1, 1), 45, 'visible shapes only');
    t.equal(shapesLength(shapes, 2, 2), 90, 'uniform scale');
    t.equal(shapesLength([{ visibility: true, paths: [{ closed: false, points: [[0, 0], [10, 0], [10, 10]] }] }], 2, 3), 50, 'non uniform scale');
    t.end();
});

test('formatMm and sumLengths', (t) => {
    t.equal(formatMm(125.6637), '125.7', '1 decimal');
    t.equal(formatMm(-0.01), '0.0', 'no -0.0');
    t.equal(sumLengths([1, 2, null, 3.5]), null, 'unknown part makes the sum unknown');
    t.equal(sumLengths([1, 2, 3.5]), 6.5, 'sum');
    t.equal(sumLengths([]), null, 'empty');
    t.end();
});

test('geometryRows per shape kind', (t) => {
    t.deepEqual(geometryRows({ kind: 'circle', width: 40, height: 40 }), [
        { key: 'circumference', value: circleCircumference(20) },
        { key: 'radius', value: 20 },
    ], 'circle');
    t.deepEqual(geometryRows({ kind: 'ellipse', width: 20, height: 10 }), [
        { key: 'circumference', value: ellipsePerimeter(10, 5) },
        { key: 'width', value: 20 },
        { key: 'height', value: 10 },
    ], 'ellipse');
    t.deepEqual(geometryRows({ kind: 'rect', width: 30, height: 22 }), [
        { key: 'perimeter', value: 104 },
        { key: 'width', value: 30 },
        { key: 'height', value: 22 },
    ], 'rectangle');
    t.deepEqual(geometryRows({ kind: 'path', length: 12.5 }), [{ key: 'length', value: 12.5 }], 'path');
    t.deepEqual(geometryRows({ kind: 'svg', length: 99 }), [{ key: 'length', value: 99 }], 'imported svg');
    t.deepEqual(geometryRows({ kind: 'multiple', length: 7 }), [{ key: 'totalLength', value: 7 }], 'several objects');
    t.deepEqual(geometryRows({ kind: 'svg', length: null }), [], 'length not known yet');
    t.deepEqual(geometryRows({ kind: 'image' }), [], 'raster image');
    t.deepEqual(geometryRows({ kind: 'text' }), [], 'text');
    t.end();
});

test('cutLength and selectionGeometry', (t) => {
    t.equal(cutLength({ kind: 'rect', width: 30, height: 22 }), 104, 'rectangle perimeter');
    t.equal(cutLength({ kind: 'circle', width: 40, height: 40 }), circleCircumference(20), 'circle');
    t.equal(cutLength({ kind: 'path', length: 12 }), 12, 'path');
    t.equal(cutLength({ kind: 'svg', length: null }), null, 'svg still loading');
    t.equal(cutLength({ kind: 'image' }), undefined, 'raster has no cut length');

    const rect = { kind: 'rect', width: 30, height: 22 };
    t.equal(selectionGeometry([]), null, 'nothing selected');
    t.equal(selectionGeometry([rect]), rect, 'one object: its own geometry');
    t.deepEqual(selectionGeometry([rect, { kind: 'path', length: 6 }, { kind: 'text' }]), { kind: 'multiple', length: 110 }, 'sum, text ignored');
    t.deepEqual(selectionGeometry([rect, { kind: 'svg', length: null }]), { kind: 'multiple', length: null }, 'pending svg');
    t.equal(selectionGeometry([{ kind: 'image' }, { kind: 'text' }]), null, 'only raster and text');
    t.end();
});

test('outlineDLength counts pen tool segments once', (t) => {
    // pen tool output: each straight segment is a closed 2 point subpath ("M a L b Z")
    t.equal(pathDLength('M0 0 L10 0 Z M10 0 L10 10 Z'), 40, 'raw: each segment there and back');
    t.equal(outlineDLength('M0 0 L10 0 Z M10 0 L10 10 Z'), 20, 'pen path: 2 segments');
    t.equal(outlineDLength('M0 0 L10 0 L10 10 Z'), 10 + 10 + Math.hypot(10, 10), 'normal closed path unchanged');
    t.equal(outlineDLength(''), 0, 'empty');
    t.end();
});
