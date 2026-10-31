/**
 * Measuring an object by clicking it (pure, no DOM): distance to outlines for hovering and
 * the values and dimension lines of a line, path, circle, ellipse, rectangle or imported SVG.
 *
 * Shapes are given in element coordinates with the matrix from element to canvas coordinates
 * (1 canvas unit = 1 mm), so scale and rotation of the model are honoured.
 */
import { getSegment, PathData, pointOnSegment, segmentCount } from '../path-edit/path-geometry';
import { normalizePenPath } from '../path-edit/point-edit';
import { formatMm, geometryRows, pathLength } from './geometry-length';
import { Box, measureInfo, Point } from './measure-math';

// a b c d e f, like SVG matrix(...)
export type Matrix6 = number[];

export interface Polyline {
    closed: boolean;
    points: Point[];
}

export interface PickCandidate {
    id: string;
    outlines: Polyline[];
    // outline bounds, computed when missing
    bounds?: Box | null;
}

export type ShapeSpec =
    | { type: 'path'; path: PathData; matrix: Matrix6 }
    | { type: 'line'; x1: number; y1: number; x2: number; y2: number; matrix: Matrix6 }
    | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number; matrix: Matrix6 }
    | { type: 'rect'; x: number; y: number; width: number; height: number; radius: number; matrix: Matrix6 }
    | { type: 'svg'; x: number; y: number; width: number; height: number; length: number | null; matrix: Matrix6 };

export type MeasureKind = 'line' | 'path' | 'closed' | 'circle' | 'ellipse' | 'rect' | 'svg';

export type DimKey = 'width' | 'height' | 'radius' | 'diameter';

// a dimension line in canvas coordinates; its value is shown at the middle
export interface Dim {
    key: DimKey;
    value: number;
    from: Point;
    to: Point;
    // end ticks (dimension lines outside the shape); a radius line has none
    ticks: boolean;
}

export interface MeasureValues {
    length?: number | null;
    dx?: number;
    dy?: number;
    angle?: number;
    radius?: number;
    diameter?: number;
    circumference?: number;
    perimeter?: number;
    width?: number;
    height?: number;
    cornerRadius?: number;
}

export interface ObjectMeasurement {
    kind: MeasureKind;
    values: MeasureValues;
    // the shape outline in canvas coordinates (highlighted)
    outline: Polyline[];
    dims: Dim[];
    // marked points: end points of a line or path, centre of a circle
    points: Point[];
}

// distance of the dimension lines from the shape, in screen pixels
const DIM_OFFSET_PX = 14;
const IDENTITY: Matrix6 = [1, 0, 0, 1, 0, 0];
// room for the value label of a dimension line, in screen pixels
const LABEL_HALF_WIDTH_PX = 30;
const LABEL_HALF_HEIGHT_PX = 12;

export const transform = (m: Matrix6, p: Point): Point => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

// ---- outlines ----

export function flattenPath(path: PathData, matrix: Matrix6 = IDENTITY, pieces: number = 16): Polyline[] {
    const result: Polyline[] = [];
    for (const sub of path) {
        if (sub.nodes.length === 0) {
            continue;
        }
        const points: Point[] = [transform(matrix, sub.nodes[0])];
        const count = segmentCount(sub);
        for (let i = 0; i < count; i++) {
            const seg = getSegment(sub, i);
            const closing = sub.closed && i === count - 1;
            if (!seg.c1) {
                // the closing segment of a closed outline is implicit
                if (!closing) {
                    points.push(transform(matrix, seg.to));
                }
                continue;
            }
            const last = closing ? pieces - 1 : pieces;
            for (let k = 1; k <= last; k++) {
                points.push(transform(matrix, pointOnSegment(seg, k / pieces)));
            }
        }
        result.push({ closed: sub.closed, points });
    }
    return result;
}

export function outlineBounds(lines: Polyline[]): Box | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const line of lines) {
        for (const p of line.points) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
    }
    if (minX === Infinity) {
        return null;
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

export function distanceToOutline(lines: Polyline[], p: Point): number {
    let best = Infinity;
    for (const { closed, points } of lines) {
        if (points.length === 1) {
            best = Math.min(best, Math.hypot(p.x - points[0].x, p.y - points[0].y));
        }
        for (let i = 1; i < points.length; i++) {
            best = Math.min(best, distanceToSegment(p, points[i - 1], points[i]));
        }
        if (closed && points.length > 2) {
            best = Math.min(best, distanceToSegment(p, points[points.length - 1], points[0]));
        }
    }
    return best;
}

// even-odd rule over the closed outlines
export function insideOutline(lines: Polyline[], p: Point): boolean {
    let inside = false;
    for (const { closed, points } of lines) {
        if (!closed) {
            continue;
        }
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const a = points[i];
            const b = points[j];
            if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
                inside = !inside;
            }
        }
    }
    return inside;
}

/**
 * The object under p: the nearest outline within tolerance (on equal distance the later, top-most one).
 * Without one, a closed shape not larger than fillSize that contains p (the smallest).
 */
export function pickObject(candidates: PickCandidate[], p: Point, tolerance: number, fillSize: number): string | null {
    let best: string | null = null;
    let bestDistance = tolerance;
    let filled: string | null = null;
    let filledArea = Infinity;
    for (const c of candidates) {
        const b = c.bounds === undefined ? outlineBounds(c.outlines) : c.bounds;
        if (!b || p.x < b.x - tolerance || p.x > b.x + b.width + tolerance || p.y < b.y - tolerance || p.y > b.y + b.height + tolerance) {
            continue;
        }
        const d = distanceToOutline(c.outlines, p);
        if (d <= bestDistance) {
            best = c.id;
            bestDistance = d;
        }
        if (Math.max(b.width, b.height) <= fillSize && b.width * b.height <= filledArea && insideOutline(c.outlines, p)) {
            filled = c.id;
            filledArea = b.width * b.height;
        }
    }
    return best ?? filled;
}

// ---- measurements ----

const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Point): number => Math.hypot(v.x, v.y);
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const linear = (m: Matrix6, v: Point): Point => ({ x: m[0] * v.x + m[2] * v.y, y: m[1] * v.x + m[3] * v.y });

// one edge of a box moved outwards (away from centre) by offset
function outsideEdge(a: Point, b: Point, centre: Point, offset: number): { from: Point; to: Point } {
    const d = sub(b, a);
    const l = len(d) || 1;
    let n = { x: -d.y / l, y: d.x / l };
    const m = mid(a, b);
    if ((m.x - centre.x) * n.x + (m.y - centre.y) * n.y < 0) {
        n = { x: -n.x, y: -n.y };
    }
    return { from: { x: a.x + n.x * offset, y: a.y + n.y * offset }, to: { x: b.x + n.x * offset, y: b.y + n.y * offset } };
}

// distance of the dimension lines and the visible part of the canvas (a line outside it moves to the other side)
interface DimLayout {
    offset: number;
    px: number;
    view: Box | null;
}

// the first edge whose dimension line and its value label lie in the view, else the first
function fittingEdge(edges: Point[][], centre: Point, layout: DimLayout): { from: Point; to: Point } {
    const { offset, px, view } = layout;
    const lines = edges.map(e => outsideEdge(e[0], e[1], centre, offset));
    if (!view) {
        return lines[0];
    }
    const mx = LABEL_HALF_WIDTH_PX * px;
    const my = LABEL_HALF_HEIGHT_PX * px;
    const inView = (q: Point) => q.x >= view.x + mx && q.x <= view.x + view.width - mx && q.y >= view.y + my && q.y <= view.y + view.height - my;
    return lines.find(l => inView(l.from) && inView(l.to) && inView(mid(l.from, l.to))) || lines[0];
}

// width dimension over the upper of the two horizontal edges, height right of the right one (box in element coordinates)
function boxDims(box: Box, matrix: Matrix6, width: number, height: number, layout: DimLayout): Dim[] {
    const { x, y, width: w, height: h } = box;
    const c = (px: number, py: number) => transform(matrix, { x: px, y: py });
    const centre = c(x + w / 2, y + h / 2);
    const horizontal = [[c(x, y), c(x + w, y)], [c(x, y + h), c(x + w, y + h)]];
    const vertical = [[c(x + w, y), c(x + w, y + h)], [c(x, y), c(x, y + h)]];
    const top = mid(horizontal[0][0], horizontal[0][1]).y <= mid(horizontal[1][0], horizontal[1][1]).y ? horizontal : [horizontal[1], horizontal[0]];
    const right = mid(vertical[0][0], vertical[0][1]).x >= mid(vertical[1][0], vertical[1][1]).x ? vertical : [vertical[1], vertical[0]];
    return [
        { key: 'width', value: width, ...fittingEdge(top, centre, layout), ticks: true },
        { key: 'height', value: height, ...fittingEdge(right, centre, layout), ticks: true },
    ];
}

function rowValue(rows: { key: string; value: number }[], key: string): number | undefined {
    return rows.find(r => r.key === key)?.value;
}

function isStraightLine(path: PathData): boolean {
    return path.length === 1 && !path[0].closed && path[0].nodes.length === 2 && !(path[0].nodes[0].out && path[0].nodes[1].in);
}

function measurePath(path: PathData, matrix: Matrix6, layout: DimLayout): ObjectMeasurement {
    // pen tool segments are chained first, so each counts once
    const chained = normalizePenPath(path);
    const outline = flattenPath(chained, matrix);
    // lengths in canvas units: measure the path with the matrix applied
    const canvasPath: PathData = chained.map(s => ({
        closed: s.closed,
        nodes: s.nodes.map(n => ({
            ...transform(matrix, n),
            in: n.in ? transform(matrix, n.in) : null,
            out: n.out ? transform(matrix, n.out) : null,
        })),
    }));
    const length = pathLength(canvasPath);
    if (isStraightLine(canvasPath)) {
        const [a, b] = canvasPath[0].nodes;
        const info = measureInfo(a, b);
        return {
            kind: 'line',
            values: { length, dx: info.dx, dy: info.dy, angle: info.angle },
            outline,
            dims: [],
            points: [{ x: a.x, y: a.y }, { x: b.x, y: b.y }],
        };
    }
    if (canvasPath.length > 0 && canvasPath.every(s => s.closed)) {
        const b = outlineBounds(outline) || { x: 0, y: 0, width: 0, height: 0 };
        return {
            kind: 'closed',
            values: { perimeter: length, width: b.width, height: b.height },
            outline,
            dims: boxDims(b, IDENTITY, b.width, b.height, layout),
            points: [],
        };
    }
    const ends: Point[] = [];
    for (const s of canvasPath) {
        if (!s.closed && s.nodes.length > 1) {
            ends.push({ x: s.nodes[0].x, y: s.nodes[0].y }, { x: s.nodes[s.nodes.length - 1].x, y: s.nodes[s.nodes.length - 1].y });
        }
    }
    return { kind: 'path', values: { length }, outline, dims: [], points: ends };
}

function ellipseOutline(cx: number, cy: number, rx: number, ry: number, matrix: Matrix6, steps: number = 72): Polyline[] {
    const points: Point[] = [];
    for (let i = 0; i < steps; i++) {
        const a = (2 * Math.PI * i) / steps;
        points.push(transform(matrix, { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }));
    }
    return [{ closed: true, points }];
}

export function boxOutline(box: Box, matrix: Matrix6): Polyline[] {
    const { x, y, width: w, height: h } = box;
    return [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map(p => transform(matrix, p)) }];
}

/**
 * Values and graphics of one shape. px is the size of a screen pixel in canvas units
 * (dimension lines keep a fixed distance on the screen). view is the visible part of the canvas: a dimension line
 * that would leave it is drawn on the other side of the shape.
 */
export function measureObject(spec: ShapeSpec, px: number, view: Box | null = null): ObjectMeasurement {
    const layout: DimLayout = { offset: DIM_OFFSET_PX * px, px, view };
    const m = spec.matrix;
    switch (spec.type) {
        case 'path':
            return measurePath(spec.path, m, layout);
        case 'line':
            return measurePath([{
                closed: false,
                nodes: [{ x: spec.x1, y: spec.y1, in: null, out: null }, { x: spec.x2, y: spec.y2, in: null, out: null }],
            }], m, layout);
        case 'ellipse': {
            const { cx, cy } = spec;
            const rx = Math.abs(spec.rx);
            const ry = Math.abs(spec.ry);
            const width = len(linear(m, { x: 2 * rx, y: 0 }));
            const height = len(linear(m, { x: 0, y: 2 * ry }));
            const outline = ellipseOutline(cx, cy, rx, ry, m);
            const centre = transform(m, { x: cx, y: cy });
            if (Math.abs(width - height) < 1e-6 * Math.max(1, width)) {
                const rows = geometryRows({ kind: 'circle', width, height });
                const radius = width / 2;
                // radius up to the right, the diameter as a dimension line below the circle
                const dir = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };
                const below = fittingEdge([
                    [{ x: centre.x - radius, y: centre.y + radius }, { x: centre.x + radius, y: centre.y + radius }],
                    [{ x: centre.x - radius, y: centre.y - radius }, { x: centre.x + radius, y: centre.y - radius }],
                ], centre, layout);
                return {
                    kind: 'circle',
                    values: { radius, diameter: width, circumference: rowValue(rows, 'circumference') },
                    outline,
                    dims: [
                        { key: 'radius', value: radius, from: centre, to: { x: centre.x + dir.x * radius, y: centre.y + dir.y * radius }, ticks: false },
                        { key: 'diameter', value: width, ...below, ticks: true },
                    ],
                    points: [centre],
                };
            }
            const rows = geometryRows({ kind: 'ellipse', width, height });
            return {
                kind: 'ellipse',
                values: { circumference: rowValue(rows, 'circumference'), width, height },
                outline,
                dims: boxDims({ x: cx - rx, y: cy - ry, width: 2 * rx, height: 2 * ry }, m, width, height, layout),
                points: [],
            };
        }
        case 'rect': {
            const box = { x: spec.x, y: spec.y, width: spec.width, height: spec.height };
            const width = len(linear(m, { x: spec.width, y: 0 }));
            const height = len(linear(m, { x: 0, y: spec.height }));
            // the corner radius scales with the shape (uniformly)
            const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
            const cornerRadius = Math.max(0, spec.radius || 0) * scale;
            const rows = geometryRows({ kind: 'rect', width, height, radius: cornerRadius });
            const values: MeasureValues = { perimeter: rowValue(rows, 'perimeter'), width, height };
            if (cornerRadius > 0) {
                values.cornerRadius = cornerRadius;
            }
            return { kind: 'rect', values, outline: boxOutline(box, m), dims: boxDims(box, m, width, height, layout), points: [] };
        }
        case 'svg':
        default: {
            const s = spec as Extract<ShapeSpec, { type: 'svg' }>;
            const box = { x: s.x, y: s.y, width: s.width, height: s.height };
            const width = len(linear(m, { x: s.width, y: 0 }));
            const height = len(linear(m, { x: 0, y: s.height }));
            return {
                kind: 'svg',
                values: { length: s.length, width, height },
                outline: boxOutline(box, m),
                dims: boxDims(box, m, width, height, layout),
                points: [],
            };
        }
    }
}

// ---- text ----

type Translate = (key: string) => string;

const mm = (v: number | null | undefined) => (v === null || v === undefined ? '…' : formatMm(v));

// label of a dimension line
export function formatDim(dim: Dim): string {
    if (dim.key === 'radius') {
        return `R ${formatMm(dim.value)}`;
    }
    if (dim.key === 'diameter') {
        return `Ø ${formatMm(dim.value)}`;
    }
    return formatMm(dim.value);
}

/**
 * Title and detail line of the label. t translates the words Length, Perimeter, Circumference, Width, Height.
 */
export function formatObjectMeasure(m: ObjectMeasurement, t: Translate): { title: string; details: string } {
    const v = m.values;
    const size = (extra: string = '') => `${t('Width')} ${mm(v.width)} · ${t('Height')} ${mm(v.height)}${extra} mm`;
    switch (m.kind) {
        case 'line':
            return {
                title: `${mm(v.length)} mm`,
                details: `Δx ${mm(v.dx)} · Δy ${mm(v.dy)} · ${mm(v.angle)}°`,
            };
        case 'path':
            return { title: `${t('Length')} ${mm(v.length)} mm`, details: '' };
        case 'circle':
            return { title: `R ${mm(v.radius)} mm · Ø ${mm(v.diameter)} mm`, details: `${t('Circumference')} ${mm(v.circumference)} mm` };
        case 'ellipse':
            return { title: `${t('Circumference')} ${mm(v.circumference)} mm`, details: size() };
        case 'rect':
            return { title: `${t('Perimeter')} ${mm(v.perimeter)} mm`, details: size(v.cornerRadius ? ` · R ${mm(v.cornerRadius)}` : '') };
        case 'closed':
            return { title: `${t('Perimeter')} ${mm(v.perimeter)} mm`, details: size() };
        case 'svg':
        default:
            return { title: `${t('Length')} ${mm(v.length)} mm`, details: size() };
    }
}
