/**
 * Pure geometry for Combine (weld, subtract, intersect) and Offset (no DOM).
 *
 * Shapes are flattened to polygons in canvas units (mm) with a fine tolerance and handed to the
 * vendored ClipperLib (src/shared/lib/clipper). Results are polygons, written back as path data with
 * straight segments; at FLATTEN_TOLERANCE the curves look smooth and cut like the original.
 *
 * ClipperLib is called here directly (with the same integer scaling idea as cLipper-adapter.js) because
 * the adapter uses even-odd filling for every operand, scales the miter limit by its integer scale and
 * returns nothing when one operand is empty; Combine needs per-operand filling and clean orientations.
 */
import * as ClipperLib from '../../../../shared/lib/clipper/clipper';
import { getSegment, parsePath, PathData, segmentCount, serializePath } from '../path-edit/path-geometry';
import { normalizePenPath } from '../path-edit/point-edit';
import { shapeToPathD } from '../path-edit/shape-to-path';

export interface Pt {
    x: number;
    y: number;
}

/** Flattened shape: closed polygons (areas) and open polylines. Polygons do not repeat their start. */
export interface Outline {
    closed: Pt[][];
    open: Pt[][];
}

/** Affine matrix [a, b, c, d, e, f] like SVGMatrix. */
export type Matrix = [number, number, number, number, number, number];

export type OffsetSide = 'outside' | 'inside' | 'both';
export type OffsetCorners = 'round' | 'sharp' | 'chamfer';

// largest distance between a curve and its flattened polyline, mm
export const FLATTEN_TOLERANCE = 0.02;
// integer scale for ClipperLib: 1e-5 mm resolution
const SCALE = 1e5;
// round corners and offsets: largest distance of the arc points from the true arc, mm
const ARC_TOLERANCE = 0.01;
// sharp corners: longer spikes than this (times the distance) are cut off
const MITER_LIMIT = 4;
// polygons smaller than this (mm²) are left out of results
const MIN_AREA = 1e-6;

type IntPath = { X: number; Y: number }[];

const applyMatrix = (m: Matrix, p: Pt): Pt => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const samePoint = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

function transformPathData(path: PathData, m: Matrix): PathData {
    const map = (p: Pt | null) => (p ? applyMatrix(m, p) : null);
    return path.map(sub => ({
        closed: sub.closed,
        nodes: sub.nodes.map(n => ({ ...applyMatrix(m, n), in: map(n.in), out: map(n.out) })),
    }));
}

// drops a last point equal to the first one
function dropRepeatedEnd(points: Pt[]): Pt[] {
    if (points.length > 1 && samePoint(points[0], points[points.length - 1])) {
        return points.slice(0, -1);
    }
    return points;
}

/** Flattens path data: straight segments stay, cubic béziers are split so they stay within tol. */
export function flattenPath(path: PathData, tol: number = FLATTEN_TOLERANCE): Outline {
    const outline: Outline = { closed: [], open: [] };
    for (const sub of path) {
        if (sub.nodes.length === 0) {
            continue;
        }
        const points: Pt[] = [{ x: sub.nodes[0].x, y: sub.nodes[0].y }];
        for (let i = 0; i < segmentCount(sub); i++) {
            const seg = getSegment(sub, i);
            if (!seg.c1) {
                points.push(seg.to);
                continue;
            }
            // uniform steps: the error is at most max|B''| / (8 n²), max|B''| <= 6 · the larger second difference
            const p0 = seg.from;
            const p1 = seg.c1;
            const p2 = seg.c2;
            const p3 = seg.to;
            const dd = Math.max(
                Math.hypot(p0.x - 2 * p1.x + p2.x, p0.y - 2 * p1.y + p2.y),
                Math.hypot(p1.x - 2 * p2.x + p3.x, p1.y - 2 * p2.y + p3.y)
            );
            const n = Math.max(1, Math.min(1000, Math.ceil(Math.sqrt((0.75 * dd) / tol))));
            for (let k = 1; k <= n; k++) {
                const t = k / n;
                const u = 1 - t;
                points.push({
                    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
                    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
                });
            }
        }
        const clean = sub.closed ? dropRepeatedEnd(points) : points;
        if (sub.closed && clean.length >= 3) {
            outline.closed.push(clean);
        } else if (clean.length >= 2) {
            // a closed subpath with two points (pen tool line) is a line, not an area
            outline.open.push(sub.closed ? dropRepeatedEnd(points) : clean);
        }
    }
    return outline;
}

/** Outline of path data `d`, pen tool format chained first, then transformed by the matrix. */
export function outlineFromD(d: string, matrix: Matrix | null = null, tol: number = FLATTEN_TOLERANCE): Outline {
    let path = normalizePenPath(parsePath(d || ''));
    if (matrix) {
        path = transformPathData(path, matrix);
    }
    return flattenPath(path, tol);
}

function roundedRectD(x: number, y: number, w: number, h: number, rxIn: number, ryIn: number): string {
    const rx = Math.min(rxIn, w / 2);
    const ry = Math.min(ryIn, h / 2);
    return `M${x + rx} ${y} H${x + w - rx} A${rx} ${ry} 0 0 1 ${x + w} ${y + ry} V${y + h - ry} `
        + `A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h} H${x + rx} A${rx} ${ry} 0 0 1 ${x} ${y + h - ry} `
        + `V${y + ry} A${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`;
}

/** Path data of a draw tool element (path, rect also with rounded corners, ellipse, circle, line); null for others. */
export function elementD(tagName: string, getAttribute: (name: string) => string | null): string | null {
    if (tagName === 'path') {
        return getAttribute('d') || null;
    }
    if (tagName === 'rect') {
        const num = (name: string) => Number(getAttribute(name)) || 0;
        let rx = num('rx');
        let ry = num('ry');
        if (rx > 0 || ry > 0) {
            // one radius given: both are the same (SVG rule)
            rx = rx > 0 ? rx : ry;
            ry = ry > 0 ? ry : rx;
            const w = num('width');
            const h = num('height');
            return w > 0 && h > 0 ? roundedRectD(num('x'), num('y'), w, h, rx, ry) : null;
        }
    }
    return shapeToPathD(tagName, getAttribute);
}

/** Maps viewBox coordinates into the box like SVG does for preserveAspectRatio (default xMidYMid meet). */
export function viewBoxMatrix(
    viewBox: number[],
    box: { x: number; y: number; width: number; height: number },
    preserveAspectRatio: string | null
): Matrix {
    const [vx, vy, vw, vh] = viewBox;
    let sx = box.width / vw;
    let sy = box.height / vh;
    const par = (preserveAspectRatio || '').trim().split(/\s+/);
    const align = par[0] || 'xMidYMid';
    if (align !== 'none') {
        const s = par[1] === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
        sx = s;
        sy = s;
    }
    let tx = box.x - vx * sx;
    let ty = box.y - vy * sy;
    if (align !== 'none') {
        const freeX = box.width - vw * sx;
        const freeY = box.height - vh * sy;
        if (align.includes('xMid')) {
            tx += freeX / 2;
        } else if (align.includes('xMax')) {
            tx += freeX;
        }
        if (align.includes('YMid')) {
            ty += freeY / 2;
        } else if (align.includes('YMax')) {
            ty += freeY;
        }
    }
    return [sx, 0, 0, sy, tx, ty];
}

/** Outline of polylines from the SVG parser (points as [x, y]), transformed by the matrix. */
export function outlineFromPolylines(paths: { closed: boolean; points: number[][] }[], matrix: Matrix): Outline {
    const outline: Outline = { closed: [], open: [] };
    for (const path of paths) {
        const points = dropRepeatedEnd(path.points.map(p => applyMatrix(matrix, { x: p[0], y: p[1] })));
        if (path.closed && points.length >= 3) {
            outline.closed.push(points);
        } else if (points.length >= 2) {
            outline.open.push(points);
        }
    }
    return outline;
}

export function mergeOutlines(outlines: Outline[]): Outline {
    return {
        closed: outlines.reduce((all, o) => all.concat(o.closed), [] as Pt[][]),
        open: outlines.reduce((all, o) => all.concat(o.open), [] as Pt[][]),
    };
}

export function outlineIsEmpty(o: Outline): boolean {
    return o.closed.length === 0 && o.open.length === 0;
}

// ---- ClipperLib ----

// polygons are moved next to the origin while clipping, so large canvas coordinates keep their precision
function centreOf(polys: Pt[][]): Pt {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const poly of polys) {
        for (const p of poly) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
    }
    return Number.isFinite(minX) ? { x: Math.round((minX + maxX) / 2), y: Math.round((minY + maxY) / 2) } : { x: 0, y: 0 };
}

const toInt = (polys: Pt[][], c: Pt): IntPath[] => polys.map(poly => poly.map(p => ({
    X: Math.round((p.x - c.x) * SCALE),
    Y: Math.round((p.y - c.y) * SCALE),
})));

const intArea = (path: IntPath) => Math.abs(ClipperLib.Clipper.Area(path)) / (SCALE * SCALE);

const fromInt = (paths: IntPath[], c: Pt): Pt[][] => paths
    .filter(path => path.length >= 3 && intArea(path) > MIN_AREA)
    .map(path => path.map(p => ({ x: p.X / SCALE + c.x, y: p.Y / SCALE + c.y })));

function execute(clipType: number, subject: IntPath[], clip: IntPath[], subjectFill: number, clipFill: number): IntPath[] {
    const clipper = new ClipperLib.Clipper();
    clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
    if (clip.length) {
        clipper.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
    }
    const solution: IntPath[] = [];
    clipper.Execute(clipType, solution, subjectFill, clipFill);
    return solution;
}

const EVEN_ODD = ClipperLib.PolyFillType.pftEvenOdd;
const NON_ZERO = ClipperLib.PolyFillType.pftNonZero;

// the area of one shape: subpaths inside other subpaths are holes (even-odd), outer outlines and holes get opposite turns
function normalize(polys: IntPath[]): IntPath[] {
    return polys.length ? execute(ClipperLib.ClipType.ctUnion, polys, [], EVEN_ODD, EVEN_ODD) : [];
}

function unionAll(operands: IntPath[][]): IntPath[] {
    const all = operands.reduce((list, polys) => list.concat(polys), [] as IntPath[]);
    return all.length ? execute(ClipperLib.ClipType.ctUnion, all, [], NON_ZERO, NON_ZERO) : [];
}

/** Union of the areas of all outlines (open parts are ignored). */
export function weld(outlines: Outline[]): Pt[][] {
    const c = centreOf(outlines.reduce((all, o) => all.concat(o.closed), [] as Pt[][]));
    return fromInt(unionAll(outlines.map(o => normalize(toInt(o.closed, c)))), c);
}

/** The area of base minus the areas of all cutters. */
export function subtract(base: Outline, cutters: Outline[]): Pt[][] {
    const c = centreOf(base.closed);
    const subject = normalize(toInt(base.closed, c));
    const clip = unionAll(cutters.map(o => normalize(toInt(o.closed, c))));
    if (!subject.length) {
        return [];
    }
    return fromInt(execute(ClipperLib.ClipType.ctDifference, subject, clip, NON_ZERO, NON_ZERO), c);
}

/** The area covered by every outline. */
export function intersect(outlines: Outline[]): Pt[][] {
    if (outlines.length === 0) {
        return [];
    }
    const c = centreOf(outlines[0].closed);
    let result = normalize(toInt(outlines[0].closed, c));
    for (let i = 1; i < outlines.length && result.length; i++) {
        result = execute(ClipperLib.ClipType.ctIntersection, result, normalize(toInt(outlines[i].closed, c)), NON_ZERO, NON_ZERO);
    }
    return fromInt(result, c);
}

const JOIN_TYPES: Record<OffsetCorners, number> = {
    round: ClipperLib.JoinType.jtRound,
    sharp: ClipperLib.JoinType.jtMiter,
    chamfer: ClipperLib.JoinType.jtSquare,
};
// ends of open paths, matching the corner type
const END_TYPES: Record<OffsetCorners, number> = {
    round: ClipperLib.EndType.etOpenRound,
    sharp: ClipperLib.EndType.etOpenSquare,
    chamfer: ClipperLib.EndType.etOpenButt,
};

function clipperOffset(paths: IntPath[], delta: number, joinType: number, endType: number): IntPath[] {
    if (!paths.length) {
        return [];
    }
    const offset = new ClipperLib.ClipperOffset(MITER_LIMIT, ARC_TOLERANCE * SCALE);
    offset.AddPaths(paths, joinType, endType);
    const solution: IntPath[] = [];
    offset.Execute(solution, delta * SCALE);
    return solution;
}

/**
 * Parallel outlines at the distance. Closed areas grow (outside) and / or shrink (inside); open
 * polylines get an outline around them, on any side (they have no inside).
 */
export function offsetOutline(outline: Outline, distance: number, side: OffsetSide, corners: OffsetCorners): { outside: Pt[][]; inside: Pt[][] } {
    const c = centreOf(outline.closed.concat(outline.open));
    const area = normalize(toInt(outline.closed, c));
    const join = JOIN_TYPES[corners];
    let outside: IntPath[] = [];
    let inside: IntPath[] = [];
    if (side !== 'inside') {
        outside = clipperOffset(area, distance, join, ClipperLib.EndType.etClosedPolygon);
    }
    if (side !== 'outside') {
        inside = clipperOffset(area, -distance, join, ClipperLib.EndType.etClosedPolygon);
    }
    const lines = toInt(outline.open, c);
    if (lines.length) {
        outside = unionAll([outside, clipperOffset(lines, distance, join, END_TYPES[corners])]);
    }
    return { outside: fromInt(outside, c), inside: fromInt(inside, c) };
}

// ---- results ----

/** Area of polygons, holes (opposite turn) counted negative. */
export function polygonsArea(polys: Pt[][]): number {
    let sum = 0;
    for (const poly of polys) {
        let a = 0;
        for (let i = 0; i < poly.length; i++) {
            const p = poly[i];
            const q = poly[(i + 1) % poly.length];
            a += p.x * q.y - q.x * p.y;
        }
        sum += a / 2;
    }
    return Math.abs(sum);
}

/** Closed path data with straight segments, one subpath per polygon. */
export function polygonsToD(polys: Pt[][]): string {
    const path: PathData = polys
        .map(dropRepeatedEnd)
        .filter(poly => poly.length >= 2)
        .map(poly => ({ closed: true, nodes: poly.map(p => ({ x: p.x, y: p.y, in: null, out: null })) }));
    return serializePath(path);
}

/**
 * Members of an operation after a combine: the result takes the place of the bottom input; the other
 * inputs leave; an operation that would become empty keeps the result instead.
 */
export function combineMembership(memberIds: string[], inputIds: string[], bottomId: string, resultId: string): string[] {
    if (!memberIds.some(id => inputIds.includes(id))) {
        return memberIds.slice();
    }
    const others = memberIds.filter(id => !inputIds.includes(id));
    if (memberIds.includes(bottomId)) {
        return memberIds.filter(id => id === bottomId || !inputIds.includes(id)).map(id => (id === bottomId ? resultId : id));
    }
    if (others.length === 0) {
        return [resultId];
    }
    return others;
}
