/**
 * Array (grid and circular) of the selection, pure: where the copies go. Canvas coordinates (mm, y down)
 * unless noted; affine matrices like SVG (x' = a x + c y + e, y' = b x + d y + f).
 */

export interface ArraySettings {
    mode: 'grid' | 'circular';
    // grid: objects per row / column (the original included) and the gaps between the boxes (mm)
    columns: number;
    rows: number;
    gapX: number;
    gapY: number;
    // circular: objects on the circle (the original included), total angle (degrees, counter-clockwise)
    count: number;
    angle: number;
    // circle centre, canvas coordinates
    centreX: number;
    centreY: number;
    rotate: boolean;
    // group the original and the copies
    group: boolean;
}

export interface Matrix {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
}

export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type ArrayProblem = 'none' | 'gap' | 'angle' | 'tooMany';

// more copies would make the editor slow
export const MAX_ARRAY_COPIES = 500;

const whole = (value: number) => Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));

export function applyMatrix(m: Matrix, p: { x: number; y: number }): { x: number; y: number } {
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

const translate = (dx: number, dy: number): Matrix => ({ a: 1, b: 0, c: 0, d: 1, e: dx, f: dy });

export function arrayCopyCount(s: ArraySettings): number {
    return s.mode === 'grid' ? whole(s.columns) * whole(s.rows) - 1 : whole(s.count) - 1;
}

/** Angle between neighbours: a full circle spreads the objects evenly, a part puts the first and last on its ends. */
export function circularStep(count: number, angle: number): number {
    const n = whole(count);
    if (n < 2) {
        return 0;
    }
    return Math.abs(angle) >= 360 - 1e-9 ? angle / n : angle / (n - 1);
}

/** Transforms of the copies (not of the original), in order: row by row, or around the circle. */
export function arrayTransforms(s: ArraySettings, box: Box): Matrix[] {
    const result: Matrix[] = [];
    if (s.mode === 'grid') {
        const stepX = box.width + s.gapX;
        const stepY = box.height + s.gapY;
        for (let row = 0; row < whole(s.rows); row++) {
            for (let col = 0; col < whole(s.columns); col++) {
                if (row > 0 || col > 0) {
                    result.push(translate(col * stepX, row * stepY));
                }
            }
        }
        return result;
    }
    const step = circularStep(s.count, s.angle);
    const cx = s.centreX;
    const cy = s.centreY;
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    for (let k = 1; k < whole(s.count); k++) {
        // counter-clockwise on the screen is clockwise in canvas coordinates (y down)
        const t = (k * step * Math.PI) / 180;
        const cos = Math.cos(t);
        const sin = Math.sin(t);
        if (s.rotate) {
            result.push({ a: cos, b: -sin, c: sin, d: cos, e: cx - cos * cx - sin * cy, f: cy + sin * cx - cos * cy });
        } else {
            // the selection centre moves along the circle, the copies keep their direction
            const nx = cx + cos * (sx - cx) + sin * (sy - cy);
            const ny = cy - sin * (sx - cx) + cos * (sy - cy);
            result.push(translate(nx - sx, ny - sy));
        }
    }
    return result;
}

/** Why no copies can be made, or null. */
export function arrayProblem(s: ArraySettings, box: Box): ArrayProblem | null {
    const copies = arrayCopyCount(s);
    if (copies <= 0) {
        return 'none';
    }
    if (copies > MAX_ARRAY_COPIES) {
        return 'tooMany';
    }
    if (s.mode === 'grid') {
        // a step of 0 or less puts copies on the same place
        if ((whole(s.columns) > 1 && !(box.width + s.gapX > 1e-6)) || (whole(s.rows) > 1 && !(box.height + s.gapY > 1e-6))) {
            return 'gap';
        }
        return null;
    }
    if (!Number.isFinite(s.angle) || Math.abs(s.angle) < 1e-6) {
        return 'angle';
    }
    return null;
}

/** Default circle centre: one selection width to the right of the selection centre. */
export function defaultArrayCentre(box: Box): { x: number; y: number } {
    return { x: box.x + box.width * 1.5, y: box.y + box.height / 2 };
}

/**
 * Position (logical, centre of the object, Y up) and rotation (radians, counter-clockwise) of a copy
 * moved by a canvas matrix.
 */
export function moveTransformation(
    t: { positionX: number; positionY: number; rotationZ: number },
    m: Matrix,
    size: { x: number; y: number }
): { positionX: number; positionY: number; rotationZ: number } {
    const p = applyMatrix(m, { x: t.positionX + size.x, y: size.y - t.positionY });
    return {
        positionX: p.x - size.x,
        positionY: size.y - p.y,
        rotationZ: t.rotationZ - Math.atan2(m.b, m.a),
    };
}

/**
 * What the array copies: free objects and whole groups (a selected group, or all its members selected).
 * Null when nothing is selected or only some members of a group are (member selection).
 */
export function arrayEntities<M extends { modelID: string }, G extends { modelID: string; children: M[] }>(
    selected: M[],
    groups: G[],
    selectedGroupID: string | null
): (M | G)[] | null {
    if (selected.length === 0) {
        return null;
    }
    const entities: (M | G)[] = [];
    for (const model of selected) {
        const group = groups.find(g => g.children.some(child => child.modelID === model.modelID));
        if (!group) {
            entities.push(model);
            continue;
        }
        const complete = group.modelID === selectedGroupID || group.children.every(child => selected.some(m => m.modelID === child.modelID));
        if (!complete) {
            return null;
        }
        if (!entities.includes(group)) {
            entities.push(group);
        }
    }
    return entities;
}
