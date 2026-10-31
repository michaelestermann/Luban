/**
 * Where to put a label that follows the cursor (Measure, Snap distances): never over the cursor, the
 * snap marker or the point being placed. Pure, in screen pixels of the overlay.
 */

export interface LabelPoint {
    x: number;
    y: number;
}

export interface LabelSize {
    width: number;
    height: number;
}

export interface LabelRect extends LabelPoint, LabelSize {}

export type Quadrant = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface LabelPlacement extends LabelPoint {
    quadrant: Quadrant;
}

export interface PlaceLabelOptions {
    cursor: LabelPoint;
    // snap marker, the point being placed, other end points: kept clear like the cursor
    avoid?: (LabelPoint | null | undefined)[];
    // lines the label should rather not cover (the line being drawn)
    segments?: [LabelPoint, LabelPoint][];
    size: LabelSize;
    // the visible part of the canvas
    view: LabelRect;
    // free space around the cursor and the points
    gap?: number;
    // the arrow drawn right of and below the cursor's hot spot
    cursorSize?: LabelSize;
}

// clear zone around the cursor and the snap point (screen px)
export const LABEL_GAP = 16;
// the system arrow below and right of the hot spot
export const CURSOR_SIZE: LabelSize = { width: 14, height: 22 };

// distance of a point to a rect, 0 inside
function rectPointDistance(r: LabelRect, p: LabelPoint): number {
    const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
    const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
    return Math.hypot(dx, dy);
}

function rectRectDistance(a: LabelRect, b: LabelRect): number {
    const dx = Math.max(a.x - (b.x + b.width), 0, b.x - (a.x + a.width));
    const dy = Math.max(a.y - (b.y + b.height), 0, b.y - (a.y + a.height));
    return Math.hypot(dx, dy);
}

/**
 * True when the label rect is closer than gap to one of the points (a label anchored to geometry that
 * the cursor or the snap marker is on).
 */
export function labelCovers(rect: LabelRect, points: (LabelPoint | null | undefined)[], gap: number = LABEL_GAP): boolean {
    return points.some(p => !!p && rectPointDistance(rect, p) < gap - 1e-9);
}

function segmentHitsRect(a: LabelPoint, b: LabelPoint, r: LabelRect): boolean {
    // Liang-Barsky clipping of the segment against the rect
    let t0 = 0;
    let t1 = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const edges: [number, number][] = [
        [-dx, a.x - r.x],
        [dx, r.x + r.width - a.x],
        [-dy, a.y - r.y],
        [dy, r.y + r.height - a.y],
    ];
    for (const [p, q] of edges) {
        if (Math.abs(p) < 1e-12) {
            if (q < 0) {
                return false;
            }
        } else {
            const t = q / p;
            if (p < 0) {
                t0 = Math.max(t0, t);
            } else {
                t1 = Math.min(t1, t);
            }
            if (t0 > t1) {
                return false;
            }
        }
    }
    return true;
}

// a < b, compared entry by entry
function lexLess(a: number[], b: number[]): boolean {
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return a[i] < b[i];
        }
    }
    return false;
}

const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.max(lo, Math.min(v, hi)));

/**
 * Bottom-right of the cursor by default; another quadrant when that one would leave the view or come
 * near the cursor, the snap marker or an avoided point; a side away from the drawn line if possible.
 */
export function placeLabel(options: PlaceLabelOptions): LabelPlacement {
    const { cursor, size, view } = options;
    const gap = options.gap ?? LABEL_GAP;
    const cursorSize = options.cursorSize || { width: 0, height: 0 };
    const points = [cursor, ...(options.avoid || []).filter((p): p is LabelPoint => !!p)];
    const segments = options.segments || [];
    const cursorBody: LabelRect = { x: cursor.x, y: cursor.y, width: cursorSize.width, height: cursorSize.height };
    const { width: w, height: h } = size;

    const quadrants: { quadrant: Quadrant, x: (extra: number) => number, y: (extra: number) => number }[] = [
        { quadrant: 'bottom-right', x: e => cursor.x + gap + e, y: e => cursor.y + cursorSize.height + gap + e },
        { quadrant: 'bottom-left', x: e => cursor.x - gap - w - e, y: e => cursor.y + gap + e },
        { quadrant: 'top-right', x: e => cursor.x + gap + e, y: e => cursor.y - gap - h - e },
        { quadrant: 'top-left', x: e => cursor.x - gap - w - e, y: e => cursor.y - gap - h - e },
    ];
    let best: { placement: LabelPlacement, score: number[] } | null = null;
    // close to the cursor first, a step further out when the near places are taken
    [0, gap * 2, gap * 5].forEach((extra, ring) => {
        quadrants.forEach((q, index) => {
            const rawX = q.x(extra);
            const rawY = q.y(extra);
            const x = clamp(rawX, view.x, view.x + view.width - w);
            const y = clamp(rawY, view.y, view.y + view.height - h);
            const rect = { x, y, width: w, height: h };
            const pointHits = points.filter(p => rectPointDistance(rect, p) < gap - 1e-9).length
                + (cursorSize.width > 0 && rectRectDistance(rect, cursorBody) < gap - 1e-9 ? 1 : 0);
            const grown = { x: x - 4, y: y - 4, width: w + 8, height: h + 8 };
            const segmentHits = segments.filter(([a, b]) => segmentHitsRect(a, b, grown)).length;
            const moved = x !== rawX || y !== rawY ? 1 : 0;
            const score = [pointHits, segmentHits, moved, ring, index];
            if (!best || lexLess(score, best.score)) {
                best = { placement: { x, y, quadrant: q.quadrant }, score };
            }
        });
    });
    return best.placement;
}
