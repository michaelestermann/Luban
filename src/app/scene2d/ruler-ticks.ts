/**
 * Pure helpers for the rulers and the grid of the 2D (laser/CNC) canvas: pick label and grid
 * steps that keep a readable on-screen spacing at any zoom, and the label values of an axis.
 */

const EPS = 1e-9;

const MAX_STEP = 10000;

/** Nice steps in mm: 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, ... */
const NICE_STEPS: number[] = (() => {
    const steps = [];
    for (let exp = -1; exp <= 4; exp++) {
        const decade = 10 ** exp;
        const mantissas = exp >= 1 ? [1, 2, 2.5, 5] : [1, 2, 5];
        for (const m of mantissas) {
            const s = Math.round(m * decade * 1000) / 1000;
            if (s <= MAX_STEP) {
                steps.push(s);
            }
        }
    }
    return steps;
})();

const roundValue = (v: number) => Math.round(v * 1e9) / 1e9;

/**
 * Smallest nice step (mm) whose on-screen spacing is at least `minPx`.
 */
export function chooseStep(pxPerMm: number, minPx: number): number {
    if (!(pxPerMm > 0)) {
        return MAX_STEP;
    }
    for (const s of NICE_STEPS) {
        if (s * pxPerMm >= minPx - EPS) {
            return s;
        }
    }
    return MAX_STEP;
}

/**
 * Smallest nice step that divides `majorStep` and is at least `minPx` apart on screen,
 * falling back to the major step.
 */
export function chooseMinorStep(pxPerMm: number, majorStep: number, minPx: number): number {
    for (const s of NICE_STEPS) {
        if (s >= majorStep) {
            break;
        }
        const n = majorStep / s;
        if (Math.abs(n - Math.round(n)) < 1e-6 && s * pxPerMm >= minPx - EPS) {
            return s;
        }
    }
    return majorStep;
}

/**
 * Multiples of `step` inside [min, max] (inclusive, tolerant to float noise), ascending.
 */
export function multiplesInRange(min: number, max: number, step: number): number[] {
    if (!(step > 0) || max < min) {
        return [];
    }
    const from = Math.ceil(min / step - 1e-6);
    const to = Math.floor(max / step + 1e-6);
    const values = [];
    for (let k = from; k <= to; k++) {
        values.push(roundValue(k * step) || 0);
    }
    return values;
}

/**
 * Label values of an axis spanning [min, max]: every multiple of `step` plus both ends.
 * The ends always get a label; a step label closer than `minGapPx` to an end is dropped.
 */
export function axisLabelValues(min: number, max: number, step: number, pxPerMm: number, minGapPx: number): number[] {
    if (max - min < EPS) {
        return [roundValue(min) || 0];
    }
    const minGap = pxPerMm > 0 ? minGapPx / pxPerMm : 0;
    const inner = multiplesInRange(min, max, step)
        .filter(v => v - min >= minGap - EPS && max - v >= minGap - EPS);
    return [roundValue(min) || 0, ...inner, roundValue(max) || 0];
}

/**
 * Label text: at most two decimals, no trailing zeros, never "-0".
 */
export function formatTick(v: number): string {
    const r = Math.round(v * 100) / 100;
    return String(r === 0 ? 0 : r);
}
