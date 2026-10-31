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

/**
 * Where an item sits when the items put back after it are left out (undo of a delete step puts
 * the items back one after the other), so each goes back to this index.
 */
export function indexWithout<T>(list: T[], item: T, putBackLater: T[]): number {
    return list.filter(other => other === item || !putBackLater.includes(other)).indexOf(item);
}

/** A copy of list with item inserted at index (at the end when index is -1 or past the end). */
export function insertAt<T>(list: T[], item: T, index: number): T[] {
    const rest = list.filter(other => other !== item);
    const at = index < 0 ? rest.length : Math.min(index, rest.length);
    return [...rest.slice(0, at), item, ...rest.slice(at)];
}

type WithPositionZ = { transformation?: { positionZ?: number } };

/**
 * Models of a project file in layer order (back to front). A file saved with its layer order
 * (`ordered`) lists them back to front. Older files only kept positionZ in order: the objects with a
 * positionZ are sorted by it (stable) among their places in the file, objects without one (drawn
 * shapes had 0) keep their place.
 */
export function savedLayerOrder<T extends WithPositionZ>(models: T[], ordered: boolean): T[] {
    if (ordered) {
        return models.slice();
    }
    const z = (model: T) => model.transformation?.positionZ;
    const ranked = (model: T) => typeof z(model) === 'number' && z(model) > 0;
    const sorted = models
        .map((model, index) => ({ model, index }))
        .filter(item => ranked(item.model))
        .sort((a, b) => (z(a.model) - z(b.model)) || (a.index - b.index))
        .map(item => item.model);
    let next = 0;
    return models.map(model => (ranked(model) ? sorted[next++] : model));
}

/** Saved model configs (back to front) with positionZ following that order; the input stays unchanged. */
export function withLayerPositionZ<T extends WithPositionZ>(configs: T[], margin: number): T[] {
    return configs.map((config, i) => ({
        ...config,
        transformation: { ...config.transformation, positionZ: Math.round((i + 1) * margin * 1e6) / 1e6 },
    }));
}
