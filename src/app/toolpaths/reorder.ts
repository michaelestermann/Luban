/**
 * Index a dragged item ends up at when it is dropped before (after = false) or
 * after (after = true) the item at `over`, counted in the list without the
 * dragged item.
 */
export function reorderIndex(from: number, over: number, after: boolean): number {
    const insertAt = over + (after ? 1 : 0);
    return from < insertAt ? insertAt - 1 : insertAt;
}

/** Copy of `list` with the item at `from` moved to `to`; invalid indices return an unchanged copy. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
    const result = [...list];
    if (from < 0 || from >= list.length || to < 0 || to >= list.length) {
        return result;
    }
    const [item] = result.splice(from, 1);
    result.splice(to, 0, item);
    return result;
}
