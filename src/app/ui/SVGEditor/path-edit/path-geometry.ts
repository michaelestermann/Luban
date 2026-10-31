/**
 * Pure path geometry for point editing (no DOM).
 *
 * A path is an array of subpaths. Each subpath is a list of end points (nodes). Segment i goes from
 * nodes[i] to nodes[i + 1]; a closed subpath has one more segment from the last node back to the first.
 * A segment is a cubic bézier when the start node has an `out` handle and the end node an `in` handle,
 * otherwise it is a straight line. Both handles of a segment are always set or unset together.
 *
 * All functions are immutable: they return new objects and never change their input.
 */
import svgPath from 'svgpath';

export interface Point {
    x: number;
    y: number;
}

export interface PathNode {
    x: number;
    y: number;
    in: Point | null;
    out: Point | null;
}

export interface Subpath {
    closed: boolean;
    nodes: PathNode[];
}

export type PathData = Subpath[];

export interface Segment {
    from: Point;
    to: Point;
    // control points, null for a straight line
    c1: Point | null;
    c2: Point | null;
}

export interface NearestResult {
    t: number;
    distance: number;
    x: number;
    y: number;
}

export interface NearestSegmentResult extends NearestResult {
    subpathIndex: number;
    segmentIndex: number;
}

export type PointType = 'corner' | 'smooth';

const EPSILON = 1e-9;

const copyPoint = (p: Point | null): Point | null => (p ? { x: p.x, y: p.y } : null);
const copyNode = (n: PathNode): PathNode => ({ x: n.x, y: n.y, in: copyPoint(n.in), out: copyPoint(n.out) });
const copySubpath = (s: Subpath): Subpath => ({ closed: s.closed, nodes: s.nodes.map(copyNode) });
const copyPath = (path: PathData): PathData => path.map(copySubpath);
const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const shift = (p: Point | null, dx: number, dy: number): Point | null => (p ? { x: p.x + dx, y: p.y + dy } : null);
const node = (x: number, y: number): PathNode => ({ x, y, in: null, out: null });

// ---- parse ----

export function parsePath(d: string): PathData {
    // svgpath has no typing for the parsed segments
    const parsed = svgPath(d).abs().unarc().unshort() as unknown as { segments: (string | number)[][] };
    const segments = parsed.segments;
    const path: PathData = [];
    let current: Subpath | null = null;
    let start: Point = { x: 0, y: 0 };
    let pos: Point = { x: 0, y: 0 };

    const lastNode = (): PathNode => current.nodes[current.nodes.length - 1];
    const ensureSubpath = () => {
        // drawing after Z without M starts a new subpath at the previous start
        if (!current) {
            current = { closed: false, nodes: [node(start.x, start.y)] };
            path.push(current);
        }
    };
    const finishClosed = () => {
        const nodes = current.nodes;
        if (nodes.length > 1) {
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            // drop a closing point equal to the start, its incoming handle moves to the first node
            if (dist(first, last) < 1e-9) {
                first.in = last.in;
                nodes.pop();
            }
        }
        current.closed = true;
    };

    for (const seg of segments) {
        const cmd = seg[0] as string;
        const v = seg.slice(1) as number[];
        switch (cmd) {
            case 'M':
                current = { closed: false, nodes: [node(v[0], v[1])] };
                path.push(current);
                start = { x: v[0], y: v[1] };
                pos = { x: v[0], y: v[1] };
                break;
            case 'L':
            case 'H':
            case 'V': {
                ensureSubpath();
                const x = cmd === 'V' ? pos.x : v[0];
                let y = cmd === 'H' ? pos.y : v[1];
                if (cmd === 'V') {
                    y = v[0];
                }
                current.nodes.push(node(x, y));
                pos = { x, y };
                break;
            }
            case 'C':
                ensureSubpath();
                lastNode().out = { x: v[0], y: v[1] };
                current.nodes.push({ x: v[4], y: v[5], in: { x: v[2], y: v[3] }, out: null });
                pos = { x: v[4], y: v[5] };
                break;
            case 'Q': {
                ensureSubpath();
                // quadratic to cubic: control points at 2/3 towards the quadratic control point
                const q = { x: v[0], y: v[1] };
                const to = { x: v[2], y: v[3] };
                lastNode().out = lerp(pos, q, 2 / 3);
                current.nodes.push({ x: to.x, y: to.y, in: lerp(to, q, 2 / 3), out: null });
                pos = to;
                break;
            }
            case 'Z':
                if (current) {
                    finishClosed();
                }
                current = null;
                pos = { ...start };
                break;
            default:
                break;
        }
    }
    return path;
}

// ---- segments ----

export function segmentCount(sub: Subpath): number {
    const n = sub.nodes.length;
    if (n < 2) {
        return 0;
    }
    return sub.closed ? n : n - 1;
}

export function getSegment(sub: Subpath, segmentIndex: number): Segment {
    const a = sub.nodes[segmentIndex];
    const b = sub.nodes[(segmentIndex + 1) % sub.nodes.length];
    const cubic = !!(a.out && b.in);
    return {
        from: { x: a.x, y: a.y },
        to: { x: b.x, y: b.y },
        c1: cubic ? copyPoint(a.out) : null,
        c2: cubic ? copyPoint(b.in) : null,
    };
}

export function pointOnSegment(seg: Segment, t: number): Point {
    if (!seg.c1) {
        return lerp(seg.from, seg.to, t);
    }
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    return {
        x: a * seg.from.x + b * seg.c1.x + c * seg.c2.x + d * seg.to.x,
        y: a * seg.from.y + b * seg.c1.y + c * seg.c2.y + d * seg.to.y,
    };
}

export function pointAt(path: PathData, subpathIndex: number, segmentIndex: number, t: number): Point {
    return pointOnSegment(getSegment(path[subpathIndex], segmentIndex), t);
}

export function nearestOnSegment(seg: Segment, p: Point): NearestResult {
    let t: number;
    if (!seg.c1) {
        const dx = seg.to.x - seg.from.x;
        const dy = seg.to.y - seg.from.y;
        const len2 = dx * dx + dy * dy;
        t = len2 < EPSILON ? 0 : ((p.x - seg.from.x) * dx + (p.y - seg.from.y) * dy) / len2;
        t = Math.min(1, Math.max(0, t));
    } else {
        // coarse sampling, then refine by shrinking the interval around the best sample
        const steps = 64;
        let best = 0;
        let bestD = Infinity;
        for (let i = 0; i <= steps; i++) {
            const d = dist(pointOnSegment(seg, i / steps), p);
            if (d < bestD) {
                bestD = d;
                best = i / steps;
            }
        }
        let step = 1 / steps;
        while (step > 1e-10) {
            const lo = Math.max(0, best - step);
            const hi = Math.min(1, best + step);
            const dLo = dist(pointOnSegment(seg, lo), p);
            const dHi = dist(pointOnSegment(seg, hi), p);
            if (dLo < bestD) {
                bestD = dLo;
                best = lo;
            } else if (dHi < bestD) {
                bestD = dHi;
                best = hi;
            } else {
                step /= 2;
            }
        }
        t = best;
    }
    const q = pointOnSegment(seg, t);
    return { t, distance: dist(q, p), x: q.x, y: q.y };
}

export function nearestSegment(path: PathData, p: Point): NearestSegmentResult | null {
    let result: NearestSegmentResult | null = null;
    path.forEach((sub, subpathIndex) => {
        for (let segmentIndex = 0; segmentIndex < segmentCount(sub); segmentIndex++) {
            const n = nearestOnSegment(getSegment(sub, segmentIndex), p);
            if (!result || n.distance < result.distance) {
                result = { ...n, subpathIndex, segmentIndex };
            }
        }
    });
    return result;
}

// ---- serialize ----

export function formatNumber(value: number): string {
    const rounded = Math.round(value * 1000) / 1000;
    // avoid "-0"
    return String(rounded === 0 ? 0 : rounded);
}

const fmt = (p: Point): string => `${formatNumber(p.x)} ${formatNumber(p.y)}`;

export function serializePath(path: PathData): string {
    const parts: string[] = [];
    path.forEach((sub) => {
        if (sub.nodes.length === 0) {
            return;
        }
        parts.push(`M${fmt(sub.nodes[0])}`);
        for (let i = 0; i < segmentCount(sub); i++) {
            const seg = getSegment(sub, i);
            const isClosing = sub.closed && i === sub.nodes.length - 1;
            if (seg.c1) {
                parts.push(`C${fmt(seg.c1)} ${fmt(seg.c2)} ${fmt(seg.to)}`);
            } else if (!isClosing) {
                parts.push(`L${fmt(seg.to)}`);
            }
        }
        if (sub.closed) {
            parts.push('Z');
        }
    });
    return parts.join(' ');
}

// ---- insert / delete ----

export function insertPoint(path: PathData, subpathIndex: number, segmentIndex: number, t: number): PathData {
    const result = copyPath(path);
    const sub = result[subpathIndex];
    const n = sub.nodes.length;
    const a = sub.nodes[segmentIndex];
    const b = sub.nodes[(segmentIndex + 1) % n];
    let inserted: PathNode;
    if (a.out && b.in) {
        // de Casteljau split
        const p01 = lerp(a, a.out, t);
        const p12 = lerp(a.out, b.in, t);
        const p23 = lerp(b.in, b, t);
        const p012 = lerp(p01, p12, t);
        const p123 = lerp(p12, p23, t);
        const p = lerp(p012, p123, t);
        a.out = p01;
        b.in = p23;
        inserted = { x: p.x, y: p.y, in: p012, out: p123 };
    } else {
        const p = lerp(a, b, t);
        inserted = node(p.x, p.y);
    }
    sub.nodes.splice(segmentIndex + 1, 0, inserted);
    return result;
}

/**
 * Removes an end point. The neighbours are joined directly: if both adjacent segments were cubics the
 * outer control points are kept as one cubic, otherwise the new segment is a straight line.
 * Returns null (refused) if the subpath would keep fewer than 2 points.
 */
export function deletePoint(path: PathData, subpathIndex: number, nodeIndex: number): PathData | null {
    const sub = path[subpathIndex];
    const n = sub.nodes.length;
    if (n <= 2) {
        return null;
    }
    const result = copyPath(path);
    const nodes = result[subpathIndex].nodes;
    const target = nodes[nodeIndex];
    const hasPrev = sub.closed || nodeIndex > 0;
    const hasNext = sub.closed || nodeIndex < n - 1;
    const prev = hasPrev ? nodes[(nodeIndex - 1 + n) % n] : null;
    const next = hasNext ? nodes[(nodeIndex + 1) % n] : null;
    if (prev && next) {
        const keepCubic = !!(target.in && target.out);
        if (!keepCubic) {
            prev.out = null;
            next.in = null;
        }
    } else if (next) {
        // removed the first point of an open subpath
        next.in = null;
    } else if (prev) {
        // removed the last point of an open subpath
        prev.out = null;
    }
    nodes.splice(nodeIndex, 1);
    return result;
}

// ---- split / close / join ----

/**
 * Opens the path at an end point. A closed subpath becomes one open subpath starting and ending there,
 * an open subpath becomes two subpaths. Returns null at an open end (nothing to split).
 */
export function splitAt(path: PathData, subpathIndex: number, nodeIndex: number): PathData | null {
    const sub = path[subpathIndex];
    const n = sub.nodes.length;
    let parts: Subpath[];
    if (sub.closed) {
        if (n < 2) {
            return null;
        }
        const nodes = [...sub.nodes.slice(nodeIndex), ...sub.nodes.slice(0, nodeIndex)].map(copyNode);
        const end = copyNode(nodes[0]);
        end.out = null;
        nodes[0].in = null;
        nodes.push(end);
        parts = [{ closed: false, nodes }];
    } else {
        if (nodeIndex <= 0 || nodeIndex >= n - 1) {
            return null;
        }
        const first = sub.nodes.slice(0, nodeIndex + 1).map(copyNode);
        const second = sub.nodes.slice(nodeIndex).map(copyNode);
        first[first.length - 1].out = null;
        second[0].in = null;
        parts = [{ closed: false, nodes: first }, { closed: false, nodes: second }];
    }
    const result = copyPath(path);
    result.splice(subpathIndex, 1, ...parts);
    return result;
}

/**
 * Opens the path inside a segment at parameter t (a new point is inserted there first).
 * t at 0 or 1 splits at the existing end point.
 */
export function splitSegment(path: PathData, subpathIndex: number, segmentIndex: number, t: number): PathData | null {
    const n = path[subpathIndex].nodes.length;
    if (t <= 1e-6) {
        return splitAt(path, subpathIndex, segmentIndex);
    }
    if (t >= 1 - 1e-6) {
        return splitAt(path, subpathIndex, (segmentIndex + 1) % n);
    }
    return splitAt(insertPoint(path, subpathIndex, segmentIndex, t), subpathIndex, segmentIndex + 1);
}

export function hasOpenSubpaths(path: PathData): boolean {
    return path.some((sub) => !sub.closed && sub.nodes.length >= 2);
}

// Closes every open subpath with a straight segment (Z).
export function closeOpenSubpaths(path: PathData): PathData {
    return path.map((sub) => {
        const copy = copySubpath(sub);
        if (copy.nodes.length >= 2) {
            copy.closed = true;
        }
        return copy;
    });
}

/**
 * Closes open subpaths whose ends are within tolerance: both ends move to their midpoint (their
 * control points move along) and become one point, so no extra segment is added.
 */
export function joinEnds(path: PathData, tolerance: number): { path: PathData; joined: number } {
    let joined = 0;
    const result = path.map((sub) => {
        const copy = copySubpath(sub);
        const nodes = copy.nodes;
        if (copy.closed || nodes.length < 3) {
            return copy;
        }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (dist(first, last) > tolerance) {
            return copy;
        }
        const mid = lerp(first, last, 0.5);
        const merged: PathNode = {
            x: mid.x,
            y: mid.y,
            in: shift(last.in, mid.x - last.x, mid.y - last.y),
            out: shift(first.out, mid.x - first.x, mid.y - first.y),
        };
        joined++;
        return { closed: true, nodes: [merged, ...nodes.slice(1, -1)] };
    });
    return { path: result, joined };
}

// ---- shapes to path ----

const KAPPA = 0.5522847498;

export function rectToPath(x: number, y: number, w: number, h: number): string {
    return serializePath([{
        closed: true,
        nodes: [node(x, y), node(x + w, y), node(x + w, y + h), node(x, y + h)],
    }]);
}

export function ellipseToPath(cx: number, cy: number, rx: number, ry: number): string {
    const kx = rx * KAPPA;
    const ky = ry * KAPPA;
    return serializePath([{
        closed: true,
        nodes: [
            { x: cx + rx, y: cy, in: { x: cx + rx, y: cy - ky }, out: { x: cx + rx, y: cy + ky } },
            { x: cx, y: cy + ry, in: { x: cx + kx, y: cy + ry }, out: { x: cx - kx, y: cy + ry } },
            { x: cx - rx, y: cy, in: { x: cx - rx, y: cy + ky }, out: { x: cx - rx, y: cy - ky } },
            { x: cx, y: cy - ry, in: { x: cx - kx, y: cy - ry }, out: { x: cx + kx, y: cy - ry } },
        ],
    }]);
}

export function circleToPath(cx: number, cy: number, r: number): string {
    return ellipseToPath(cx, cy, r, r);
}

export function lineToPath(x1: number, y1: number, x2: number, y2: number): string {
    return serializePath([{ closed: false, nodes: [node(x1, y1), node(x2, y2)] }]);
}

// ---- point position and type ----

// Moves an end point; its control points move by the same delta.
export function setPointPosition(path: PathData, subpathIndex: number, nodeIndex: number, x: number, y: number): PathData {
    const result = copyPath(path);
    const n = result[subpathIndex].nodes[nodeIndex];
    const dx = x - n.x;
    const dy = y - n.y;
    result[subpathIndex].nodes[nodeIndex] = { x, y, in: shift(n.in, dx, dy), out: shift(n.out, dx, dy) };
    return result;
}

// Direction vectors of the incoming and outgoing side of a point. A straight side uses the neighbour point.
function sideVectors(sub: Subpath, nodeIndex: number): { vin: Point | null; vout: Point | null } {
    const n = sub.nodes.length;
    const p = sub.nodes[nodeIndex];
    const prev = sub.closed || nodeIndex > 0 ? sub.nodes[(nodeIndex - 1 + n) % n] : null;
    const next = sub.closed || nodeIndex < n - 1 ? sub.nodes[(nodeIndex + 1) % n] : null;
    const vec = (q: Point | null): Point | null => {
        if (!q) {
            return null;
        }
        const v = { x: q.x - p.x, y: q.y - p.y };
        return Math.hypot(v.x, v.y) < EPSILON ? null : v;
    };
    return {
        vin: vec(p.in || (prev && prev !== p ? prev : null)),
        vout: vec(p.out || (next && next !== p ? next : null)),
    };
}

export function getPointType(path: PathData, subpathIndex: number, nodeIndex: number): PointType {
    const { vin, vout } = sideVectors(path[subpathIndex], nodeIndex);
    if (!vin || !vout) {
        return 'corner';
    }
    const lin = Math.hypot(vin.x, vin.y);
    const lout = Math.hypot(vout.x, vout.y);
    const cross = (vin.x * vout.y - vin.y * vout.x) / (lin * lout);
    const dot = vin.x * vout.x + vin.y * vout.y;
    return Math.abs(cross) < 1e-6 && dot < 0 ? 'smooth' : 'corner';
}

/**
 * 'smooth' makes the incoming and outgoing handles collinear: both keep their length and point along
 * the averaged direction. A handle next to a straight segment is aligned with that segment.
 * 'corner' leaves the geometry unchanged (it only changes how handles are dragged later).
 */
export function setPointType(path: PathData, subpathIndex: number, nodeIndex: number, type: PointType): PathData {
    const result = copyPath(path);
    if (type !== 'smooth') {
        return result;
    }
    const p = result[subpathIndex].nodes[nodeIndex];
    const { vin, vout } = sideVectors(result[subpathIndex], nodeIndex);
    if (!vin || !vout || (!p.in && !p.out)) {
        return result;
    }
    const lin = Math.hypot(vin.x, vin.y);
    const lout = Math.hypot(vout.x, vout.y);
    let dir: Point;
    if (p.in && p.out) {
        // average of the outgoing direction and the reversed incoming direction
        dir = { x: vout.x / lout - vin.x / lin, y: vout.y / lout - vin.y / lin };
        if (Math.hypot(dir.x, dir.y) < EPSILON) {
            // handles point the same way: keep the outgoing direction
            dir = { x: vout.x, y: vout.y };
        }
    } else if (p.out) {
        // incoming side is straight
        dir = { x: -vin.x, y: -vin.y };
    } else {
        // outgoing side is straight
        dir = { x: vout.x, y: vout.y };
    }
    const len = Math.hypot(dir.x, dir.y);
    const u = { x: dir.x / len, y: dir.y / len };
    if (p.out) {
        p.out = { x: p.x + u.x * lout, y: p.y + u.y * lout };
    }
    if (p.in) {
        p.in = { x: p.x - u.x * lin, y: p.y - u.y * lin };
    }
    return result;
}

// ---- round corner ----

/**
 * Replaces a corner point between two straight segments by a circular arc of radius r (one cubic).
 * The tangent points are clamped to the segment lengths (the radius gets smaller); a tangent point
 * on the neighbour point is merged with it. Returns null if the point has no two straight sides,
 * the sides are in line or r is not positive.
 */
export function roundCorner(path: PathData, subpathIndex: number, nodeIndex: number, r: number): { path: PathData; radius: number } | null {
    const sub = path[subpathIndex];
    const n = sub?.nodes.length || 0;
    if (!sub || !(r > 0) || n < 3) {
        return null;
    }
    const hasPrev = sub.closed || nodeIndex > 0;
    const hasNext = sub.closed || nodeIndex < n - 1;
    if (!hasPrev || !hasNext) {
        return null;
    }
    const prevIndex = (nodeIndex - 1 + n) % n;
    const nextIndex = (nodeIndex + 1) % n;
    const c = sub.nodes[nodeIndex];
    const p = sub.nodes[prevIndex];
    const q = sub.nodes[nextIndex];
    if (c.in || c.out || p.out || q.in) {
        // a curve on one side
        return null;
    }
    const len1 = dist(c, p);
    const len2 = dist(c, q);
    if (len1 < EPSILON || len2 < EPSILON) {
        return null;
    }
    const u1 = { x: (p.x - c.x) / len1, y: (p.y - c.y) / len1 };
    const u2 = { x: (q.x - c.x) / len2, y: (q.y - c.y) / len2 };
    const alpha = Math.acos(Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y)));
    if (alpha < 1e-6 || Math.PI - alpha < 1e-6) {
        return null;
    }
    const tanHalf = Math.tan(alpha / 2);
    const tangent = Math.min(r / tanHalf, len1, len2);
    const radius = tangent * tanHalf;
    // cubic handle length of an arc with the sweep π - α
    const handle = (4 / 3) * Math.tan((Math.PI - alpha) / 4) * radius;
    const a = { x: c.x + u1.x * tangent, y: c.y + u1.y * tangent };
    const b = { x: c.x + u2.x * tangent, y: c.y + u2.y * tangent };
    const c1 = { x: a.x - u1.x * handle, y: a.y - u1.y * handle };
    const c2 = { x: b.x - u2.x * handle, y: b.y - u2.y * handle };

    const result = copyPath(path);
    const nodes = result[subpathIndex].nodes;
    const mergeA = dist(a, p) < 1e-9;
    const mergeB = dist(b, q) < 1e-9;
    const inserted: PathNode[] = [];
    if (mergeA) {
        nodes[prevIndex].out = c1;
    } else {
        inserted.push({ x: a.x, y: a.y, in: null, out: c1 });
    }
    if (mergeB) {
        nodes[nextIndex].in = c2;
    } else {
        inserted.push({ x: b.x, y: b.y, in: c2, out: null });
    }
    nodes.splice(nodeIndex, 1, ...inserted);
    return { path: result, radius };
}
