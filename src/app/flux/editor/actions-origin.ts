/**
 * The only writer of the work origin (Luban 4.17 "Kombination A+B"): every set (drop, pick, dialog, menu)
 * is one `OriginOperation2D` in one `CompoundOperation`, followed by a toast with Undo. Previews (hover,
 * drag, pick mode, open dialog) only write `originPreview` and never history.
 */
import { ObjectReference, Origin, OriginOffset } from '../../constants/coordinate';
import CompoundOperation from '../../core/CompoundOperation';
import i18n from '../../lib/i18n';
import { createObjectOrigin } from '../../lib/object-origin';
import { createGroupOrigin, isOutsideWorkpiece, originAfterDrop, sameOrigin } from '../../lib/work-origin';
import type ModelGroup2D from '../../models/ModelGroup2D';
import type SvgModel from '../../models/SvgModel';
import { toast } from '../../ui/components/Toast';
import { describeOrigin, originSetToast, Translate } from '../../ui/SVGEditor/origin/origin-labels';
import { makeSceneToast } from '../../ui/views/toasts/SceneToast';
import type { OriginTarget } from '../../ui/SVGEditor/snap/origin-targets';
import OriginOperation2D from '../operation-history/OriginOperation2D';
import { baseActions } from './actions-base';

type HeadType = 'laser' | 'cnc';

export type OriginSetSource = 'drop' | 'pick' | 'dialog' | 'menu';

export type OriginPickSource = 'button' | 'key' | 'dialog';

export interface OriginPickState {
    source: OriginPickSource;
    /** the active point (keyboard), null: none */
    reference: ObjectReference | null;
    /** 'selection': the 9 points of the selection; 'all': every target (keyboard grab with nothing selected, dialog pick) */
    scope: 'selection' | 'all';
}

export interface OriginPickOptions {
    reference?: ObjectReference | null;
    scope?: 'selection' | 'all';
}

export interface OriginPickResult {
    origin: Origin;
    removedOffset?: OriginOffset | null;
    label?: string;
}

/** How the work origin dialog was opened (focus and the line under its title). */
export type OriginDialogOpener = 'button' | 'key' | 'marker' | 'menu' | 'panel' | 'job-setup' | 'preview';

export type OriginDialogFocus = 'point' | 'offset' | 'reference';

/** The open work origin dialog ("Set work origin", detail path). */
export interface OriginDialogState {
    focus: OriginDialogFocus;
    opener: OriginDialogOpener;
    /** "Pick on the canvas": the dialog is hidden, pick mode runs over all targets */
    picking?: boolean;
    /** the dialog's state while it is hidden for a pick (restored when it comes back) */
    draft?: OriginDialogDraft | null;
    /** the point picked on the canvas (null: cancelled) */
    picked?: OriginTarget | null;
}

/** The dialog's form while it is hidden (see origin-dialog-model OriginDialogState). */
export interface OriginDialogDraft {
    [key: string]: unknown;
}

/**
 * Whether the work origin can be edited now (quick path or dialog): the Design step, select mode, no point
 * editing, a flat workpiece. No selection is needed.
 */
export function canEditOrigin(rootState, headType: HeadType): boolean {
    const state = rootState?.[headType];
    if (!state || state.page !== 'editor' || state.materials?.isRotate) {
        return false;
    }
    return state.SVGCanvasMode === 'select' && !state.SVGCanvasExt?.elem;
}

/** The editor actions the origin thunks call (bound by flux/editor/index.ts, which spreads these actions). */
interface EditorActionsLike {
    setOrigin: (headType: HeadType, origin: Origin) => unknown;
    resetProcessState: (headType: HeadType) => unknown;
    undo: (headType: HeadType) => unknown;
    /** operation-history setOperations (pushes one undo step) */
    setOperations: (headType: HeadType, operations: CompoundOperation) => unknown;
    /** editor step: 'editor' (Design) or 'process' */
    switchToPage: (headType: HeadType, page: string) => unknown;
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

/** Origin texts: the interpolated labels and numbers are plain text (React escapes), so i18next must not ("5.0 &#x2F; 0.0"). */
export const t: Translate = (key, options) => i18n._(key, options ? { ...options, interpolation: { escapeValue: false } } : options);

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
        // a warning, never a block
        const toolPathGroup = getState()[headType]?.toolPathGroup;
        const zero = toolPathGroup?.getWorkOriginPoint?.(next) || { x: 0, y: 0 };
        const outside = isOutsideWorkpiece(zero, toolPathGroup?.getOriginContext?.()?.workpieceBox || null);
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

    /** Pick mode: the 9 points of the selection on the canvas (or, with nothing selected, every target by keyboard). */
    startOriginPick: (headType: HeadType, source: OriginPickSource, options: OriginPickOptions = {}) => (dispatch) => {
        const pick: OriginPickState = { source, reference: options.reference ?? null, scope: options.scope || 'selection' };
        dispatch(baseActions.updateState(headType, { originPick: pick, originPreview: null }));
    },

    /** Ends pick mode; with `result` the origin is set (one undo step), else nothing changes. */
    endOriginPick: (headType: HeadType, result: OriginPickResult | null = null) => (dispatch, getState) => {
        if (!getState()[headType]?.originPick && !result) {
            return;
        }
        dispatch(baseActions.updateState(headType, { originPick: null, originPreview: null }));
        if (result) {
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            dispatch(originActions.applyOrigin(headType, result.origin, { source: 'pick', removedOffset: result.removedOffset, label: result.label }));
        }
    },

    /** The active point of pick / keyboard mode. */
    setOriginPickReference: (headType: HeadType, reference: ObjectReference | null) => (dispatch, getState) => {
        const pick: OriginPickState | null = getState()[headType]?.originPick;
        if (pick && pick.reference !== reference) {
            dispatch(baseActions.updateState(headType, { originPick: { ...pick, reference } }));
        }
    },

    /** Opens the work origin dialog on the current origin (no history until Apply). */
    openOriginDialog: (headType: HeadType, focus: OriginDialogFocus = 'point', opener: OriginDialogOpener = 'button') => (dispatch, getState) => {
        if (!canEditOrigin(getState(), headType)) {
            return false;
        }
        const dialog: OriginDialogState = { focus, opener, picking: false, draft: null, picked: null };
        dispatch(baseActions.updateState(headType, { originDialog: dialog, originPick: null, originPreview: null }));
        return true;
    },

    /** Back to the Design step (from Job Setup, the G-code preview), then the dialog. */
    openOriginDialogInDesign: (headType: HeadType, focus: OriginDialogFocus, opener: OriginDialogOpener) => (dispatch, getState) => {
        if (getState()[headType]?.page !== 'editor') {
            dispatch(editor.switchToPage(headType, 'editor'));
        }
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return dispatch(originActions.openOriginDialog(headType, focus, opener));
    },

    /** Closes the dialog (Cancel, Esc, ×, after Apply); the preview goes. */
    closeOriginDialog: (headType: HeadType) => (dispatch, getState) => {
        const state = getState()[headType];
        if (state?.originDialog) {
            dispatch(baseActions.updateState(headType, {
                originDialog: null,
                originPreview: null,
                ...(state.originPick?.source === 'dialog' ? { originPick: null } : {}),
            }));
        }
    },

    /** "Pick on the canvas": hides the dialog (its form kept in `draft`) and starts pick mode over all targets. */
    startDialogPick: (headType: HeadType, draft: OriginDialogDraft) => (dispatch, getState) => {
        const dialog: OriginDialogState | null = getState()[headType]?.originDialog;
        if (!dialog) {
            return;
        }
        dispatch(baseActions.updateState(headType, {
            originDialog: { ...dialog, picking: true, draft, picked: null },
            originPick: { source: 'dialog', reference: null, scope: 'all' } as OriginPickState,
            originPreview: null,
        }));
    },

    /** The pick of the dialog ended: back to the dialog with the picked point (null: unchanged); no history. */
    endDialogPick: (headType: HeadType, target: OriginTarget | null) => (dispatch, getState) => {
        const dialog: OriginDialogState | null = getState()[headType]?.originDialog;
        dispatch(baseActions.updateState(headType, {
            originPick: null,
            originPreview: null,
            ...(dialog ? { originDialog: { ...dialog, picking: false, picked: target } } : {}),
        }));
    },

    /** Shows an origin on the canvas without setting it (hover, drag, pick, dialog); never history. */
    setOriginPreview: (headType: HeadType, preview: Origin | null) => (dispatch): void => {
        dispatch(baseActions.updateState(headType, { originPreview: preview }));
    },
};
