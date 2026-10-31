import { moveItem } from '../toolpaths/reorder';

/**
 * Layer order of the Laser/CNC objects: models[] runs from back to front (the object list shows
 * it with the front on top). The machining order inside an operation is its own member order.
 */
export function moveToEdge<T>(list: T[], items: T[], edge: 'front' | 'back'): T[] {
    const moving = list.filter(item => items.includes(item));
    if (moving.length === 0) {
        return list.slice();
    }
    const rest = list.filter(item => !items.includes(item));
    return edge === 'front' ? [...rest, ...moving] : [...moving, ...rest];
}

/** The front-most of the layers (back to front) that is hit, or null. */
export function frontmostAt<T>(models: T[], hit: (model: T) => boolean): T | null {
    for (let i = models.length - 1; i >= 0; i--) {
        if (hit(models[i])) {
            return models[i];
        }
    }
    return null;
}

/** Ids an operation machines, in its member order; hidden or removed objects are left out. */
export function orderedMemberIds(memberIds: string[], leafModels: { modelID: string, visible?: boolean }[]): string[] {
    const visible = new Set(leafModels.filter(model => model.visible === true).map(model => model.modelID));
    return memberIds.filter(id => visible.has(id));
}

/** Drag and drop in the object list, which shows models[] reversed (front on top). */
export function reorderFromDisplay<T>(models: T[], fromDisplay: number, toDisplay: number): T[] {
    return moveItem(models.slice().reverse(), fromDisplay, toDisplay).reverse();
}

/**
 * Layer order after models were replaced (combine, offset): removed ones leave, added ones go where
 * the anchor is (in its place if it was removed, right above it if it stays).
 */
export function replaceInLayers<T>(models: T[], removed: T[], added: T[], anchor: T): T[] {
    const index = models.indexOf(anchor);
    const keep = (item: T) => !removed.includes(item) && !added.includes(item);
    const below = (index === -1 ? models : models.slice(0, index + 1)).filter(keep);
    const above = (index === -1 ? [] : models.slice(index + 1)).filter(keep);
    return [...below, ...added, ...above];
}
