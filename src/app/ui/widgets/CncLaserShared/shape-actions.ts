/**
 * Shape actions on the selection, shared by the selection bar ("Combine ▾" and "⋯" menus) and the
 * right-click context menus. Each entry knows when it fits the selection, its key and how to run it.
 */
import { actions as editorActions } from '../../../flux/editor';
import { canEditShapes, CombineKind } from '../../../flux/editor/actions-combine';
import i18n from '../../../lib/i18n';
import { combinableModels } from '../../SVGEditor/combine/model-outline';

type HeadType = 'laser' | 'cnc';

export interface ShapeAction {
    id: string;
    label: () => string;
    // key shown in the menu and tooltip
    keyHint?: string;
    fits: (state: unknown, headType: HeadType) => boolean;
    run: (dispatch: (action: unknown) => unknown, headType: HeadType) => void;
}

const canCombine = (state, headType: HeadType) => canEditShapes(state, headType)
    && combinableModels(state[headType]?.modelGroup).length >= 2;

const combine = (id: CombineKind, label: () => string, keyHint?: string): ShapeAction => ({
    id,
    label,
    keyHint,
    fits: canCombine,
    run: (dispatch, headType) => dispatch(editorActions.combineSelected(headType, id)),
});

/** "Combine ▾": at least two closed shapes, none in a group. */
export const COMBINE_ACTIONS: ShapeAction[] = [
    combine('weld', () => i18n._('key-CncLaser/Combine-Weld'), 'Ctrl+W'),
    combine('subtract', () => i18n._('key-CncLaser/Combine-Subtract')),
    combine('intersect', () => i18n._('key-CncLaser/Combine-Intersect')),
];

/** "⋯": rarer actions; the button is shown when at least one fits. */
export const MORE_ACTIONS: ShapeAction[] = [];

export const fittingActions = (actions: ShapeAction[], state: unknown, headType: HeadType) => actions.filter(a => a.fits(state, headType));
