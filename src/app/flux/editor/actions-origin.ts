/**
 * The only writer of the work origin (Luban 4.17 "Kombination A+B"): every set (drop, pick, dialog, menu)
 * is one `OriginOperation2D` in one `CompoundOperation`, followed by a toast with Undo. Previews (hover,
 * drag, pick mode, open dialog) only write `originPreview` and never history.
 */
import { ObjectReference, Origin, OriginOffset } from '../../constants/coordinate';
import CompoundOperation from '../../core/CompoundOperation';
import i18n from '../../lib/i18n';
import { createObjectOrigin } from '../../lib/object-origin';
import { createGroupOrigin, originAfterDrop, sameOrigin } from '../../lib/work-origin';
import type ModelGroup2D from '../../models/ModelGroup2D';
import type SvgModel from '../../models/SvgModel';
import { toast } from '../../ui/components/Toast';
import { describeOrigin, originSetToast, Translate } from '../../ui/SVGEditor/origin/origin-labels';
import { makeSceneToast } from '../../ui/views/toasts/SceneToast';
import OriginOperation2D from '../operation-history/OriginOperation2D';
import { baseActions } from './actions-base';

type HeadType = 'laser' | 'cnc';

export type OriginSetSource = 'drop' | 'pick' | 'dialog' | 'menu';

export type OriginPickSource = 'button' | 'key' | 'dialog';

export interface OriginPickState {
    source: OriginPickSource;
    /** the active point (keyboard), null: none */
    reference: ObjectReference | null;
}

/** The editor actions the origin thunks call (bound by flux/editor/index.ts, which spreads these actions). */
interface EditorActionsLike {
    setOrigin: (headType: HeadType, origin: Origin) => unknown;
    resetProcessState: (headType: HeadType) => unknown;
    undo: (headType: HeadType) => unknown;
    /** operation-history setOperations (pushes one undo step) */
    setOperations: (headType: HeadType, operations: CompoundOperation) => unknown;
}

let editor: EditorActionsLike | null = null;

export interface ApplyOriginOptions {
    source?: OriginSetSource;
    /** the offset the set removed (drop / pick on a frame point), named in the toast */
    removedOffset?: OriginOffset | null;
    /** toast label; default: describeOrigin of the new origin */
    label?: string;
}

export function bindEditorActions(actions: EditorActionsLike): void {
    editor = actions;
}

export const t: Translate = (key, options) => i18n._(key, options);

/** Sets an origin for an undo step (state, tool paths, process reset, render). */
export function originApplier(dispatch, headType: HeadType): (origin: Origin) => void {
    return (origin: Origin) => {
        dispatch(editor.setOrigin(headType, origin));
        dispatch(editor.resetProcessState(headType));
        dispatch(baseActions.render(headType));
    };
}

/** Toast with Undo (one step back). */
export function toastWithUndo(dispatch, headType: HeadType, text: string, type: 'info' | 'warning' = 'info'): void {
    toast(makeSceneToast(type, text, {
        label: t('key-CncLaser/Origin-Undo'),
        onClick: () => dispatch(editor.undo(headType)),
    }));
}

/** Names of objects and groups for labels. */
export function originNameContext(modelGroup: ModelGroup2D | null | undefined) {
    return {
        getName: (modelID: string): string | null => {
            const model = modelGroup && typeof modelGroup.getModel === 'function' ? modelGroup.getModel(modelID) as { modelName?: string; name?: string } : null;
            return model ? (model.modelName || model.name || null) : null;
        },
    };
}

export const originActions = {
    /**
     * Sets the work origin as one undo step and shows "Origin set on …" with Undo. Returns false (and pushes
     * nothing) when `next` equals the current origin.
     */
    applyOrigin: (headType: HeadType, next: Origin, options: ApplyOriginOptions = {}) => (dispatch, getState): boolean => {
        const state = getState()[headType];
        const before: Origin = state.origin;
        dispatch(baseActions.updateState(headType, { originPreview: null }));
        if (sameOrigin(before, next)) {
            return false;
        }
        const apply = originApplier(dispatch, headType);
        const operation = new OriginOperation2D({ before, after: next, apply });
        operation.redo();
        const operations = new CompoundOperation();
        operations.push(operation);
        dispatch(editor.setOperations(headType, operations));

        const label = options.label || describeOrigin(next, originNameContext(state.modelGroup), t).label;
        const outside = false;
        toastWithUndo(dispatch, headType, originSetToast(label, options.removedOffset ?? null, outside, t), outside ? 'warning' : 'info');
        return true;
    },

    /**
     * "Set origin here": a point of the selection. A selected group binds to the group frame, otherwise to
     * the visible selected objects. One undo step (through applyOrigin).
     */
    setOriginOnSelection: (headType: HeadType, reference: ObjectReference, source: OriginSetSource = 'menu') => (dispatch, getState): boolean => {
        const { modelGroup, origin } = getState()[headType];
        const group = modelGroup as ModelGroup2D;
        const selected = (group.getSelectedModelArray() as SvgModel[]).filter(model => model.visible !== false);
        const ids = selected.map(model => model.modelID);
        if (!ids.length) {
            return false;
        }
        const groupID = group.selectedGroupID;
        const target = groupID ? createGroupOrigin(reference, groupID, ids) : createObjectOrigin(reference, ids);
        const { origin: next, removedOffset } = originAfterDrop(origin, target);
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return dispatch(originActions.applyOrigin(headType, next, { source, removedOffset }));
    },

    /** Shows an origin on the canvas without setting it (hover, drag, pick, dialog); never history. */
    setOriginPreview: (headType: HeadType, preview: Origin | null) => (dispatch): void => {
        dispatch(baseActions.updateState(headType, { originPreview: preview }));
    },
};
