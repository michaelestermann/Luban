/**
 * Mouse selection in the object list, as in Windows lists: a plain click selects only the
 * clicked row, Ctrl (Cmd) adds or removes one row, Shift selects every row from the anchor
 * (the last plainly or Ctrl-clicked row) to the clicked one.
 */
export type ListClickMode = 'single' | 'toggle' | 'range';

export function listClickMode(event: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): ListClickMode {
    if (event.shiftKey) {
        return 'range';
    }
    if (event.ctrlKey || event.metaKey) {
        return 'toggle';
    }
    return 'single';
}

/** The rows from anchor to target in list order (inclusive); only the target without an anchor in the list. */
export function selectionRange<T>(rows: T[], anchor: T | null, target: T): T[] {
    const to = rows.indexOf(target);
    if (to === -1) {
        return [];
    }
    const from = anchor === null ? -1 : rows.indexOf(anchor);
    if (from === -1) {
        return [target];
    }
    return rows.slice(Math.min(from, to), Math.max(from, to) + 1);
}

/**
 * The rows a Shift click selects: hidden rows are skipped, because hidden and visible objects are never
 * selected together; a Shift click on a hidden row selects that row alone.
 */
export function visibleRange<T extends { visible?: boolean }>(rows: T[], anchor: T | null, target: T): T[] {
    if (target.visible === false) {
        return rows.includes(target) ? [target] : [];
    }
    return selectionRange(rows, anchor, target).filter((row) => row.visible !== false);
}
