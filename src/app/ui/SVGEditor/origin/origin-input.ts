/**
 * Builds the input of the origin snap targets from the editor's model group: model bounding boxes (the
 * ones the tool paths use), groups, the selection and the workpiece (model coordinates).
 */
import { BoxLike, normalizedBox, unionBox } from '../../../lib/object-origin';
import { workpieceModelBox } from '../../../lib/work-origin';
import { OriginTargetInput } from '../snap/origin-targets';

type ModelLike = {
    modelID: string;
    modelName?: string;
    visible?: boolean;
    type?: string;
    boundingBox?: BoxLike;
    computeBoundingBox?: () => void;
    transformation?: { rotationZ?: number };
    children?: ModelLike[];
    name?: string;
};

export interface ModelGroupLike {
    models: ModelLike[];
    getModels: () => ModelLike[];
    getSelectedModelArray: () => ModelLike[];
    selectedGroupID?: string | null;
}

const boxOf = (model: ModelLike): BoxLike | null => {
    if (typeof model.computeBoundingBox === 'function') {
        model.computeBoundingBox();
    }
    const b = model.boundingBox;
    // a mirrored object has min > max: its frame points are the normalised box
    return b ? normalizedBox({ min: { x: b.min.x, y: b.min.y }, max: { x: b.max.x, y: b.max.y } }) : null;
};

export function buildOriginTargetInput(
    modelGroup: ModelGroupLike | null | undefined,
    coordinateSize: { x: number; y: number },
    sizeMultiplyFactor: { x: number; y: number } | undefined,
    insideGroups: boolean,
): OriginTargetInput {
    const workpiece = sizeMultiplyFactor ? workpieceModelBox(coordinateSize, sizeMultiplyFactor) : null;
    if (!modelGroup) {
        return { objects: [], groups: [], selection: null, workpiece, insideGroups };
    }
    const selectedGroupID = modelGroup.selectedGroupID || null;
    const selected = (modelGroup.getSelectedModelArray() || []).filter(m => m.visible !== false);
    const selectedIds = selected.map(m => m.modelID);
    const groupModels = (modelGroup.models || []).filter(m => m.type === '2d-group' && Array.isArray(m.children));
    const parentOf = new Map<string, string>();
    for (const group of groupModels) {
        for (const child of group.children) {
            parentOf.set(child.modelID, group.modelID);
        }
    }
    const boxes = new Map<string, BoxLike | null>();
    const objects = (modelGroup.getModels() || []).map((model) => {
        const box = boxOf(model);
        boxes.set(model.modelID, box);
        const isSelected = selectedIds.includes(model.modelID);
        // a member selected on its own (entered group) is a target like a free object
        const groupID = parentOf.get(model.modelID) && !(isSelected && !selectedGroupID) ? parentOf.get(model.modelID) : null;
        return {
            modelID: model.modelID,
            name: model.modelName || '',
            box,
            visible: model.visible !== false,
            selected: isSelected && !selectedGroupID,
            groupID,
            rotationZ: model.transformation?.rotationZ,
        };
    });
    const groups = groupModels.map((group) => {
        const visibleChildren = group.children.filter(c => c.visible !== false);
        return {
            groupID: group.modelID,
            name: group.name || '',
            memberIDs: group.children.map(c => c.modelID),
            box: unionBox(visibleChildren.map(c => boxes.get(c.modelID) ?? boxOf(c))),
            selected: group.modelID === selectedGroupID,
        };
    }).filter(g => g.box);
    const selection = selectedIds.length ? {
        modelIDs: selectedIds,
        groupID: selectedGroupID,
        box: unionBox(selectedIds.map(id => boxes.get(id) ?? null)),
    } : null;
    return { objects, groups, selection, workpiece, insideGroups };
}
