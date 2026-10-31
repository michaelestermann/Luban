/**
 * Rounded corners of rectangles (pure, no DOM): radii, clamping, the path of a rectangle with four
 * different radii (quarter circles as cubics) and recognising such a path again.
 */
import { parsePath, PathData, PathNode, serializePath } from './path-geometry';

// top left, top right, bottom right, bottom left (SVG coordinates, y down)
export interface CornerRadii {
    tl: number;
    tr: number;
    br: number;
    bl: number;
}

export type CornerKey = keyof CornerRadii;

export const CORNER_KEYS: CornerKey[] = ['tl', 'tr', 'br', 'bl'];

// marks a path made from a rectangle with different corner radii (kept in the config)
export const ROUNDED_RECT_ATTRIBUTE = 'data-rounded-rect';

const KAPPA = 0.5522847498;
// path data is written with 3 decimals: points closer than this are the same
const EPS = 5e-3;

export function maxCornerRadius(width: number, height: number): number {
    return Math.max(0, Math.min(width, height) / 2);
}

/** Every radius between 0 and half the shorter side; `clamped` if one had to change. */
export function clampRadii(radii: CornerRadii, width: number, height: number): { radii: CornerRadii; clamped: boolean } {
    const max = maxCornerRadius(width, height);
    let clamped = false;
    const result = {} as CornerRadii;
    for (const key of CORNER_KEYS) {
        const value = Number.isFinite(radii[key]) ? radii[key] : 0;
        result[key] = Math.min(max, Math.max(0, value));
        if (Number.isFinite(radii[key]) && result[key] !== radii[key]) {
            clamped = true;
        }
    }
    return { radii: result, clamped };
}

export function radiiEqual(radii: CornerRadii, eps: number = 1e-6): boolean {
    return CORNER_KEYS.every(key => Math.abs(radii[key] - radii.tl) <= eps);
}

// two points of one corner become one where they meet (radius = half the side, within EPS)
function mergeTouching(nodes: PathNode[]): PathNode[] {
    const result: PathNode[] = [];
    for (const n of nodes) {
        const last = result[result.length - 1];
        if (last && Math.hypot(last.x - n.x, last.y - n.y) < EPS) {
            last.out = n.out;
        } else {
            result.push({ ...n });
        }
    }
    const first = result[0];
    const last = result[result.length - 1];
    if (result.length > 1 && Math.hypot(last.x - first.x, last.y - first.y) < EPS) {
        first.in = last.in;
        result.pop();
    }
    return result;
}

function roundedRectPath(x: number, y: number, w: number, h: number, radii: CornerRadii): PathData {
    const { tl, tr, br, bl } = clampRadii(radii, w, h).radii;
    const nodes: PathNode[] = [];
    const corner = (r: number, cx: number, cy: number, a: { x: number; y: number }, b: { x: number; y: number }) => {
        if (r <= 0) {
            nodes.push({ x: cx, y: cy, in: null, out: null });
            return;
        }
        // from a (on the side before the corner) to b (on the side after it)
        const k = KAPPA;
        nodes.push({ x: a.x, y: a.y, in: null, out: { x: a.x + (cx - a.x) * k, y: a.y + (cy - a.y) * k } });
        nodes.push({ x: b.x, y: b.y, in: { x: b.x + (cx - b.x) * k, y: b.y + (cy - b.y) * k }, out: null });
    };
    // clockwise on the screen, starting with the top left corner
    corner(tl, x, y, { x, y: y + tl }, { x: x + tl, y });
    corner(tr, x + w, y, { x: x + w - tr, y }, { x: x + w, y: y + tr });
    corner(br, x + w, y + h, { x: x + w, y: y + h - br }, { x: x + w - br, y: y + h });
    corner(bl, x, y + h, { x: x + bl, y: y + h }, { x, y: y + h - bl });
    return [{ closed: true, nodes: mergeTouching(nodes) }];
}

/** Path data of a rectangle with rounded corners (radii clamped to half the shorter side). */
export function roundedRectPathD(x: number, y: number, width: number, height: number, radii: CornerRadii): string {
    return serializePath(roundedRectPath(x, y, width, height, radii));
}

const nearNum = (a: number, b: number) => Math.abs(a - b) <= EPS;
const nearPt = (p: { x: number; y: number } | null, q: { x: number; y: number } | null) => (!p && !q) || (!!p && !!q && nearNum(p.x, q.x) && nearNum(p.y, q.y));

/**
 * Box and radii of a path that is a (rounded) rectangle as made by roundedRectPathD (it may start
 * at another point); null for any other path.
 */
export function readRoundedRect(d: string): { x: number; y: number; width: number; height: number; radii: CornerRadii } | null {
    let path: PathData;
    try {
        path = parsePath(d || '');
    } catch (e) {
        return null;
    }
    if (path.length !== 1 || !path[0].closed || path[0].nodes.length < 4) {
        return null;
    }
    const nodes = path[0].nodes;
    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    const width = right - left;
    const height = bottom - top;
    if (width <= EPS || height <= EPS) {
        return null;
    }
    const onTop = nodes.filter(n => nearNum(n.y, top)).map(n => n.x);
    const onBottom = nodes.filter(n => nearNum(n.y, bottom)).map(n => n.x);
    if (onTop.length === 0 || onBottom.length === 0) {
        return null;
    }
    const radii: CornerRadii = {
        tl: Math.min(...onTop) - left,
        tr: right - Math.max(...onTop),
        br: right - Math.max(...onBottom),
        bl: Math.min(...onBottom) - left,
    };
    const expected = roundedRectPath(left, top, width, height, radii)[0].nodes;
    if (expected.length !== nodes.length) {
        return null;
    }
    // same points in the same order, maybe from another start point
    const offset = expected.findIndex(n => nearPt(n, nodes[0]));
    if (offset < 0) {
        return null;
    }
    const same = nodes.every((n, i) => {
        const e = expected[(i + offset) % expected.length];
        return nearPt(n, e) && nearPt(n.in, e.in) && nearPt(n.out, e.out);
    });
    return same ? { x: left, y: top, width, height, radii } : null;
}

/** Corners of a mirrored shape: what is on the left of the element is on the right on the screen. */
export function flipRadii(radii: CornerRadii, flipX: boolean, flipY: boolean): CornerRadii {
    let { tl, tr, br, bl } = radii;
    if (flipX) {
        [tl, tr, br, bl] = [tr, tl, bl, br];
    }
    if (flipY) {
        [tl, tr, br, bl] = [bl, br, tr, tl];
    }
    return { tl, tr, br, bl };
}

/** Radius of a <rect> from its rx / ry attributes (one given: both the same), clamped like SVG does. */
export function rectElementRadius(rx: string | null, ry: string | null, width: number, height: number): number {
    const x = Number(rx);
    const y = Number(ry);
    let value = y > 0 ? y : 0;
    if (x > 0) {
        value = x;
    }
    return Math.min(value, maxCornerRadius(width, height));
}

/** Equal radii stay on a <rect> (rx / ry); different ones need a path. A path stays a path. */
export function planCorners(current: 'rect' | 'path', radii: CornerRadii): { kind: 'rect'; radius: number } | { kind: 'path' } {
    if (current === 'rect' && radiiEqual(radii)) {
        return { kind: 'rect', radius: radii.tl };
    }
    return { kind: 'path' };
}

export interface CornerInfo {
    kind: 'rect' | 'path';
    // box and radii in the element's own coordinates
    x: number;
    y: number;
    width: number;
    height: number;
    radii: CornerRadii;
}

/** Corners of a <rect> or of a path made from one (marked, still a rounded rectangle); null otherwise. */
export function readCorners(tagName: string, getAttribute: (name: string) => string | null): CornerInfo | null {
    if (tagName === 'rect') {
        const num = (name: string) => Number(getAttribute(name)) || 0;
        const [x, y, width, height] = ['x', 'y', 'width', 'height'].map(num);
        if (!(width > 0) || !(height > 0)) {
            return null;
        }
        const r = rectElementRadius(getAttribute('rx'), getAttribute('ry'), width, height);
        return { kind: 'rect', x, y, width, height, radii: { tl: r, tr: r, br: r, bl: r } };
    }
    if (tagName === 'path' && getAttribute(ROUNDED_RECT_ATTRIBUTE) === 'true') {
        const info = readRoundedRect(getAttribute('d'));
        return info && { kind: 'path', ...info };
    }
    return null;
}
