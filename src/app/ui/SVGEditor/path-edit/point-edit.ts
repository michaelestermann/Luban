/**
 * Pure helpers for the point editing mode (no DOM): bring pen tool paths into one chain per
 * subpath, walk the end points in path order, map segments to the editor's line objects and back,
 * and convert canvas coordinates to the coordinates shown in the Position & size fields.
 */
import { PathData, PathNode, PointType, Subpath, getSegment, joinEnds, segmentCount } from './path-geometry';

export type TPoint = [number, number];

export interface NodeRef {
    subpathIndex: number;
    nodeIndex: number;
}

export interface SegmentPoints {
    subpathIndex: number;
    segmentIndex: number;
    fromIndex: number;
    toIndex: number;
    // [from, to] for a line, [from, c1, c2, to] for a cubic
    points: TPoint[];
}

/** What the mode bar and the point card show, published by the draw group. */
export interface PointEditState {
    active: boolean;
    elem: SVGPathElement | null;
    pointCount: number;
    selected: null | {
        // 0-based position in path order
        ordinal: number;
        subpathIndex: number;
        nodeIndex: number;
        // canvas coordinates
        x: number;
        y: number;
        type: PointType;
        canDelete: boolean;
        canSplit: boolean;
        // a corner between two straight segments (Round)
        canRound: boolean;
    };
    cardOpen: boolean;
    insertMode: boolean;
}

const DEFAULT_EPS = 1e-6;

const copyPoint = (p) => (p ? { x: p.x, y: p.y } : null);
const copyNode = (n: PathNode): PathNode => ({ x: n.x, y: n.y, in: copyPoint(n.in), out: copyPoint(n.out) });
const copySubpath = (s: Subpath): Subpath => ({ closed: s.closed, nodes: s.nodes.map(copyNode) });
const dist = (a: { x: number, y: number }, b: { x: number, y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const isStraightPair = (s: Subpath) => s.nodes.every((n) => !n.in && !n.out);

/**
 * The pen tool writes every segment as its own subpath ("M a L b Z" for lines, "M a C ..." for
 * curves). Paths written by the point editor have whole subpaths.
 */
export function isPenFormat(path: PathData): boolean {
    if (path.length === 0) {
        return false;
    }
    return path.every((sub) => {
        if (sub.nodes.length !== 2) {
            return false;
        }
        // pen lines are always closed, pen curves always open
        return sub.closed ? isStraightPair(sub) : !isStraightPair(sub);
    });
}

function reverseSubpath(sub: Subpath): Subpath {
    return {
        closed: sub.closed,
        nodes: sub.nodes.slice().reverse().map((n) => ({ x: n.x, y: n.y, in: copyPoint(n.out), out: copyPoint(n.in) })),
    };
}

const first = (s: Subpath) => s.nodes[0];
const last = (s: Subpath) => s.nodes[s.nodes.length - 1];

function append(chain: Subpath, piece: Subpath) {
    last(chain).out = copyPoint(first(piece).out);
    chain.nodes.push(...piece.nodes.slice(1).map(copyNode));
}

function prepend(chain: Subpath, piece: Subpath) {
    first(chain).in = copyPoint(last(piece).in);
    chain.nodes = piece.nodes.slice(0, -1).map(copyNode).concat(chain.nodes);
}

// Connects piece to chain if one of their ends meet; returns false if they don't.
function connect(chain: Subpath, piece: Subpath, eps: number): boolean {
    if (dist(last(chain), first(piece)) < eps) {
        append(chain, piece);
    } else if (dist(first(chain), last(piece)) < eps) {
        prepend(chain, piece);
    } else if (dist(last(chain), last(piece)) < eps) {
        append(chain, reverseSubpath(piece));
    } else if (dist(first(chain), first(piece)) < eps) {
        prepend(chain, reverseSubpath(piece));
    } else {
        return false;
    }
    return true;
}

/**
 * Chains pen tool segments into subpaths (in drawing order) and closes chains that end where they
 * start. Other paths are returned as a copy.
 */
export function normalizePenPath(path: PathData, eps: number = DEFAULT_EPS): PathData {
    if (!isPenFormat(path)) {
        return path.map(copySubpath);
    }
    const chains: Subpath[] = [];
    for (const sub of path) {
        const piece: Subpath = { closed: false, nodes: sub.nodes.map(copyNode) };
        // the most recent chain first, so the drawing order is kept
        let chain = null;
        for (let i = chains.length - 1; i >= 0; i--) {
            if (!chains[i].closed && connect(chains[i], piece, eps)) {
                chain = chains[i];
                break;
            }
        }
        if (!chain) {
            chains.push(piece);
            continue;
        }
        // the grown chain may now meet another chain
        let merged = true;
        while (merged) {
            merged = false;
            for (let i = 0; i < chains.length; i++) {
                const other = chains[i];
                if (other !== chain && !other.closed && connect(chain, other, eps)) {
                    chains.splice(i, 1);
                    merged = true;
                    break;
                }
            }
        }
        if (chain.nodes.length >= 3 && dist(first(chain), last(chain)) < eps) {
            first(chain).in = copyPoint(last(chain).in);
            chain.nodes.pop();
            chain.closed = true;
        }
    }
    return chains;
}

export function countNodes(path: PathData): number {
    return path.reduce((sum, sub) => sum + sub.nodes.length, 0);
}

/** All end points in path order. */
export function listNodes(path: PathData): NodeRef[] {
    const list: NodeRef[] = [];
    path.forEach((sub, subpathIndex) => {
        sub.nodes.forEach((_, nodeIndex) => list.push({ subpathIndex, nodeIndex }));
    });
    return list;
}

/** 0-based position of an end point in path order, -1 if it does not exist. */
export function nodeOrdinal(path: PathData, subpathIndex: number, nodeIndex: number): number {
    if (!path[subpathIndex] || nodeIndex < 0 || nodeIndex >= path[subpathIndex].nodes.length) {
        return -1;
    }
    let ordinal = 0;
    for (let i = 0; i < subpathIndex; i++) {
        ordinal += path[i].nodes.length;
    }
    return ordinal + nodeIndex;
}

/**
 * The next (step 1) or previous (step -1) end point, wrapping around. Without a current point the
 * first or last one.
 */
export function stepNode(path: PathData, subpathIndex: number | null, nodeIndex: number | null, step: number): NodeRef | null {
    const list = listNodes(path);
    if (list.length === 0) {
        return null;
    }
    const current = subpathIndex === null ? -1 : nodeOrdinal(path, subpathIndex, nodeIndex);
    if (current === -1) {
        return step > 0 ? list[0] : list[list.length - 1];
    }
    const next = ((current + step) % list.length + list.length) % list.length;
    return list[next];
}

/** Every segment with its points, closing segments of closed subpaths included. */
export function segmentPoints(path: PathData): SegmentPoints[] {
    const result: SegmentPoints[] = [];
    path.forEach((sub, subpathIndex) => {
        for (let segmentIndex = 0; segmentIndex < segmentCount(sub); segmentIndex++) {
            const seg = getSegment(sub, segmentIndex);
            const points: TPoint[] = seg.c1
                ? [[seg.from.x, seg.from.y], [seg.c1.x, seg.c1.y], [seg.c2.x, seg.c2.y], [seg.to.x, seg.to.y]]
                : [[seg.from.x, seg.from.y], [seg.to.x, seg.to.y]];
            result.push({
                subpathIndex,
                segmentIndex,
                fromIndex: segmentIndex,
                toIndex: (segmentIndex + 1) % sub.nodes.length,
                points,
            });
        }
    });
    return result;
}

/**
 * Builds the path back from (moved) segment points: end points from the segment ends, handles
 * from the cubic control points. Nodes without segments keep their position.
 */
export function readPathFromSegments(path: PathData, segments: SegmentPoints[]): PathData {
    const result = path.map(copySubpath);
    for (const seg of segments) {
        const sub = result[seg.subpathIndex];
        const pts = seg.points;
        if (!sub || pts.length < 2) {
            continue;
        }
        const from = sub.nodes[seg.fromIndex];
        const to = sub.nodes[seg.toIndex];
        const end = pts[pts.length - 1];
        from.x = pts[0][0];
        from.y = pts[0][1];
        to.x = end[0];
        to.y = end[1];
        if (pts.length === 4) {
            from.out = { x: pts[1][0], y: pts[1][1] };
            to.in = { x: pts[2][0], y: pts[2][1] };
        }
    }
    return result;
}

/** All numbers of a path string, signs and exponents included. */
export function parseNumbers(d: string): number[] {
    const matches = d.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi);
    return matches ? matches.map(Number) : [];
}

/** Canvas point to the coordinates of the Position & size fields (work origin, Y up). */
export function toLogical(p: { x: number, y: number }, size: { x: number, y: number }): { x: number, y: number } {
    return { x: p.x - size.x, y: -p.y + size.y };
}

export function toCanvas(p: { x: number, y: number }, size: { x: number, y: number }): { x: number, y: number } {
    return { x: p.x + size.x, y: size.y - p.y };
}

/**
 * After dragging an open end onto the other end of its subpath, the subpath is closed (the two
 * ends become one point). Returns the input if nothing is joined.
 */
export function joinDraggedEnd(path: PathData, subpathIndex: number, nodeIndex: number, eps: number = DEFAULT_EPS): PathData {
    const sub = path[subpathIndex];
    if (!sub || sub.closed || sub.nodes.length < 3 || (nodeIndex !== 0 && nodeIndex !== sub.nodes.length - 1)) {
        return path;
    }
    if (dist(first(sub), last(sub)) >= eps) {
        return path;
    }
    const joined = joinEnds([sub], eps).path[0];
    return path.map((s, i) => (i === subpathIndex ? joined : copySubpath(s)));
}
