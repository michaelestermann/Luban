/**
 * "Round corners" for whole shapes (pure, no DOM): every sharp corner between two straight segments
 * of a path gets an arc of one radius (the point edit "Round" for all corners at once), plus the
 * radius limits of the dialog.
 */
import { parsePath, PathData, roundCorner, serializePath } from './path-geometry';
import { CornerInfo, maxCornerRadius, readCorners, roundedRectPathD } from './rect-corners';
import { isPenFormat, normalizePenPath } from './point-edit';

export const DEFAULT_ROUND_RADIUS = 2;

/** Path data as one chain per subpath (pen tool paths write each segment on its own); null if it can't be read. */
function readChains(d: string): PathData | null {
    let path: PathData;
    try {
        path = parsePath(d || '');
    } catch (e) {
        return null;
    }
    return isPenFormat(path) ? normalizePenPath(path) : path;
}

export interface SharpCorner {
    subpathIndex: number;
    nodeIndex: number;
    // angle between the two sides (radians, 0 .. π)
    alpha: number;
    // lengths of the incoming and outgoing side
    lenIn: number;
    lenOut: number;
}

/** Corners between two straight segments that are not in line (the ends of an open subpath are no corners). */
export function sharpCorners(path: PathData): SharpCorner[] {
    const result: SharpCorner[] = [];
    path.forEach((sub, subpathIndex) => {
        const n = sub.nodes.length;
        if (n < 3) {
            return;
        }
        for (let i = 0; i < n; i++) {
            if (!sub.closed && (i === 0 || i === n - 1)) {
                continue;
            }
            const c = sub.nodes[i];
            const p = sub.nodes[(i - 1 + n) % n];
            const q = sub.nodes[(i + 1) % n];
            if (c.in || c.out || p.out || q.in) {
                continue;
            }
            const lenIn = Math.hypot(p.x - c.x, p.y - c.y);
            const lenOut = Math.hypot(q.x - c.x, q.y - c.y);
            if (lenIn < 1e-9 || lenOut < 1e-9) {
                continue;
            }
            const dot = ((p.x - c.x) * (q.x - c.x) + (p.y - c.y) * (q.y - c.y)) / (lenIn * lenOut);
            const alpha = Math.acos(Math.max(-1, Math.min(1, dot)));
            if (alpha < 1e-6 || Math.PI - alpha < 1e-6) {
                continue;
            }
            result.push({ subpathIndex, nodeIndex: i, alpha, lenIn, lenOut });
        }
    });
    return result;
}

/**
 * Rounds every sharp corner with radius r. A side between two rounded corners is shared half and half,
 * so short sides give a smaller radius (`clamped`, `minRadius` is the smallest one used).
 * null if there is no corner or r is not positive.
 */
export function roundAllCorners(path: PathData, r: number): { path: PathData; count: number; minRadius: number; clamped: boolean } | null {
    if (!(r > 0)) {
        return null;
    }
    const corners = sharpCorners(path);
    if (corners.length === 0) {
        return null;
    }
    const isCorner = new Set(corners.map(c => `${c.subpathIndex}:${c.nodeIndex}`));
    const plan = corners.map((corner) => {
        const sub = path[corner.subpathIndex];
        const n = sub.nodes.length;
        const prev = (corner.nodeIndex - 1 + n) % n;
        const next = (corner.nodeIndex + 1) % n;
        const limitIn = isCorner.has(`${corner.subpathIndex}:${prev}`) ? corner.lenIn / 2 : corner.lenIn;
        const limitOut = isCorner.has(`${corner.subpathIndex}:${next}`) ? corner.lenOut / 2 : corner.lenOut;
        const tanHalf = Math.tan(corner.alpha / 2);
        const tangent = Math.min(r / tanHalf, limitIn, limitOut);
        return { ...corner, radius: tangent * tanHalf };
    });
    // from the last point to the first: earlier indexes stay valid while points are replaced
    let result = path;
    const ordered = plan.slice().sort((a, b) => (b.subpathIndex - a.subpathIndex) || (b.nodeIndex - a.nodeIndex));
    for (const corner of ordered) {
        const rounded = roundCorner(result, corner.subpathIndex, corner.nodeIndex, corner.radius);
        if (rounded) {
            result = rounded.path;
        }
    }
    const minRadius = Math.min(...plan.map(c => c.radius));
    return { path: result, count: plan.length, minRadius, clamped: minRadius < r - 1e-6 };
}

/** roundAllCorners on path data; null if the path can't be read or has nothing to round. */
export function roundAllCornersD(d: string, r: number): { d: string; count: number; minRadius: number; clamped: boolean } | null {
    const path = readChains(d);
    const result = path && roundAllCorners(path, r);
    if (!result) {
        return null;
    }
    return { d: serializePath(result.path), count: result.count, minRadius: result.minRadius, clamped: result.clamped };
}

/** The typed radius between 0 and max (Infinity: no maximum). */
export function clampRoundRadius(value: number, max: number): { radius: number; clamped: boolean } {
    if (!Number.isFinite(value)) {
        return { radius: 0, clamped: false };
    }
    const radius = Math.min(max, Math.max(0, value));
    return { radius, clamped: radius !== value };
}

/** Largest radius every rectangle can take: half the shorter side of the smallest one (Infinity without rectangles). */
export function roundRadiusLimit(rects: { width: number; height: number }[]): number {
    return rects.reduce((max, rect) => Math.min(max, Math.max(0, Math.min(rect.width, rect.height) / 2)), Infinity);
}

/** The radius the dialog starts with: the first rectangle that is already rounded, else 2 mm. */
export function initialRoundRadius(currentRadii: number[]): number {
    const current = currentRadii.find(r => r > 0);
    return current ? Math.round(current * 100) / 100 : DEFAULT_ROUND_RADIUS;
}

interface RoundableElement {
    nodeName: string;
    getAttribute: (name: string) => string | null;
}

interface RoundableModel {
    visible?: boolean;
    elem?: RoundableElement | null;
}

export type RoundTarget<M extends RoundableModel = RoundableModel> =
    | { model: M; kind: 'rect'; corners: CornerInfo }
    | { model: M; kind: 'path'; d: string };

/**
 * What "Round corners" changes in the selection: rectangles (also the paths made from rectangles with
 * different corners) and paths that can be point edited with at least one sharp line-line corner.
 * Hidden objects, images, text and curves only are skipped.
 */
export function roundTargets<M extends RoundableModel>(models: M[], isPointEditable: (elem: RoundableElement) => boolean): RoundTarget<M>[] {
    const result: RoundTarget<M>[] = [];
    for (const model of models || []) {
        const elem = model?.elem;
        if (!elem || model.visible === false) {
            continue;
        }
        const corners = readCorners(elem.nodeName, (name) => elem.getAttribute(name));
        if (corners) {
            result.push({ model, kind: 'rect', corners });
            continue;
        }
        if (elem.nodeName !== 'path' || !isPointEditable(elem)) {
            continue;
        }
        const d = elem.getAttribute('d') || '';
        const path = readChains(d);
        if (path && sharpCorners(path).length > 0) {
            result.push({ model, kind: 'path', d });
        }
    }
    return result;
}

/** The rounded outline of a target (element coordinates) and whether it got a smaller radius; null for r <= 0. */
export function roundTargetResult(target: RoundTarget, r: number): { d: string; clamped: boolean } | null {
    if (!(r > 0)) {
        return null;
    }
    if (target.kind === 'rect') {
        const { x, y, width, height } = target.corners;
        const max = maxCornerRadius(width, height);
        const radius = Math.min(r, max);
        return { d: roundedRectPathD(x, y, width, height, { tl: radius, tr: radius, br: radius, bl: radius }), clamped: r > max + 1e-9 };
    }
    const rounded = roundAllCornersD(target.d, r);
    return rounded && { d: rounded.d, clamped: rounded.clamped };
}
