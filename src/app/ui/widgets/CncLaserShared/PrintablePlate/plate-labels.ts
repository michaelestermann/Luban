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

export interface PlateRange {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

export interface PlateAxisLabel {
    // the number shown (mm from the origin, as in the G-code)
    value: number;
    // where it sits on the plate (plate coordinates)
    at: number;
}

const multiplesIn = (from: number, to: number, step: number): number[] => {
    const values = [];
    for (let v = Math.ceil(from / step - 1e-9) * step; v <= to + 1e-9; v += step) {
        values.push(v === 0 ? 0 : v); // no -0
    }
    return values;
};

/**
 * Axes and labels of the plate: they run through the origin, the workpiece origin (0/0 of the plate)
 * or an object origin point (`origin`, plate coordinates), and count from it like the G-code and the
 * rulers of the 2D canvas. Labels at the multiples of `step` inside the workpiece (`range`); 0 is
 * labelled on the Y axis only. X labels go above the axis when it is on the top border, Y labels
 * right of it when it is on the right border.
 */
export function plateAxisLabels(range: PlateRange, origin: { x: number; y: number } | null, step: number) {
    const axis = { x: origin ? origin.x : 0, y: origin ? origin.y : 0 };
    const x = multiplesIn(range.minX - axis.x, range.maxX - axis.x, step)
        .filter(value => value !== 0)
        .map(value => ({ value, at: axis.x + value }));
    const y = multiplesIn(range.minY - axis.y, range.maxY - axis.y, step)
        .map(value => ({ value, at: axis.y + value }));
    return {
        axis,
        x: x as PlateAxisLabel[],
        y: y as PlateAxisLabel[],
        top: Math.abs(axis.y - range.maxY) < 1e-6,
        right: Math.abs(axis.x - range.maxX) < 1e-6,
    };
}
