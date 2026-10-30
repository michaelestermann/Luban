import { canAddToToolPath } from './membership';

/**
 * Pure helpers for the step-1 Operations panel and the toolpath colour dots
 * in the object list.
 */

/** Stable operation colour palette, picked by toolpath index (milling order). */
export const OPERATION_COLORS = ['#1d4ed8', '#d97706', '#0891b2', '#be185d', '#15803d', '#7c3aed'];

export function operationColor(index: number): string {
    return OPERATION_COLORS[index % OPERATION_COLORS.length];
}

interface ToolPathLike {
    type: string;
    modelMap?: Map<string, unknown>;
    gcodeConfig?: { pathType?: string; sliceMode?: string };
}

interface ModelLike {
    modelID: string;
    mode?: string;
    sourceType?: string;
    children?: ModelLike[];
}

/** Ids of the toolpath's objects, in the toolpath's order. */
export function getMemberIds(toolPath: ToolPathLike): string[] {
    return toolPath?.modelMap ? [...toolPath.modelMap.keys()] : [];
}

/** Colours of the toolpaths (in milling order) that contain the model. */
export function getModelOperationColors(toolPaths: ToolPathLike[] | null | undefined, modelId: string): string[] {
    const colors = [];
    (toolPaths || []).forEach((toolPath, index) => {
        if (toolPath?.modelMap?.has(modelId)) {
            colors.push(operationColor(index));
        }
    });
    return colors;
}

/** Selected models with groups replaced by their children (as addSelectedModelsToToolPath does). */
export function expandSelection<T extends ModelLike>(models: T[] | null | undefined): T[] {
    const result: T[] = [];
    for (const model of models || []) {
        if (model.children?.length) {
            result.push(...(model.children as T[]));
        } else {
            result.push(model);
        }
    }
    return result;
}

/** A toolpath keeps at least one object; nothing is editable in a blocked mode. */
export function canRemoveMember(memberCount: number, blocked: boolean): boolean {
    return !blocked && memberCount > 1;
}

export type AddSelectedState = 'ok' | 'blocked' | 'no-selection' | 'incompatible' | 'already-added';

/**
 * Whether "+ Add selected" would add something to the toolpath, or why not.
 * Enabled when at least one selected object fits the toolpath type and is not yet in it.
 */
export function getAddSelectedState(toolPath: ToolPathLike, selectedModels: ModelLike[], blocked: boolean): AddSelectedState {
    if (blocked) {
        return 'blocked';
    }
    const models = expandSelection(selectedModels);
    if (models.length === 0) {
        return 'no-selection';
    }
    const compatible = models.filter((model) => canAddToToolPath(toolPath, model as { mode: string; sourceType: string }));
    if (compatible.length === 0) {
        return 'incompatible';
    }
    const members = getMemberIds(toolPath);
    return compatible.some((model) => !members.includes(model.modelID)) ? 'ok' : 'already-added';
}

/**
 * Method shown on an operation card: the vector path type (path / outline / fill / drill),
 * 'carve' for CNC image toolpaths, the slice mode for CNC 3D toolpaths. null when unknown.
 */
export function getOperationMethodId(toolPath: ToolPathLike, headType: string): string | null {
    const config = toolPath?.gcodeConfig || {};
    if (headType === 'cnc') {
        if (toolPath.type === 'image') {
            return 'carve';
        }
        if (toolPath.type === 'sculpt') {
            return config.sliceMode || null;
        }
        // the CNC Fill method is stored as pathType 'pocket'
        if (config.pathType === 'pocket') {
            return 'fill';
        }
    }
    return config.pathType || null;
}
