/**
 * How the selection bar shows its actions so that it fits on the canvas: level 0 labelled buttons,
 * level 1 the same buttons with icons only (label in the tooltip), level 2 those actions in an overflow
 * "⋯" menu. A level is used only when the one before does not fit.
 */
export const BAR_LEVELS = 3;

export interface BarFit {
    // the selection and its actions the measurement belongs to
    key: string;
    level: number;
    // measured width of the bar per level used so far
    widths: number[];
}

/**
 * The next state from a measurement of the bar as rendered now at `fit.level` (`width`) and the room it
 * has (`available`). Returns `fit` itself when nothing changes.
 */
export function nextBarFit(fit: BarFit | null, key: string, width: number, available: number): BarFit {
    if (!fit) {
        return { key, level: 0, widths: [width] };
    }
    if (fit.key !== key) {
        // another selection: render it with labels first, then measure
        return { key, level: 0, widths: [] };
    }
    const widths = fit.widths.slice(0, fit.level);
    widths[fit.level] = width;
    if (width > available && fit.level < BAR_LEVELS - 1) {
        return { key, level: fit.level + 1, widths };
    }
    if (fit.level > 0 && fit.widths[fit.level - 1] <= available) {
        return { key, level: fit.level - 1, widths: widths.slice(0, fit.level) };
    }
    return fit.widths[fit.level] === width ? fit : { key, level: fit.level, widths };
}
