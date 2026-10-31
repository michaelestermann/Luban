/**
 * Pure helpers (no DOM) to turn draw tool shapes into paths and to close open paths.
 */
import {
    circleToPath, closeOpenSubpaths, ellipseToPath, hasOpenSubpaths, joinEnds, lineToPath, parsePath, rectToPath, serializePath
} from './path-geometry';
import { normalizePenPath } from './point-edit';
import { rectElementRadius, roundedRectPathD } from './rect-corners';

// attributes of a shape that the path's `d` replaces
export const SHAPE_GEOMETRY_ATTRIBUTES: Record<string, string[]> = {
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
    ellipse: ['cx', 'cy', 'rx', 'ry'],
    circle: ['cx', 'cy', 'r'],
    line: ['x1', 'y1', 'x2', 'y2'],
};

// default distance (canvas units = mm) for "Join ends"
export const JOIN_TOLERANCE = 1;

/**
 * The `d` of a path equal to the shape (in the shape's own coordinates), or null if the element is
 * no draw tool shape or has no size. Rounded corners become quarter circles (cubics).
 */
export function shapeToPathD(tagName: string, getAttribute: (name: string) => string | null): string | null {
    if (!SHAPE_GEOMETRY_ATTRIBUTES[tagName]) {
        return null;
    }
    const num = (name: string) => {
        const value = getAttribute(name);
        return value === null || value === '' ? 0 : Number(value);
    };
    const values = SHAPE_GEOMETRY_ATTRIBUTES[tagName].map(num);
    if (values.some((v) => !Number.isFinite(v))) {
        return null;
    }
    switch (tagName) {
        case 'rect': {
            const [x, y, width, height, rx, ry] = values;
            if (width <= 0 || height <= 0) {
                return null;
            }
            const r = rectElementRadius(String(rx), String(ry), width, height);
            return r > 0 ? roundedRectPathD(x, y, width, height, { tl: r, tr: r, br: r, bl: r }) : rectToPath(x, y, width, height);
        }
        case 'ellipse': {
            const [cx, cy, rx, ry] = values;
            return rx > 0 && ry > 0 ? ellipseToPath(cx, cy, rx, ry) : null;
        }
        case 'circle': {
            const [cx, cy, r] = values;
            return r > 0 ? circleToPath(cx, cy, r) : null;
        }
        default: {
            const [x1, y1, x2, y2] = values;
            return lineToPath(x1, y1, x2, y2);
        }
    }
}

const readPath = (d: string) => normalizePenPath(parsePath(d || ''));

/** Does the path have open subpaths, and are the ends of one within tolerance? */
export function openPathState(d: string, tolerance: number = JOIN_TOLERANCE): { open: boolean, canJoin: boolean } {
    const path = readPath(d);
    const open = hasOpenSubpaths(path);
    return { open, canJoin: open && joinEnds(path, tolerance).joined > 0 };
}

/** Closes every open subpath with a straight segment; null if nothing is open. */
export function closePathD(d: string): string | null {
    const path = readPath(d);
    return hasOpenSubpaths(path) ? serializePath(closeOpenSubpaths(path)) : null;
}

/** Closes the subpaths whose ends are within tolerance (ends meet in the middle); null if none. */
export function joinPathEndsD(d: string, tolerance: number = JOIN_TOLERANCE): string | null {
    const result = joinEnds(readPath(d), tolerance);
    return result.joined > 0 ? serializePath(result.path) : null;
}
