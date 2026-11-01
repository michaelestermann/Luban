/* eslint-disable @typescript-eslint/no-explicit-any */
import type CompoundOperation from '../../core/CompoundOperation';
import { baseActions } from './actions-base';

/** The selection of the laser / CNC editor by IDs (objects may be removed and put back by undo / redo). */
export interface SelectionSnapshot {
    ids: string[];
    groupID: string | null;
}

export function snapshotSelection(modelGroup: any): SelectionSnapshot {
    const selected = modelGroup.getSelectedModelArray?.() || modelGroup.selectedModelArray || [];
    return { ids: selected.map(model => model.modelID), groupID: modelGroup.selectedGroupID ?? null };
}

/** Selects the recorded objects that exist now (and the recorded group if it exists). */
export function applySelection(modelGroup: any, svgActions: any, snapshot: SelectionSnapshot, isRotate = false): void {
    const leaves = modelGroup.getModels();
    const models = snapshot.ids.map(id => leaves.find(model => model.modelID === id)).filter(Boolean);
    const groupExists = snapshot.groupID !== null && modelGroup.models.some(entity => entity.modelID === snapshot.groupID && entity.children);
    svgActions.clearSelection();
    if (models.length > 0) {
        svgActions.addSelectedSvgModelsByModels(models, isRotate);
    }
    modelGroup.selectedGroupID = groupExists ? snapshot.groupID : null;
}

/**
 * Undo of `operations` selects again what was selected before (`before`, taken before the change),
 * redo what is selected now (call after the action set its selection).
 */
export const recordSelectionChange = (headType: 'laser' | 'cnc', operations: CompoundOperation, before: SelectionSnapshot) => (dispatch, getState) => {
    // the objects of the document this step belongs to
    const { modelGroup, SVGActions } = getState()[headType];
    operations.recordSelection(before, snapshotSelection(modelGroup), (snapshot: SelectionSnapshot) => {
        applySelection(modelGroup, SVGActions, snapshot, !!getState()[headType].materials?.isRotate);
        dispatch(baseActions.updateState(headType, { ...modelGroup.getState() }));
    });
};
