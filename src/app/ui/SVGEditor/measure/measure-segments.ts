/**
 * Single parts ("segments") of an object for the measure tool (pure, no DOM).
 *
 * A segment is the piece between two nodes: a line, a curve, or a circular arc. Neighbouring curve pieces
 * that lie on one circle (an SVG arc split into cubics, a circle drawn as four cubics) are one arc segment;
 * a closed run around the whole circle is a circle. All points are in canvas coordinates (1 unit = 1 mm).
 */
import { getSegment, PathData, pointOnSegment, Segment, segmentCount } from '../path-edit/path-geometry';
import { normalizePenPath } from '../path-edit/point-edit';
import { formatMm, segmentLength } from './geometry-length';
import { Box, measureInfo, Point } from './measure-math';
import { distanceToOutline, Matrix6, outlineBounds, transform } from './measure-pick';

export interface ArcFit {
    centre: Point;
    radius: number;
    // degrees, always positive
    sweep: number;
}

export type SegmentKind = 'line' | 'curve' | 'arc';

export interface MeasureSegment {
    kind: SegmentKind;
    // the segment as a polyline (a line has its two end points)
    points: Point[];
    length: number;
    bounds: Box;
    // an arc run all around a closed outline (a circle)
    closed: boolean;
    arc: ArcFit | null;
}

export interface SegmentMeasurement {
    kind: 'line' | 'arc' | 'circle' | 'curve';
    length: number;
    points: Point[];
    from: Point;
    to: Point;
    // the point half way along the segment
    mid: Point;
    dx?: number;
    dy?: number;
    angle?: number;
    radius?: number;
    diameter?: number;
    sweep?: number;
    centre?: Point;
}

// SVGParser output with the node marks of the measure tool
export interface ParsedSegmentShape {
    visibility?: boolean;
    paths: { closed: boolean; points: number[][]; breaks?: number[]; kinds?: string[] }[];
}

// a piece between two nodes before arc runs are joined; 'arc' = known to be circular (SVG arc with rx = ry)
interface Piece {
    kind: SegmentKind;
    points: Point[];
    length: number;
}

interface PieceRun {
    closed: boolean;
    pieces: Piece[];
}

// points of a fitted arc may be this much (relative to the radius) off the circle
const ARC_TOLERANCE = 0.01;
// shorter bends are taken as curves (a nearly straight piece fits any huge circle)
const MIN_SWEEP = 3;
// a run of pieces not known to be circular needs this many points to tell a circle from another curve
const MIN_FIT_POINTS = 5;
// short lines on one circle (arcs exported as polylines) are an arc: at least this many lines,
// each spanning at most this angle of the circle (so polygons stay polygons)
const MIN_ARC_LINES = 3;
const MAX_LINE_ANGLE = 25;
const MAX_CHORD_RATIO = 4;
const CURVE_SAMPLES = 24;
const ARC_SAMPLES = 32;

const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

function polylineLength(points: Point[]): number {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
        length += dist(points[i - 1], points[i]);
    }
    return length;
}

// algebraic least squares circle (x² + y² + Dx + Ey + F = 0) around the mean point, null for collinear points
function leastSquaresCircle(points: Point[]): { centre: Point; radius: number } | null {
    const n = points.length;
    const mx = points.reduce((s, p) => s + p.x, 0) / n;
    const my = points.reduce((s, p) => s + p.y, 0) / n;
    let suu = 0;
    let svv = 0;
    let suv = 0;
    let suuu = 0;
    let svvv = 0;
    let suvv = 0;
    let svuu = 0;
    for (const p of points) {
        const u = p.x - mx;
        const v = p.y - my;
        suu += u * u;
        svv += v * v;
        suv += u * v;
        suuu += u * u * u;
        svvv += v * v * v;
        suvv += u * v * v;
        svuu += v * u * u;
    }
    const det = suu * svv - suv * suv;
    if (Math.abs(det) <= 1e-12 * (suu + svv) * (suu + svv)) {
        return null;
    }
    const bu = (suuu + suvv) / 2;
    const bv = (svvv + svuu) / 2;
    const uc = (bu * svv - bv * suv) / det;
    const vc = (bv * suu - bu * suv) / det;
    const centre = { x: uc + mx, y: vc + my };
    const radius = points.reduce((s, p) => s + dist(centre, p), 0) / n;
    return { centre, radius };
}

/**
 * The circular arc through the points, or null when they are not on one circle (within 1 % of the radius),
 * bend less than a few degrees or turn back.
 */
export function fitArc(points: Point[]): ArcFit | null {
    const n = points.length;
    if (n < 3) {
        return null;
    }
    const circle = leastSquaresCircle(points);
    if (!circle) {
        return null;
    }
    const { centre, radius } = circle;
    for (const p of points) {
        if (Math.abs(dist(centre, p) - radius) > ARC_TOLERANCE * radius) {
            return null;
        }
    }
    let sweep = 0;
    let sign = 0;
    for (let i = 1; i < n; i++) {
        const u = { x: points[i - 1].x - centre.x, y: points[i - 1].y - centre.y };
        const v = { x: points[i].x - centre.x, y: points[i].y - centre.y };
        const step = Math.atan2(u.x * v.y - u.y * v.x, u.x * v.x + u.y * v.y);
        if (Math.abs(step) < 1e-12) {
            continue;
        }
        if (sign !== 0 && Math.sign(step) !== sign) {
            return null;
        }
        sign = Math.sign(step);
        sweep += step;
    }
    const degrees = (Math.abs(sweep) * 180) / Math.PI;
    if (degrees < MIN_SWEEP || degrees > 360 + 1e-6) {
        return null;
    }
    return { centre, radius, sweep: degrees };
}

function makeSegment(kind: SegmentKind, points: Point[], length: number, closed: boolean = false, arc: ArcFit | null = null): MeasureSegment {
    return { kind, points, length, bounds: outlineBounds([{ closed: false, points }]) || { x: 0, y: 0, width: 0, height: 0 }, closed, arc };
}

const joinPoints = (a: Point[], b: Point[]) => a.concat(b.slice(1));

function runFit(points: Point[], allArcs: boolean, uniform: boolean): ArcFit | null {
    if (points.length < 3 || (!(allArcs && uniform) && points.length < MIN_FIT_POINTS)) {
        return null;
    }
    return fitArc(points);
}

// every line of the run spans a small angle of the circle, and the lines are of similar length
// (a long side next to the short lines of a rounded corner is no part of the corner)
function shortChords(lines: Piece[], fit: ArcFit): boolean {
    const limit = 2 * fit.radius * Math.sin((MAX_LINE_ANGLE * Math.PI) / 360);
    const lengths = lines.map(l => l.length);
    return lengths.every(l => l <= limit) && Math.max(...lengths) <= MAX_CHORD_RATIO * Math.min(...lengths);
}

// the longest run of short lines from start that lie on one circle, null for fewer than MIN_ARC_LINES
function lineArc(pieces: Piece[], start: number): { points: Point[]; length: number; fit: ArcFit; end: number } | null {
    let end = start + MIN_ARC_LINES;
    if (end > pieces.length || pieces.slice(start, end).some(p => p.kind !== 'line')) {
        return null;
    }
    let points = pieces.slice(start, end).reduce((all, p, k) => (k === 0 ? p.points : joinPoints(all, p.points)), [] as Point[]);
    let fit = fitArc(points);
    if (!fit || !shortChords(pieces.slice(start, end), fit)) {
        return null;
    }
    while (end < pieces.length && pieces[end].kind === 'line') {
        const nextPoints = joinPoints(points, pieces[end].points);
        const nextFit = fitArc(nextPoints);
        if (!nextFit || !shortChords(pieces.slice(start, end + 1), nextFit)) {
            break;
        }
        points = nextPoints;
        fit = nextFit;
        end++;
    }
    const length = pieces.slice(start, end).reduce((sum, p) => sum + p.length, 0);
    return { points, length, fit, end };
}

/**
 * Segments of outlines given as pieces: lines stay single, neighbouring curve pieces on one circle become an arc.
 * uniform: the outline is not stretched, so pieces known to be circular stay circular even with few points.
 */
function buildSegments(runs: PieceRun[], uniform: boolean): MeasureSegment[] {
    const result: MeasureSegment[] = [];
    for (const run of runs) {
        const pieces = run.pieces.filter(p => p.length > 1e-9 && p.points.length >= 2);
        const segments: { seg: MeasureSegment; arcs: boolean }[] = [];
        let i = 0;
        while (i < pieces.length) {
            const first = pieces[i];
            if (first.kind === 'line') {
                const lineRun = lineArc(pieces, i);
                if (lineRun) {
                    const closed = run.closed && i === 0 && lineRun.end === pieces.length;
                    segments.push({ seg: makeSegment('arc', lineRun.points, lineRun.length, closed, lineRun.fit), arcs: false });
                    i = lineRun.end;
                    continue;
                }
                segments.push({ seg: makeSegment('line', first.points, first.length), arcs: false });
                i++;
                continue;
            }
            let points = first.points;
            let length = first.length;
            let allArcs = first.kind === 'arc';
            let fit = runFit(points, allArcs, uniform);
            let j = i + 1;
            while (fit && j < pieces.length && pieces[j].kind !== 'line') {
                const nextPoints = joinPoints(points, pieces[j].points);
                const nextArcs = allArcs && pieces[j].kind === 'arc';
                const nextFit = runFit(nextPoints, nextArcs, uniform);
                if (!nextFit) {
                    break;
                }
                points = nextPoints;
                length += pieces[j].length;
                allArcs = nextArcs;
                fit = nextFit;
                j++;
            }
            const closed = run.closed && i === 0 && j === pieces.length && !!fit;
            segments.push({ seg: makeSegment(fit ? 'arc' : 'curve', points, length, closed, fit), arcs: allArcs });
            i = j;
        }
        // an arc across the start of a closed outline
        if (run.closed && segments.length > 1) {
            const head = segments[0];
            const tail = segments[segments.length - 1];
            if (head.seg.kind === 'arc' && tail.seg.kind === 'arc') {
                const points = joinPoints(tail.seg.points, head.seg.points);
                const fit = runFit(points, head.arcs && tail.arcs, uniform);
                if (fit) {
                    const closed = segments.length === 2;
                    segments.splice(segments.length - 1, 1);
                    segments[0] = { seg: makeSegment('arc', points, head.seg.length + tail.seg.length, closed, fit), arcs: head.arcs && tail.arcs };
                }
            }
        }
        result.push(...segments.map(s => s.seg));
    }
    return result;
}

// the linear part of the matrix keeps circles round (rotation, flip, uniform scale)
export function isUniform(m: Matrix6): boolean {
    const l1 = m[0] * m[0] + m[1] * m[1];
    const l2 = m[2] * m[2] + m[3] * m[3];
    const dot = m[0] * m[2] + m[1] * m[3];
    return Math.abs(l1 - l2) <= 1e-6 * Math.max(l1, l2) && Math.abs(dot) <= 1e-6 * Math.max(l1, l2);
}

/**
 * Segments of an editor path (element coordinates) with its matrix to the canvas.
 */
export function pathSegments(path: PathData, matrix: Matrix6): MeasureSegment[] {
    const runs: PieceRun[] = [];
    for (const sub of normalizePenPath(path)) {
        const pieces: Piece[] = [];
        const count = segmentCount(sub);
        for (let i = 0; i < count; i++) {
            const s = getSegment(sub, i);
            const seg: Segment = {
                from: transform(matrix, s.from),
                to: transform(matrix, s.to),
                c1: s.c1 ? transform(matrix, s.c1) : null,
                c2: s.c2 ? transform(matrix, s.c2) : null,
            };
            if (!seg.c1) {
                pieces.push({ kind: 'line', points: [seg.from, seg.to], length: dist(seg.from, seg.to) });
                continue;
            }
            const points: Point[] = [];
            for (let k = 0; k <= CURVE_SAMPLES; k++) {
                points.push(pointOnSegment(seg, k / CURVE_SAMPLES));
            }
            pieces.push({ kind: 'curve', points, length: segmentLength(seg) });
        }
        runs.push({ closed: sub.closed, pieces });
    }
    return buildSegments(runs, isUniform(matrix));
}

/**
 * Segments of a rectangle (element coordinates): its sides and, when rounded, its corner arcs.
 */
export function rectSegments(x: number, y: number, width: number, height: number, radius: number, matrix: Matrix6): MeasureSegment[] {
    const r = Math.max(0, Math.min(radius || 0, width / 2, height / 2));
    const line = (a: Point, b: Point): Piece => {
        const p = [transform(matrix, a), transform(matrix, b)];
        return { kind: 'line', points: p, length: dist(p[0], p[1]) };
    };
    const corner = (cx: number, cy: number, from: number): Piece => {
        const points: Point[] = [];
        for (let k = 0; k <= ARC_SAMPLES; k++) {
            const a = ((from + (90 * k) / ARC_SAMPLES) * Math.PI) / 180;
            points.push(transform(matrix, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }));
        }
        return { kind: 'arc', points, length: polylineLength(points) };
    };
    const pieces: Piece[] = [line({ x: x + r, y }, { x: x + width - r, y })];
    if (r > 0) {
        pieces.push(corner(x + width - r, y + r, -90));
    }
    pieces.push(line({ x: x + width, y: y + r }, { x: x + width, y: y + height - r }));
    if (r > 0) {
        pieces.push(corner(x + width - r, y + height - r, 0));
    }
    pieces.push(line({ x: x + width - r, y: y + height }, { x: x + r, y: y + height }));
    if (r > 0) {
        pieces.push(corner(x + r, y + height - r, 90));
    }
    pieces.push(line({ x, y: y + height - r }, { x, y: y + r }));
    if (r > 0) {
        pieces.push(corner(x + r, y + r, 180));
    }
    return buildSegments([{ closed: true, pieces }], isUniform(matrix));
}

/**
 * Segments of SVGParser shapes (curves already flattened), split at the node marks the parser records;
 * outlines without marks (polygons, polylines, text) split at every point. map takes a source point to the canvas.
 */
export function parsedSegments(shapes: ParsedSegmentShape[], map: (p: Point) => Point, uniform: boolean): MeasureSegment[] {
    const runs: PieceRun[] = [];
    const piece = (kind: SegmentKind, points: Point[]): Piece => ({ kind, points, length: polylineLength(points) });
    for (const shape of shapes) {
        if (shape.visibility === false) {
            continue;
        }
        for (const path of shape.paths) {
            const pts = path.points.map(([x, y]) => map({ x, y }));
            const pieces: Piece[] = [];
            let prev = 0;
            const breaks = path.breaks || [];
            for (let k = 0; k < breaks.length; k++) {
                const end = breaks[k];
                if (end <= prev || end >= pts.length) {
                    continue;
                }
                const kind = path.kinds?.[k];
                pieces.push(piece(kind === 'arc' || kind === 'curve' ? kind : 'line', pts.slice(prev, end + 1)));
                prev = end;
            }
            for (let k = prev + 1; k < pts.length; k++) {
                pieces.push(piece('line', [pts[k - 1], pts[k]]));
            }
            if (path.closed && pts.length > 2 && dist(pts[0], pts[pts.length - 1]) > 1e-9) {
                pieces.push(piece('line', [pts[pts.length - 1], pts[0]]));
            }
            runs.push({ closed: path.closed, pieces });
        }
    }
    return buildSegments(runs, uniform);
}

/**
 * Index of the segment nearest to p within tolerance, -1 for none (on equal distance the first).
 */
export function pickSegment(segments: MeasureSegment[], p: Point, tolerance: number): number {
    let best = -1;
    let bestDistance = tolerance;
    for (let i = 0; i < segments.length; i++) {
        const b = segments[i].bounds;
        if (p.x < b.x - bestDistance || p.x > b.x + b.width + bestDistance || p.y < b.y - bestDistance || p.y > b.y + b.height + bestDistance) {
            continue;
        }
        const d = distanceToOutline([{ closed: false, points: segments[i].points }], p);
        if (d < bestDistance || (best === -1 && d <= bestDistance)) {
            best = i;
            bestDistance = d;
        }
    }
    return best;
}

// the point at half the length of a polyline
function halfway(points: Point[]): Point {
    const half = polylineLength(points) / 2;
    let walked = 0;
    for (let i = 1; i < points.length; i++) {
        const step = dist(points[i - 1], points[i]);
        if (walked + step >= half && step > 0) {
            const t = (half - walked) / step;
            return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * t, y: points[i - 1].y + (points[i].y - points[i - 1].y) * t };
        }
        walked += step;
    }
    return { ...points[points.length - 1] };
}

function isStraight(points: Point[]): boolean {
    const a = points[0];
    const b = points[points.length - 1];
    const chord = dist(a, b);
    if (chord === 0) {
        return false;
    }
    const tolerance = Math.max(1e-9, 1e-4 * chord);
    return points.every(p => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / chord <= tolerance);
}

/**
 * Values of one segment: a line with Δx, Δy and angle, an arc with radius and sweep, a circle, or a curve.
 */
export function measureSegment(seg: MeasureSegment): SegmentMeasurement {
    const { points, length } = seg;
    const from = points[0];
    const to = points[points.length - 1];
    const base = { length, points, from, to, mid: halfway(points) };
    if (seg.kind === 'line' || (seg.kind === 'curve' && isStraight(points))) {
        const info = measureInfo(from, to);
        return { ...base, kind: 'line', dx: info.dx, dy: info.dy, angle: info.angle };
    }
    if (seg.kind === 'arc' && seg.arc) {
        const { centre, radius, sweep } = seg.arc;
        if (seg.closed) {
            return { ...base, kind: 'circle', radius, diameter: 2 * radius, centre };
        }
        return { ...base, kind: 'arc', radius, sweep, centre };
    }
    return { ...base, kind: 'curve' };
}

type Translate = (key: string) => string;

/**
 * Title and detail line of a segment label. t translates the words Arc, Length and Circumference.
 */
export function formatSegmentMeasure(m: SegmentMeasurement, t: Translate): { title: string; details: string } {
    switch (m.kind) {
        case 'line':
            return { title: `${formatMm(m.length)} mm`, details: `Δx ${formatMm(m.dx)} · Δy ${formatMm(m.dy)} · ${formatMm(m.angle)}°` };
        case 'arc':
            return { title: `${t('Arc')} ${formatMm(m.length)} mm`, details: `R ${formatMm(m.radius)} mm · ${formatMm(m.sweep)}°` };
        case 'circle':
            return { title: `R ${formatMm(m.radius)} mm · Ø ${formatMm(m.diameter)} mm`, details: `${t('Circumference')} ${formatMm(m.length)} mm` };
        case 'curve':
        default:
            return { title: `${t('Length')} ${formatMm(m.length)} mm`, details: '' };
    }
}

/**
 * Label of several segments added up (Shift+click). t translates the word segments.
 */
export function formatSegmentSum(ms: SegmentMeasurement[], t: Translate): { title: string; details: string } {
    const total = ms.reduce((sum, m) => sum + m.length, 0);
    return { title: `${ms.length} ${t('segments')} · ${formatMm(total)} mm`, details: '' };
}
