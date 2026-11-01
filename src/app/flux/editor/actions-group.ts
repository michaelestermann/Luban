import CompoundOperation from '../../core/CompoundOperation';
import GroupSvgOperation from '../../scene/operations/GroupSvgOperation';
import UngroupSvgOperation from '../../scene/operations/UngroupSvgOperation';
import type ModelGroup2D from '../../models/ModelGroup2D';
import type SvgGroup from '../../models/SvgGroup';
import type SvgModel from '../../models/SvgModel';
import type SVGActionsFactory from '../../models/SVGActionsFactory';
import { baseActions } from './actions-base';
import { recordSelectionChange, snapshotSelection } from './selection-history';
import { originApplier, t, toastWithUndo } from './actions-origin';
import { pushOriginRebind } from './ungroup-origin';

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
        const selectionBefore = snapshotSelection(modelGroup);
        const op = new GroupSvgOperation({ modelGroup, targetModels });
        const compound = new CompoundOperation();
        compound.push(op);
        compound.registerCallbackAll(() => {
            // After group: selectedModelArray holds the group's children
            const children = modelGroup.selectedModelArray.slice() as SvgModel[];
            syncEditorAfterGroupChange(dispatch, headType, getState, children);
        });
        compound.redo();
        dispatch(recordSelectionChange(headType, compound, selectionBefore));
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
        const selectionBefore = snapshotSelection(modelGroup);

        const op = new UngroupSvgOperation({ modelGroup, target });
        const compound = new CompoundOperation();
        compound.push(op);
        // an origin on the group stays on its members, in the same undo step
        const memberIDs = target.children.map((child) => child.modelID);
        const rebound = pushOriginRebind(compound, {
            origin: state.origin, groupID: selectedGroupID, memberIDs, apply: originApplier(dispatch, headType),
        });
        compound.registerCallbackAll(() => {
            syncEditorAfterGroupChange(dispatch, headType, getState);
        });
        compound.redo();
        if (rebound) {
            toastWithUndo(dispatch, headType, t('key-CncLaser/Origin-Ungrouped · origin kept on the {{count}} members', { count: memberIDs.length }));
        }
        dispatch(recordSelectionChange(headType, compound, selectionBefore));
        if (operationHistory && typeof operationHistory.push === 'function') {
            operationHistory.push(compound);
        }
    },

    /**
     * Member selection (one level of groups): `groupID` is the group whose single members are
     * selected (after a double-click), null when clicks select whole groups again.
     */
    setMemberSelection: (headType: HeadType, groupID: string | null) => (dispatch, getState) => {
        const modelGroup: ModelGroup2D = getState()[headType].modelGroup;
        if (!modelGroup?.setEnteredGroupId || modelGroup.getEnteredGroupId() === groupID) return;
        modelGroup.setEnteredGroupId(groupID);
        dispatch(baseActions.updateState(headType, { enteredGroupId: groupID }));
    },

    // double-click on a group member: from now on clicks select single members of this group
    enterGroup: (headType: HeadType, groupID: string) => (dispatch) => {
        dispatch(groupActions.setMemberSelection(headType, groupID));
    },

    /**
     * Leave the member selection. With `selectGroup` (Escape) the whole group is selected
     * again, like a click on it.
     */
    exitGroup: (headType: HeadType, options: { selectGroup?: boolean } = {}) => (dispatch, getState) => {
        const state = getState()[headType];
        const modelGroup: ModelGroup2D = state.modelGroup;
        const groupID = modelGroup.getEnteredGroupId();
        dispatch(groupActions.setMemberSelection(headType, null));
        const group = options.selectGroup && groupID
            ? modelGroup.models.find((m) => (m as SvgGroup).modelID === groupID && (m as SvgGroup).type === '2d-group') as SvgGroup | undefined
            : undefined;
        if (group) {
            modelGroup.selectedGroupID = group.modelID;
            syncEditorAfterGroupChange(dispatch, headType, getState, group.children.slice());
        }
    },
};
