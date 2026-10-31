/**
 * Pure length functions for the Geometry row and the measure tool (no DOM).
 *
 * All lengths are in the units of the input; the editor uses mm (1 canvas unit = 1 mm).
 */
import { PathData, Segment, Subpath, getSegment, parsePath, segmentCount } from '../path-edit/path-geometry';
import { normalizePenPath } from '../path-edit/point-edit';

// SVGParser output: a shape holds polylines (curves are already flattened)
export interface ParsedShape {
    visibility?: boolean;
    paths: { closed: boolean; points: number[][] }[];
}

export type GeometryKind = 'path' | 'circle' | 'ellipse' | 'rect' | 'svg' | 'multiple' | 'image' | 'text';

export interface GeometryInfo {
    kind: GeometryKind;
    width?: number;
    height?: number;
    // path, svg and multiple: total length, null while not known
    length?: number | null;
}

export type GeometryKey = 'length' | 'totalLength' | 'circumference' | 'perimeter' | 'radius' | 'width' | 'height';

export interface GeometryRow {
    key: GeometryKey;
    value: number;
}

// 5 point Gauss-Legendre on [0, 1]
const GAUSS = [
    { t: 0.5, w: 0.2844444444444444 },
    { t: 0.5 - 0.2692346550528416, w: 0.2393143352496832 },
    { t: 0.5 + 0.2692346550528416, w: 0.2393143352496832 },
    { t: 0.5 - 0.4530899229693320, w: 0.1184634425280945 },
    { t: 0.5 + 0.4530899229693320, w: 0.1184634425280945 },
];
const CUBIC_PIECES = 16;

function cubicSpeed(seg: Segment, t: number): number {
    const { from: p0, c1: p1, c2: p2, to: p3 } = seg;
    const u = 1 - t;
    const dx = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
    const dy = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
    return Math.hypot(dx, dy);
}

export function segmentLength(seg: Segment): number {
    if (!seg.c1 || !seg.c2) {
        return Math.hypot(seg.to.x - seg.from.x, seg.to.y - seg.from.y);
    }
    // integrate the speed piecewise, accurate far below 0.1 mm for editor sized curves
    let length = 0;
    for (let i = 0; i < CUBIC_PIECES; i++) {
        for (const g of GAUSS) {
            length += g.w * cubicSpeed(seg, (i + g.t) / CUBIC_PIECES);
        }
    }
    return length / CUBIC_PIECES;
}

export function subpathLength(sub: Subpath): number {
    let length = 0;
    const count = segmentCount(sub);
    for (let i = 0; i < count; i++) {
        length += segmentLength(getSegment(sub, i));
    }
    return length;
}

export function pathLength(path: PathData): number {
    return path.reduce((sum, sub) => sum + subpathLength(sub), 0);
}

export function pathDLength(d: string): number {
    if (!d || !d.trim()) {
        return 0;
    }
    return pathLength(parsePath(d));
}

// length of the outline of a path element: pen tool segments ("M a L b Z") are chained first, so each counts once
export function outlineDLength(d: string): number {
    if (!d || !d.trim()) {
        return 0;
    }
    return pathLength(normalizePenPath(parsePath(d)));
}

// Ramanujan's second approximation
export function ellipsePerimeter(rx: number, ry: number): number {
    const a = Math.abs(rx);
    const b = Math.abs(ry);
    if (a + b === 0) {
        return 0;
    }
    const h = ((a - b) / (a + b)) ** 2;
    return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

export function circleCircumference(r: number): number {
    return 2 * Math.PI * Math.abs(r);
}

export function rectPerimeter(width: number, height: number): number {
    return 2 * (Math.abs(width) + Math.abs(height));
}

export function polylineLength(points: number[][], sx: number = 1, sy: number = 1): number {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
        length += Math.hypot((points[i][0] - points[i - 1][0]) * sx, (points[i][1] - points[i - 1][1]) * sy);
    }
    return length;
}

// total length of SVGParser shapes; closed paths already end at their start point
export function shapesLength(shapes: ParsedShape[], sx: number, sy: number): number {
    let length = 0;
    for (const shape of shapes) {
        if (shape.visibility === false) {
            continue;
        }
        for (const p of shape.paths) {
            length += polylineLength(p.points, sx, sy);
        }
    }
    return length;
}

// null when any part is unknown (e.g. an imported file still loading)
export function sumLengths(lengths: (number | null)[]): number | null {
    if (lengths.length === 0 || lengths.some(l => l === null || l === undefined)) {
        return null;
    }
    return lengths.reduce((sum, l) => sum + l, 0);
}

export function formatMm(value: number): string {
    const s = value.toFixed(1);
    return s === '-0.0' ? '0.0' : s;
}

export function geometryRows(info: GeometryInfo): GeometryRow[] {
    const { kind, width = 0, height = 0, length = null } = info;
    switch (kind) {
        case 'circle':
            return [
                { key: 'circumference', value: circleCircumference(width / 2) },
                { key: 'radius', value: width / 2 },
            ];
        case 'ellipse':
            return [
                { key: 'circumference', value: ellipsePerimeter(width / 2, height / 2) },
                { key: 'width', value: width },
                { key: 'height', value: height },
            ];
        case 'rect':
            return [
                { key: 'perimeter', value: rectPerimeter(width, height) },
                { key: 'width', value: width },
                { key: 'height', value: height },
            ];
        case 'path':
        case 'svg':
            return length === null ? [] : [{ key: 'length', value: length }];
        case 'multiple':
            return length === null ? [] : [{ key: 'totalLength', value: length }];
        default:
            return [];
    }
}

// length the tool travels along the outline; undefined = no outline (raster image, text), null = not known yet
export function cutLength(info: GeometryInfo): number | null | undefined {
    const { kind, width = 0, height = 0, length = null } = info;
    switch (kind) {
        case 'circle':
        case 'ellipse':
            return ellipsePerimeter(width / 2, height / 2);
        case 'rect':
            return rectPerimeter(width, height);
        case 'path':
        case 'svg':
        case 'multiple':
            return length;
        default:
            return undefined;
    }
}

// one object: its own geometry; several: the total cut length of those with an outline
export function selectionGeometry(items: GeometryInfo[]): GeometryInfo | null {
    if (items.length === 1) {
        return items[0];
    }
    const lengths = items.map(cutLength).filter(l => l !== undefined);
    if (lengths.length === 0) {
        return null;
    }
    return { kind: 'multiple', length: sumLengths(lengths) };
}
