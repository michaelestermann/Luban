import CompoundOperation from '../../core/CompoundOperation';
import GroupSvgOperation from '../../scene/operations/GroupSvgOperation';
import UngroupSvgOperation from '../../scene/operations/UngroupSvgOperation';
import type ModelGroup2D from '../../models/ModelGroup2D';
import type SvgGroup from '../../models/SvgGroup';
import type SvgModel from '../../models/SvgModel';
import type SVGActionsFactory from '../../models/SVGActionsFactory';
import { baseActions } from './actions-base';

type HeadType = 'laser' | 'cnc';

/**
 * After any group/ungroup mutation, clear the SVG editor's stale
 * selection state and trigger a full render so the UI reflects the
 * new models[].
 */
function syncEditorAfterGroupChange(dispatch, headType: HeadType, getState, selectChildren?: SvgModel[]) {
    const state = getState()[headType];
    const svgActions: SVGActionsFactory = state.SVGActions;
    const modelGroup: ModelGroup2D = state.modelGroup;
    const workpiece = state.workpiece;

    // Save selectedGroupID before clearing — clearSelection resets it
    const savedGroupID = modelGroup.selectedGroupID;

    // Clear stale SVG selection handles / grips
    if (svgActions && typeof svgActions.clearSelection === 'function') {
        svgActions.clearSelection();
    }

    // Re-select the group's children so the user sees the group highlighted
    if (selectChildren && selectChildren.length > 0 && svgActions) {
        const isRotate = workpiece?.shape === 'cylinder';
        svgActions.addSelectedSvgModelsByModels(selectChildren, isRotate);
    }

    // Restore selectedGroupID that was cleared by clearSelection
    modelGroup.selectedGroupID = savedGroupID;

    // Push the updated ModelGroup2D state into Redux so React re-renders
    dispatch(baseActions.updateState(headType, { ...modelGroup.getState() }));
    dispatch(baseActions.render(headType));
}

export const groupActions = {
    /**
     * Group the currently selected leaf models at top-level. Pushes the
     * operation onto the operation-history stack so it is undoable.
     */
    groupSelectedModels: (headType: HeadType) => (dispatch, getState) => {
        const state = getState()[headType];
        const modelGroup: ModelGroup2D = state.modelGroup;
        const operationHistory = state.history;

        if (!modelGroup.canGroup()) return;

        const targetModels = modelGroup.selectedModelArray.slice() as SvgModel[];
        const op = new GroupSvgOperation({ modelGroup, targetModels });
        const compound = new CompoundOperation();
        compound.push(op);
        compound.registerCallbackAll(() => {
            // After group: selectedModelArray holds the group's children
            const children = modelGroup.selectedModelArray.slice() as SvgModel[];
            syncEditorAfterGroupChange(dispatch, headType, getState, children);
        });
        compound.redo();
        if (operationHistory && typeof operationHistory.push === 'function') {
            operationHistory.push(compound);
        }
    },

    /**
     * Dissolve the currently selected group back into its leaf models.
     */
    ungroupSelectedGroup: (headType: HeadType) => (dispatch, getState) => {
        const state = getState()[headType];
        const modelGroup: ModelGroup2D = state.modelGroup;
        const operationHistory = state.history;

        if (!modelGroup.canUngroup()) return;
        const selectedGroupID = modelGroup.selectedGroupID;
        if (!selectedGroupID) return;
        const target = modelGroup.models.find(
            (m): m is SvgGroup => (m as SvgGroup).modelID === selectedGroupID
                && typeof (m as SvgGroup).children !== 'undefined',
        );
        if (!target) return;

        const op = new UngroupSvgOperation({ modelGroup, target });
        const compound = new CompoundOperation();
        compound.push(op);
        compound.registerCallbackAll(() => {
            syncEditorAfterGroupChange(dispatch, headType, getState);
        });
        compound.redo();
        if (operationHistory && typeof operationHistory.push === 'function') {
            operationHistory.push(compound);
        }
    },

    enterGroup: (headType: HeadType, groupID: string) => (dispatch, getState) => {
        const modelGroup: ModelGroup2D = getState()[headType].modelGroup;
        modelGroup.setEnteredGroupId(groupID);

        // Dim elements outside the entered group
        const group = modelGroup.models.find(
            (m) => (m as SvgGroup).modelID === groupID && (m as SvgGroup).type === '2d-group',
        ) as SvgGroup | undefined;
        if (group) {
            const groupChildIDs = new Set(group.children.map((c) => c.modelID));
            const allLeafs = modelGroup.getModels();
            for (const model of allLeafs) {
                if (model.elem) {
                    if (!groupChildIDs.has(model.modelID)) {
                        (model.elem as SVGElement).style.opacity = '0.35';
                    } else {
                        (model.elem as SVGElement).style.opacity = '';
                    }
                }
            }
        }

        dispatch(baseActions.updateState(headType, { enteredGroupId: groupID }));
    },

    exitGroup: (headType: HeadType) => (dispatch, getState) => {
        const modelGroup: ModelGroup2D = getState()[headType].modelGroup;
        modelGroup.setEnteredGroupId(null);

        // Restore opacity on all elements
        const allLeafs = modelGroup.getModels();
        for (const model of allLeafs) {
            if (model.elem) {
                (model.elem as SVGElement).style.opacity = '';
            }
        }

        dispatch(baseActions.updateState(headType, { enteredGroupId: null }));
    },
};
