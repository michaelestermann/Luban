/**
 * The box of an object as the canvas shows it right now. While an object is moved, resized or rotated the
 * editor only changes its SVG transform list (the model's transformation is written on mouse-up), so the
 * origin marker reads the element's geometry to stay on the bound object's point during the gesture.
 */
import type { BoxLike } from '../../../lib/object-origin';

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
export interface MatrixLike { a: number; b: number; c: number; d: number; e: number; f: number }
export interface RectLike { x: number; y: number; width: number; height: number }

/** Axis-aligned bounds of a rect after an affine matrix (rotation and mirroring included). */
export function transformedBox(rect: RectLike, m: MatrixLike): Bounds {
    const corners = [
        [rect.x, rect.y], [rect.x + rect.width, rect.y],
        [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height],
    ].map(([x, y]) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }));
    const xs = corners.map(p => p.x);
    const ys = corners.map(p => p.y);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Canvas bounds (mm, y down, model (x, y) = canvas (x + size.x, size.y − y)) as a model box. */
export function canvasBoxToModel(b: Bounds, size: { x: number; y: number }): BoxLike {
    return {
        min: { x: b.minX - size.x, y: size.y - b.maxY },
        max: { x: b.maxX - size.x, y: size.y - b.minY },
    };
}

/**
 * The model box of an element as drawn, relative to the SVG content group (whose coordinates are canvas
 * mm); null when it cannot be measured (detached, not rendered, empty).
 */
export function liveElementBox(elem: SVGGraphicsElement | null | undefined, contentGroup: SVGGraphicsElement | null | undefined,
    size: { x: number; y: number }): BoxLike | null {
    if (!elem || !contentGroup || !elem.isConnected || typeof elem.getBBox !== 'function') {
        return null;
    }
    try {
        const own = elem.getScreenCTM();
        const base = contentGroup.getScreenCTM();
        const rect = elem.getBBox();
        if (!own || !base || (!rect.width && !rect.height)) {
            return null;
        }
        const m = base.inverse().multiply(own);
        return canvasBoxToModel(transformedBox(rect, m), size);
    } catch (e) {
        // not rendered (display none): no live geometry
        return null;
    }
}
