/**
 * Array on editor models (DOM side): what is copied, the selection box and the outlines for the preview.
 */
import { arrayEntities, Box } from './array-layout';
import { inLayerOrder, matrixToContent, modelOutline, OutlineModel } from './model-outline';
import { Pt } from './shape-ops';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ArrayModelGroup {
    models: any[];
    selectedGroupID?: string | null;
    getSelectedModelArray: () => any[];
    getModels: () => any[];
}

export interface ArraySelection {
    // free models and whole groups, back to front
    entities: any[];
    // their leaf models, back to front
    leaves: OutlineModel[];
}

/** The selection as the array copies it, or null (nothing selected, a single group member, hidden objects). */
export function arraySelection(modelGroup: ArrayModelGroup | null | undefined): ArraySelection | null {
    if (!modelGroup) {
        return null;
    }
    const selected = modelGroup.getSelectedModelArray?.() || [];
    if (selected.some(m => !m.elem || m.visible === false)) {
        return null;
    }
    const groups = (modelGroup.models || []).filter(m => m.type === '2d-group');
    const entities = arrayEntities(selected, groups, modelGroup.selectedGroupID ?? null);
    if (!entities) {
        return null;
    }
    const sortedEntities = inLayerOrder(entities, modelGroup.models || []);
    const leaves: any[] = [];
    for (const e of sortedEntities) {
        leaves.push(...(e.children || [e]));
    }
    return { entities: sortedEntities, leaves: inLayerOrder(leaves, modelGroup.getModels()) };
}

const boxCorners = (elem: SVGGraphicsElement): Pt[] => {
    const b = elem.getBBox();
    return [
        { x: b.x, y: b.y }, { x: b.x + b.width, y: b.y }, { x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height },
    ];
};

function cornersInContent(model: OutlineModel, contentGroup: Element | null): Pt[] {
    const m = matrixToContent(model.elem, contentGroup);
    return boxCorners(model.elem as unknown as SVGGraphicsElement).map(p => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }));
}

/** Axis-aligned box of the models (rotated boxes included) in content group coordinates. */
export function selectionBox(models: OutlineModel[], contentGroup: Element | null): Box | null {
    const points = models.reduce((all, m) => all.concat(cornersInContent(m, contentGroup)), [] as Pt[]);
    if (points.length === 0) {
        return null;
    }
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** Lines to draw for the preview: the outline of vector models, the box of the others. */
export async function previewOutlines(models: OutlineModel[], contentGroup: Element | null): Promise<{ points: Pt[]; closed: boolean }[]> {
    const lists = await Promise.all(models.map(async (model) => {
        const outline = await modelOutline(model, contentGroup).catch(() => null);
        if (outline && (outline.closed.length > 0 || outline.open.length > 0)) {
            return [
                ...outline.closed.map(points => ({ points, closed: true })),
                ...outline.open.map(points => ({ points, closed: false })),
            ];
        }
        return [{ points: cornersInContent(model, contentGroup), closed: true }];
    }));
    return lists.reduce((all, list) => all.concat(list), []);
}
