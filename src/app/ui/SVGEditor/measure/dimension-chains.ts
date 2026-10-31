/**
 * Pure dimension chains (no DOM): distances of a box to the workpiece edges and to the nearest
 * neighbouring boxes along X and Y. Canvas coordinates (mm, Y down).
 */

export interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface ChainOptions {
    // to the workpiece edges
    edges: boolean;
    // between objects
    between: boolean;
}

export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface DimensionSegment {
    // 'x': horizontal line from x = from to x = to at y = at; 'y': vertical line at x = at
    axis: 'x' | 'y';
    side: Side;
    kind: 'edge' | 'object';
    from: number;
    to: number;
    at: number;
    value: number;
    // touches the selection: the label can be edited
    editable: boolean;
    // the fixed end (workpiece edge or neighbour) the selection is measured from
    anchor: number;
}

const EPS = 1e-6;

const overlapsY = (a: Bounds, b: Bounds) => a.minY < b.maxY - EPS && a.maxY > b.minY + EPS;
const overlapsX = (a: Bounds, b: Bounds) => a.minX < b.maxX - EPS && a.maxX > b.minX + EPS;

function nearestNeighbour(sel: Bounds, others: Bounds[], side: Side): Bounds | null {
    let best: Bounds | null = null;
    for (const o of others) {
        let ok = false;
        switch (side) {
            case 'left':
                ok = overlapsY(sel, o) && o.maxX <= sel.minX + EPS && (!best || o.maxX > best.maxX);
                break;
            case 'right':
                ok = overlapsY(sel, o) && o.minX >= sel.maxX - EPS && (!best || o.minX < best.minX);
                break;
            case 'top':
                ok = overlapsX(sel, o) && o.maxY <= sel.minY + EPS && (!best || o.maxY > best.maxY);
                break;
            default:
                ok = overlapsX(sel, o) && o.minY >= sel.maxY - EPS && (!best || o.minY < best.minY);
                break;
        }
        if (ok) {
            best = o;
        }
    }
    return best;
}

function segment(axis: 'x' | 'y', side: Side, kind: 'edge' | 'object', a: number, b: number, at: number, editable: boolean, anchor: number): DimensionSegment {
    return { axis, side, kind, from: Math.min(a, b), to: Math.max(a, b), at, value: Math.abs(b - a), editable, anchor };
}

/**
 * Chains of one box (the selection). Per side: selection → nearest neighbour (editable) and
 * neighbour → workpiece edge (read-only), or selection → workpiece edge (editable).
 */
export function dimensionChains(sel: Bounds, others: Bounds[], work: Bounds | null, options: ChainOptions): DimensionSegment[] {
    const segs: DimensionSegment[] = [];
    const cy = (sel.minY + sel.maxY) / 2;
    const cx = (sel.minX + sel.maxX) / 2;
    const sides: Side[] = ['left', 'right', 'top', 'bottom'];
    for (const side of sides) {
        const axis = side === 'left' || side === 'right' ? 'x' : 'y';
        const at = axis === 'x' ? cy : cx;
        // selection edge, neighbour's near and far edge, workpiece edge on this side
        const selEdge = { left: sel.minX, right: sel.maxX, top: sel.minY, bottom: sel.maxY }[side];
        const sign = side === 'left' || side === 'top' ? -1 : 1;
        const neighbour = options.between ? nearestNeighbour(sel, others, side) : null;
        const workEdge = work ? { left: work.minX, right: work.maxX, top: work.minY, bottom: work.maxY }[side] : null;
        let start = selEdge;
        if (neighbour) {
            const near = { left: neighbour.maxX, right: neighbour.minX, top: neighbour.maxY, bottom: neighbour.minY }[side];
            segs.push(segment(axis, side, 'object', selEdge, near, at, true, near));
            start = { left: neighbour.minX, right: neighbour.maxX, top: neighbour.minY, bottom: neighbour.maxY }[side];
        }
        if (options.edges && workEdge !== null && (workEdge - start) * sign > EPS) {
            segs.push(segment(axis, side, 'edge', start, workEdge, at, !neighbour, workEdge));
        }
    }
    return segs;
}

/**
 * Offset that moves the selection so that the given segment measures value.
 */
export function moveForDimension(seg: DimensionSegment, sel: Bounds, value: number): { dx: number; dy: number } {
    switch (seg.side) {
        case 'left':
            return { dx: seg.anchor + value - sel.minX, dy: 0 };
        case 'right':
            return { dx: seg.anchor - value - sel.maxX, dy: 0 };
        case 'top':
            return { dx: 0, dy: seg.anchor + value - sel.minY };
        default:
            return { dx: 0, dy: seg.anchor - value - sel.maxY };
    }
}

/**
 * Workpiece rectangle on the canvas, as drawn by Workpiece2d (size = canvas centre offset).
 */
export function workpieceBox(size: { x: number; y: number }, coordinateSize: { x: number; y: number }, factor: { x: number; y: number }): Bounds | null {
    if (!coordinateSize || !(coordinateSize.x > 0) || !(coordinateSize.y > 0)) {
        return null;
    }
    const dx = (coordinateSize.x / 2) * factor.x;
    const dy = (-coordinateSize.y / 2) * factor.y;
    return {
        minX: size.x - coordinateSize.x / 2 + dx,
        minY: size.y - coordinateSize.y / 2 + dy,
        maxX: size.x + coordinateSize.x / 2 + dx,
        maxY: size.y + coordinateSize.y / 2 + dy,
    };
}

/**
 * Read-only chains of every box; a segment shared by two boxes is kept once.
 */
export function allObjectChains(boxes: Bounds[], work: Bounds | null, options: ChainOptions): DimensionSegment[] {
    const seen = new Set<string>();
    const result: DimensionSegment[] = [];
    boxes.forEach((b, i) => {
        const others = boxes.filter((_, j) => j !== i);
        for (const s of dimensionChains(b, others, work, options)) {
            const key = s.kind === 'object' ? `${s.axis}|${s.from.toFixed(3)}|${s.to.toFixed(3)}` : `${s.axis}|${s.from.toFixed(3)}|${s.to.toFixed(3)}|${s.at.toFixed(3)}`;
            if (!seen.has(key)) {
                seen.add(key);
                result.push({ ...s, editable: false });
            }
        }
    });
    return result;
}

// "All objects" is O(n²) and draws up to 8n labels: above this many objects only the selection is dimensioned
export const ALL_OBJECTS_LIMIT = 150;

/**
 * Scope that is actually drawn for the chosen scope and the number of objects.
 */
export function chainScope(scope: 'selection' | 'all', count: number): 'selection' | 'all' {
    return scope === 'all' && count > ALL_OBJECTS_LIMIT ? 'selection' : scope;
}
