import { test } from 'tape';
import { parsePath } from '../src/app/ui/SVGEditor/path-edit/path-geometry';
import {
    shapeToPathD,
    SHAPE_GEOMETRY_ATTRIBUTES,
    openPathState,
    closePathD,
    joinPathEndsD,
} from '../src/app/ui/SVGEditor/path-edit/shape-to-path';

const attrs = (o) => (name) => (name in o ? String(o[name]) : null);

test('shapeToPathD converts draw tool shapes', (t) => {
    t.equal(shapeToPathD('rect', attrs({ x: 10, y: 20, width: 30, height: 40 })), 'M10 20 L40 20 L40 60 L10 60 Z', 'rect');
    const e = parsePath(shapeToPathD('ellipse', attrs({ cx: 50, cy: 50, rx: 20, ry: 10 })));
    t.equal(e[0].nodes.length, 4, 'ellipse: 4 points');
    t.ok(e[0].closed, 'ellipse closed');
    t.deepEqual([e[0].nodes[0].x, e[0].nodes[0].y], [70, 50], 'ellipse starts at cx + rx');
    const c = parsePath(shapeToPathD('circle', attrs({ cx: 0, cy: 0, r: 5 })));
    t.equal(c[0].nodes.length, 4, 'circle: 4 points');
    t.equal(shapeToPathD('line', attrs({ x1: 1, y1: 2, x2: 3, y2: 4 })), 'M1 2 L3 4', 'line');
    const rounded = parsePath(shapeToPathD('rect', attrs({ x: 0, y: 0, width: 20, height: 10, rx: 2 })));
    t.equal(rounded[0].nodes.length, 8, 'rounded rect: 2 points per corner');
    const capped = parsePath(shapeToPathD('rect', attrs({ x: 0, y: 0, width: 20, height: 10, ry: 9 })));
    t.equal(capped[0].nodes.length, 6, 'rounded rect: radius clamped to half the height');
    t.end();
});

test('shapeToPathD refuses what it cannot convert exactly', (t) => {
    t.equal(shapeToPathD('rect', attrs({ x: 0, y: 0, width: 0, height: 10 })), null, 'empty rect');
    t.equal(shapeToPathD('ellipse', attrs({ cx: 0, cy: 0, rx: 0, ry: 3 })), null, 'flat ellipse');
    t.equal(shapeToPathD('path', attrs({ d: 'M0 0' })), null, 'path');
    t.equal(shapeToPathD('image', attrs({})), null, 'image');
    t.equal(shapeToPathD('text', attrs({})), null, 'text');
    t.equal(shapeToPathD('rect', attrs({ x: 'a', y: 0, width: 1, height: 1 })), null, 'invalid number');
    t.end();
});

test('SHAPE_GEOMETRY_ATTRIBUTES lists the attributes the path replaces', (t) => {
    t.deepEqual(SHAPE_GEOMETRY_ATTRIBUTES.rect, ['x', 'y', 'width', 'height', 'rx', 'ry'], 'rect');
    t.deepEqual(SHAPE_GEOMETRY_ATTRIBUTES.line, ['x1', 'y1', 'x2', 'y2'], 'line');
    t.end();
});

test('openPathState tells open paths and whether ends can be joined', (t) => {
    t.deepEqual(openPathState('M0 0 L10 0 L10 10 Z'), { open: false, canJoin: false }, 'closed');
    t.deepEqual(openPathState('M0 0 L10 0 L10 10'), { open: true, canJoin: false }, 'open, ends far apart');
    t.deepEqual(openPathState('M0 0 L10 0 L10 10 L0.5 0.5', 1), { open: true, canJoin: true }, 'ends within 1 mm');
    // pen tool output: closed polygon drawn as segments is not open
    t.deepEqual(openPathState('M 0 0 L 10 0 Z M 10 0 L 10 10 Z M 10 10 L 0 0 Z'), { open: false, canJoin: false }, 'pen closed');
    t.deepEqual(openPathState('M 0 0 L 10 0 Z M 10 0 L 10 10 Z'), { open: true, canJoin: false }, 'pen open');
    t.deepEqual(openPathState(''), { open: false, canJoin: false }, 'empty');
    t.end();
});

test('closePathD closes every open subpath', (t) => {
    t.equal(closePathD('M0 0 L10 0 L10 10'), 'M0 0 L10 0 L10 10 Z', 'closed with a straight segment');
    t.equal(closePathD('M 0 0 L 10 0 Z M 10 0 L 10 10 Z'), 'M0 0 L10 0 L10 10 Z', 'pen path chained and closed');
    t.equal(closePathD('M0 0 L10 0 L10 10 Z'), null, 'nothing to close');
    t.end();
});

test('joinPathEndsD merges ends within tolerance', (t) => {
    t.equal(joinPathEndsD('M0 0 L10 0 L10 10 L0 1', 1), 'M0 0.5 L10 0 L10 10 Z', 'ends meet in the middle');
    t.equal(joinPathEndsD('M0 0 L10 0 L10 10 L0 2', 1), null, 'too far apart');
    t.end();
});
