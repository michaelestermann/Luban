/**
 * Pure helpers of the measure tool (no DOM).
 */
import { formatMm } from './geometry-length';

export interface Point {
    x: number;
    y: number;
}

export type SnapKind = 'end' | 'center' | 'corner' | 'mid';

export interface SnapPoint extends Point {
    kind: SnapKind;
}

export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface MeasureInfo {
    distance: number;
    // logical directions: X to the right, Y up
    dx: number;
    dy: number;
    // degrees, counter-clockwise from +X, -180..180
    angle: number;
}

// a and b in canvas coordinates (Y down)
export function measureInfo(a: Point, b: Point): MeasureInfo {
    const dx = b.x - a.x;
    const dy = a.y - b.y;
    const distance = Math.hypot(dx, dy);
    const angle = distance === 0 ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI;
    return { distance, dx, dy, angle };
}

export function formatMeasure(m: MeasureInfo): { distance: string; details: string } {
    return {
        distance: `${formatMm(m.distance)} mm`,
        details: `Δx ${formatMm(m.dx)} · Δy ${formatMm(m.dy)} · ${formatMm(m.angle)}°`,
    };
}

export function boxSnapPoints(box: Box): SnapPoint[] {
    const { x, y, width: w, height: h } = box;
    return [
        { x, y, kind: 'corner' },
        { x: x + w, y, kind: 'corner' },
        { x: x + w, y: y + h, kind: 'corner' },
        { x, y: y + h, kind: 'corner' },
        { x: x + w / 2, y, kind: 'mid' },
        { x: x + w, y: y + h / 2, kind: 'mid' },
        { x: x + w / 2, y: y + h, kind: 'mid' },
        { x, y: y + h / 2, kind: 'mid' },
        { x: x + w / 2, y: y + h / 2, kind: 'center' },
    ];
}

// nearest candidate within tolerance (same units as the points), null if none
export function nearestSnap<T extends Point>(candidates: T[], p: Point, tolerance: number): T | null {
    let best: T | null = null;
    let bestDistance = tolerance;
    for (const c of candidates) {
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d <= bestDistance) {
            best = c;
            bestDistance = d;
        }
    }
    return best;
}
