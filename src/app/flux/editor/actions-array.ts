import CompoundOperation from '../../core/CompoundOperation';
import i18n from '../../lib/i18n';
import SvgGroup from '../../models/SvgGroup';
import { replaceInLayers } from '../../models/z-order';
import {
    ArraySettings, arrayProblem, ArrayProblem, arrayTransforms, defaultArrayCentre, MAX_ARRAY_COPIES, Matrix, moveTransformation
} from '../../ui/SVGEditor/combine/array-layout';
import { arraySelection, selectionBox } from '../../ui/SVGEditor/combine/array-model';
import { replaceMembers } from '../../ui/SVGEditor/combine/shape-ops';
import ArrayOperation2D, { ArrayGroup } from '../operation-history/ArrayOperation2D';
import { MembershipChange } from '../operation-history/ReplaceModelsOperation2D';
import { actions as operationHistoryActions } from '../operation-history';
import { canEditShapes, markChanged, warn } from './actions-combine';
import { baseActions } from './actions-base';
import { recordSelectionChange, snapshotSelection } from './selection-history';

/* eslint-disable @typescript-eslint/no-explicit-any */
type HeadType = 'laser' | 'cnc';

// the values of the last array are offered next time (not the centre, it depends on the selection)
let lastArray: ArraySettings = {
    mode: 'grid', columns: 3, rows: 1, gapX: 5, gapY: 5, count: 6, angle: 360, centreX: 0, centreY: 0, rotate: true, group: true,
};

export function arrayProblemText(problem: ArrayProblem): string {
    switch (problem) {
        case 'none':
            return i18n._('key-CncLaser/Array-Set more than one object');
        case 'gap':
            return i18n._('key-CncLaser/Array-The gap puts the copies on top of each other');
        case 'angle':
            return i18n._('key-CncLaser/Array-Enter an angle other than 0');
        default:
            return i18n._('key-CncLaser/Array-At most {{max}} copies', { max: MAX_ARRAY_COPIES });
    }
}

/** Box of the selection the array copies (content group coordinates), or null. */
export function arrayBox(state: any, headType: HeadType) {
    const { modelGroup, SVGActions } = state[headType] || {};
    const selection = arraySelection(modelGroup);
    return selection && selectionBox(selection.leaves, SVGActions?.svgContentGroup?.group || null);
}

/** A copy of a model moved by a canvas matrix, in the DOM and in models[] (like Duplicate); not in the history yet. */
function copyModel(model: any, matrix: Matrix, modelGroup: any, SVGActions: any) {
    const contentGroup = SVGActions.svgContentGroup;
    // like SVGActionsFactory._pasteFrom: the second clone takes its element from the moved first one
    const moved = model.clone(modelGroup);
    Object.assign(moved.transformation, moveTransformation(model.transformation, matrix, model.size));
    moved.setParent(contentGroup.group);
    const copy = moved.clone(modelGroup);
    moved.elem.remove();
    copy.elem.id = copy.modelID;
    copy.setParent(contentGroup.group);
    copy.setPreSelection(contentGroup.preSelectionGroup);
    const name = modelGroup._createNewModelName(copy);
    copy.modelName = name.name;
    copy.baseName = name.baseName;
    copy.onTransform();
    modelGroup.object.add(copy.meshObject);
    copy.meshObject.addEventListener('update', modelGroup.onModelUpdate);
    modelGroup.models = [...modelGroup.models, copy];
    return copy;
}

// an empty group; ArrayOperation2D puts the children in (and takes them out on undo)
function newGroup(modelGroup: any, headType: HeadType) {
    // group names count on like Ctrl+G
    const { name, baseName } = modelGroup._createGroupName();
    return new SvgGroup({ name, baseName, headType }, modelGroup);
}

export const arrayActions = {
    /** Opens the Array values in the properties panel (preview on the canvas). */
    startArray: (headType: HeadType) => (dispatch, getState) => {
        const state = getState();
        const box = canEditShapes(state, headType) && arrayBox(state, headType);
        if (!box) {
            return;
        }
        const centre = defaultArrayCentre(box);
        dispatch(baseActions.updateState(headType, {
            arraySession: { ...lastArray, centreX: centre.x, centreY: centre.y },
            offsetSession: null,
        }));
    },

    updateArray: (headType: HeadType, values: Partial<ArraySettings>) => (dispatch, getState) => {
        const session = getState()[headType].arraySession;
        if (session) {
            dispatch(baseActions.updateState(headType, { arraySession: { ...session, ...values } }));
        }
    },

    cancelArray: (headType: HeadType) => (dispatch, getState) => {
        if (getState()[headType].arraySession) {
            dispatch(baseActions.updateState(headType, { arraySession: null }));
        }
    },

    /**
     * Creates the copies of the selection (like Duplicate): they join the operations of their original,
     * and with "Group the copies" the original and all copies become one group. One undo step.
     */
    applyArray: (headType: HeadType) => (dispatch, getState) => {
        const state = getState();
        const session: ArraySettings = state[headType].arraySession;
        if (!session) {
            return;
        }
        const { modelGroup, SVGActions, toolPathGroup, materials } = state[headType];
        const selection = arraySelection(modelGroup);
        const selectionBefore = snapshotSelection(modelGroup);
        const box = selection && selectionBox(selection.leaves, SVGActions.svgContentGroup.group);
        if (!selection || !box) {
            dispatch(arrayActions.cancelArray(headType));
            return;
        }
        const problem = arrayProblem(session, box);
        if (problem) {
            warn(arrayProblemText(problem));
            return;
        }
        const layerBefore = modelGroup.models.slice();
        const matrices = arrayTransforms(session, box);
        // copies of each leaf (for the operations) and of each entity (for the layer order)
        const copiesOf = new Map<string, string[]>();
        const added = [];
        const entityCopies = new Map<any, any[]>();
        const groups: ArrayGroup[] = [];
        for (const matrix of matrices) {
            for (const entity of selection.entities) {
                const leaves = entity.children || [entity];
                const copies = leaves.map(leaf => {
                    const copy = copyModel(leaf, matrix, modelGroup, SVGActions);
                    copiesOf.set(leaf.modelID, (copiesOf.get(leaf.modelID) || []).concat(copy.modelID));
                    added.push(copy);
                    return copy;
                });
                let copyEntity = copies[0];
                if (entity.children && !session.group) {
                    // the copy of a group is a group
                    copyEntity = newGroup(modelGroup, headType);
                    groups.push({ group: copyEntity, children: copies.slice() });
                }
                entityCopies.set(entity, (entityCopies.get(entity) || []).concat(entity.children && !session.group ? [copyEntity] : copies));
            }
        }
        let layerAfter: any[];
        if (session.group) {
            // one group of the originals and all copies, where the lowest original was
            const children = [...selection.leaves, ...added];
            const group = newGroup(modelGroup, headType);
            groups.push({ group, children: children.slice() });
            const index = Math.min(...selection.entities.map(e => layerBefore.indexOf(e)));
            const rest = layerBefore.filter(m => !selection.entities.includes(m));
            layerAfter = [...rest.slice(0, index), group, ...rest.slice(index)];
        } else {
            // the copies of each object right above it
            layerAfter = selection.entities.reduce(
                (list, entity) => replaceInLayers(list, [], entityCopies.get(entity) || [], entity),
                layerBefore
            );
        }
        const replacements = Object.fromEntries([...copiesOf].map(([id, ids]) => [id, [id, ...ids]]));
        const membership: MembershipChange[] = [];
        for (const toolPath of toolPathGroup.toolPaths) {
            const before = [...toolPath.modelMap.keys()] as string[];
            const after = replaceMembers(before, replacements);
            if (after.length !== before.length) {
                membership.push({ toolPath, before, after });
            }
        }
        const operation = new ArrayOperation2D({
            added, groups, modelGroup, svgActions: SVGActions, toolPathGroup, layerBefore, layerAfter, membership,
        });
        operation.redo();
        const operations = new CompoundOperation();
        operations.push(operation);
        dispatch(operationHistoryActions.setOperations(headType, operations));

        // select the original and its copies (the group when grouped)
        const selected = session.group ? groups[groups.length - 1].children : [...selection.leaves, ...added];
        SVGActions.clearSelection();
        SVGActions.addSelectedSvgModelsByModels(selected, !!materials?.isRotate);
        modelGroup.selectedGroupID = session.group ? groups[groups.length - 1].group.modelID : null;
        dispatch(recordSelectionChange(headType, operations, selectionBefore));
        dispatch(baseActions.updateState(headType, { ...modelGroup.getState(), arraySession: null }));
        markChanged(dispatch, headType);
        dispatch(baseActions.render(headType));
        lastArray = { ...session };
    },
};
