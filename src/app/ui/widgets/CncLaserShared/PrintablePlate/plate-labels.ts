/**
 * Pure helpers for the axis labels of the laser/CNC preview plate (three.js): they keep a
 * constant on-screen size like the rulers of the 2D canvas.
 */
import { chooseStep } from '../../../../scene2d/ruler-ticks';

/** Labels sit at multiples of this step (mm), as in the grid of the plate */
export const PLATE_LABEL_BASE_STEP = 50;
/** Labels at least this far apart on screen (CSS px) */
export const PLATE_LABEL_MIN_SPACING_PX = 60;

/**
 * World units (mm) covered by one screen pixel at `depth` (distance along the view direction)
 * of a perspective camera with the vertical field of view `fovDeg`; 0 when unknown.
 */
export function worldPerPixel(fovDeg: number, depth: number, viewportHeightPx: number): number {
    if (!(fovDeg > 0) || !(depth > 0) || !(viewportHeightPx > 0)) {
        return 0;
    }
    return (2 * depth * Math.tan((fovDeg * Math.PI) / 360)) / viewportHeightPx;
}

/**
 * Step (mm) of the shown labels: every 50 mm, or a larger nice step (a multiple of 50) when the
 * labels would get closer than the minimum spacing.
 */
export function plateLabelStep(pxPerMm: number): number {
    if (!(pxPerMm > 0)) {
        return PLATE_LABEL_BASE_STEP;
    }
    return Math.max(PLATE_LABEL_BASE_STEP, chooseStep(pxPerMm, PLATE_LABEL_MIN_SPACING_PX));
}

export function isPlateLabelShown(value: number, step: number): boolean {
    const n = value / step;
    return Math.abs(n - Math.round(n)) < 1e-6;
}
