/**
 * Pure snapping (no DOM): candidates from other objects and the grid, the snapped position of a
 * moving box or point within a tolerance, and the guide lines to draw. Canvas coordinates (mm, Y down).
 */
import { Bounds } from '../measure/dimension-chains';
import { formatMm } from '../measure/geometry-length';
import { boxSnapPoints, Point, SnapPoint } from '../measure/measure-math';

export interface SnapOptions {
    grid: boolean;
    // end points of paths, box corners and edge mid points
    points: boolean;
    centers: boolean;
    // flush with object edges where the objects face each other
    edges: boolean;
    // aligned with edges and centres of other objects anywhere on the canvas
    align: boolean;
    gridSize: number;
}

export interface SnapTargets {
    boxes: Bounds[];
    // end points of paths
    ends: Point[];
    // grid origin
    origin: Point;
}

export interface AxisLine {
    // 'x': vertical line x = value; 'y': horizontal line y = value
    axis: 'x' | 'y';
    value: number;
    kind: 'edge' | 'center';
    box: Bounds;
}

export interface SnapCandidates {
    points: SnapPoint[];
    lines: AxisLine[];
    options: SnapOptions;
    origin: Point;
}

export interface Guide {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    kind: 'line' | 'grid';
    // distance to the neighbour, in the middle of the gap
    label?: { x: number; y: number; text: string };
}

// a reference point of the moving thing; cx / cy: that coordinate is a centre, not an edge
export interface SnapRef extends Point {
    cx?: boolean;
    cy?: boolean;
}

export interface Axes {
    x: boolean;
    y: boolean;
}

export interface SnapResult {
    dx: number;
    dy: number;
    snapX: boolean;
    snapY: boolean;
    // snapped onto this point (both axes)
    point: SnapPoint | null;
    guides: Guide[];
}

const BOTH: Axes = { x: true, y: true };
const EPS = 1e-6;
// the grid only wins when it is clearly closer than an object line
const GRID_BIAS = 1e-6;

export function buildCandidates(targets: SnapTargets, options: SnapOptions): SnapCandidates {
    const points: SnapPoint[] = [];
    const lines: AxisLine[] = [];
    for (const b of targets.boxes) {
        const all = boxSnapPoints({ x: b.minX, y: b.minY, width: b.maxX - b.minX, height: b.maxY - b.minY });
        for (const p of all) {
            if (p.kind === 'center' ? options.centers : options.points) {
                points.push(p);
            }
        }
        if (options.edges || options.align) {
            lines.push(
                { axis: 'x', value: b.minX, kind: 'edge', box: b },
                { axis: 'x', value: b.maxX, kind: 'edge', box: b },
                { axis: 'y', value: b.minY, kind: 'edge', box: b },
                { axis: 'y', value: b.maxY, kind: 'edge', box: b },
            );
        }
        if (options.align) {
            lines.push(
                { axis: 'x', value: (b.minX + b.maxX) / 2, kind: 'center', box: b },
                { axis: 'y', value: (b.minY + b.maxY) / 2, kind: 'center', box: b },
            );
        }
    }
    if (options.points) {
        for (const e of targets.ends) {
            points.push({ x: e.x, y: e.y, kind: 'end' });
        }
    }
    return { points, lines, options, origin: targets.origin };
}

export function boxRefs(b: Bounds): SnapRef[] {
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    return [
        { x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY },
        { x: cx, y: b.minY, cx: true }, { x: b.maxX, y: cy, cy: true }, { x: cx, y: b.maxY, cx: true }, { x: b.minX, y: cy, cy: true },
        { x: cx, y: cy, cx: true, cy: true },
    ];
}

const shift = (b: Bounds, dx: number, dy: number): Bounds => ({ minX: b.minX + dx, minY: b.minY + dy, maxX: b.maxX + dx, maxY: b.maxY + dy });

interface AxisHit {
    value: number;
    // delta that puts the ref onto the value
    delta: number;
    grid: boolean;
}

// best line on one axis for the refs moved by delta; span: the moving thing (for the edge overlap test)
function snapAxis(axis: 'x' | 'y', refs: SnapRef[], delta: number, span: Bounds, c: SnapCandidates, tol: number): AxisHit | null {
    const { options } = c;
    let best: AxisHit | null = null;
    let bestDistance = tol;
    // other axis range of the moving thing for the edge test
    const lo = (axis === 'x' ? span.minY : span.minX) - tol;
    const hi = (axis === 'x' ? span.maxY : span.maxX) + tol;
    for (const ref of refs) {
        const v = (axis === 'x' ? ref.x : ref.y) + delta;
        const isCenter = axis === 'x' ? ref.cx : ref.cy;
        for (const line of c.lines) {
            if (line.axis !== axis) {
                continue;
            }
            if (!options.align) {
                // edges only: edge to edge, where the boxes face each other
                const bLo = axis === 'x' ? line.box.minY : line.box.minX;
                const bHi = axis === 'x' ? line.box.maxY : line.box.maxX;
                if (line.kind !== 'edge' || isCenter || bHi < lo || bLo > hi) {
                    continue;
                }
            }
            const d = Math.abs(line.value - v);
            if (d < bestDistance || (!best && d <= bestDistance) || (best?.grid && d <= bestDistance + GRID_BIAS)) {
                best = { value: line.value, delta: delta + line.value - v, grid: false };
                bestDistance = d;
            }
        }
        if (options.grid && options.gridSize > 0 && !isCenter) {
            const o = axis === 'x' ? c.origin.x : c.origin.y;
            const g = o + Math.round((v - o) / options.gridSize) * options.gridSize;
            const d = Math.abs(g - v);
            if (best ? d < bestDistance - GRID_BIAS : d <= bestDistance) {
                best = { value: g, delta: delta + g - v, grid: true };
                bestDistance = d;
            }
        }
    }
    return best;
}

// guide for a snap on one axis; moved: the moving thing at its snapped place
function axisGuide(axis: 'x' | 'y', hit: AxisHit, moved: Bounds, c: SnapCandidates, labels: boolean): Guide {
    const along = (b: Bounds): [number, number] => (axis === 'x' ? [b.minY, b.maxY] : [b.minX, b.maxX]);
    const make = (from: number, to: number, kind: Guide['kind']): Guide => (axis === 'x'
        ? { x1: hit.value, y1: from, x2: hit.value, y2: to, kind }
        : { x1: from, y1: hit.value, x2: to, y2: hit.value, kind });
    const [mLo, mHi] = along(moved);
    if (hit.grid) {
        const extra = c.options.gridSize;
        return make(mLo - extra, mHi + extra, 'grid');
    }
    let lo = mLo;
    let hi = mHi;
    let gap: { from: number; to: number } | null = null;
    for (const line of c.lines) {
        if (line.axis !== axis || Math.abs(line.value - hit.value) > EPS) {
            continue;
        }
        const [bLo, bHi] = along(line.box);
        lo = Math.min(lo, bLo);
        hi = Math.max(hi, bHi);
        // nearest neighbour along the guide
        let g: { from: number; to: number } | null = null;
        if (bLo >= mHi) {
            g = { from: mHi, to: bLo };
        } else if (bHi <= mLo) {
            g = { from: bHi, to: mLo };
        }
        if (g && (!gap || g.to - g.from < gap.to - gap.from)) {
            gap = g;
        }
    }
    const guide = make(lo, hi, 'line');
    if (labels && gap && gap.to - gap.from > 0.05) {
        const mid = (gap.from + gap.to) / 2;
        const text = formatMm(gap.to - gap.from);
        guide.label = axis === 'x' ? { x: hit.value, y: mid, text } : { x: mid, y: hit.value, text };
    }
    return guide;
}

/**
 * Snaps refs moved by (dx, dy). A point within tol wins (both axes), otherwise each axis snaps to
 * the nearest object line or grid line. span: the moving thing, for edge tests and guides.
 */
export function snapRefs(
    refs: SnapRef[], span: Bounds, dx: number, dy: number, c: SnapCandidates, tol: number, axes: Axes = BOTH, labels = false
): SnapResult {
    const result: SnapResult = { dx, dy, snapX: false, snapY: false, point: null, guides: [] };
    if (axes.x && axes.y && c.points.length > 0) {
        let bestDistance = tol;
        for (const ref of refs) {
            const x = ref.x + dx;
            const y = ref.y + dy;
            for (const p of c.points) {
                const d = Math.hypot(p.x - x, p.y - y);
                if (d <= bestDistance) {
                    bestDistance = d;
                    result.point = p;
                    result.dx = dx + p.x - x;
                    result.dy = dy + p.y - y;
                }
            }
        }
        if (result.point) {
            result.snapX = true;
            result.snapY = true;
            return result;
        }
    }
    const moving = shift(span, axes.x ? dx : 0, axes.y ? dy : 0);
    const hitX = axes.x ? snapAxis('x', refs, dx, moving, c, tol) : null;
    const hitY = axes.y ? snapAxis('y', refs, dy, moving, c, tol) : null;
    if (hitX) {
        result.dx = hitX.delta;
        result.snapX = true;
    }
    if (hitY) {
        result.dy = hitY.delta;
        result.snapY = true;
    }
    const moved = shift(span, axes.x ? result.dx : 0, axes.y ? result.dy : 0);
    if (hitX) {
        result.guides.push(axisGuide('x', hitX, moved, c, labels));
    }
    if (hitY) {
        result.guides.push(axisGuide('y', hitY, moved, c, labels));
    }
    return result;
}

// moving a box by (dx, dy): its corners, edge mid points and centre snap; guides carry the distance to the neighbour
export function snapBox(b: Bounds, dx: number, dy: number, c: SnapCandidates, tol: number): SnapResult {
    return snapRefs(boxRefs(b), b, dx, dy, c, tol, BOTH, true);
}

// a single point (cursor, grip, path point)
export function snapPoint(p: Point, c: SnapCandidates, tol: number, axes: Axes = BOTH): Point & SnapResult {
    const r = snapRefs([p], { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }, 0, 0, c, tol, axes);
    return { ...r, x: p.x + r.dx, y: p.y + r.dy };
}
