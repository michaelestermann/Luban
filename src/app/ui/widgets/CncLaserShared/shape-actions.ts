/**
 * Shape actions on the selection, shared by the selection bar ("Combine ▾" and "⋯" menus) and the
 * right-click context menus. Each entry knows when it fits the selection, its key and how to run it.
 */
import { actions as editorActions } from '../../../flux/editor';
import { canEditShapes, CombineKind } from '../../../flux/editor/actions-combine';
import i18n from '../../../lib/i18n';
import { arraySelection } from '../../SVGEditor/combine/array-model';
import { combinableModels, offsetModels } from '../../SVGEditor/combine/model-outline';
import { openPathState } from '../../SVGEditor/path-edit/shape-to-path';

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
export const MORE_ACTIONS: ShapeAction[] = [
    {
        id: 'offset',
        label: () => i18n._('key-CncLaser/Offset-Offset'),
        keyHint: 'O',
        // vector shapes (closed or open); not while the offset values are open
        fits: (state, headType) => canEditShapes(state, headType) && !state[headType]?.offsetSession
            && offsetModels(state[headType]?.modelGroup).length > 0,
        run: (dispatch, headType) => dispatch(editorActions.startOffset(headType)),
    },
    {
        id: 'array',
        label: () => i18n._('key-CncLaser/Array-Array'),
        keyHint: 'A',
        // any visible objects or whole groups; not while the array values are open
        fits: (state, headType) => canEditShapes(state, headType) && !state[headType]?.arraySession
            && !!arraySelection(state[headType]?.modelGroup),
        run: (dispatch, headType) => dispatch(editorActions.startArray(headType)),
    },
];

export const fittingActions = (actions: ShapeAction[], state: unknown, headType: HeadType) => actions.filter(a => a.fits(state, headType));

export interface ContextMenuItem {
    type: 'item' | 'subMenu' | 'separator';
    label?: string;
    disabled?: boolean;
    onClick?: () => void;
    items?: ContextMenuItem[];
}

const withKey = (action: ShapeAction) => (action.keyHint ? `${action.label()} (${action.keyHint})` : action.label());

/**
 * Right-click menu entries of the shape actions that fit the selection: Combine (submenu), the "⋯"
 * actions, Close path and Edit points. Empty when none fits.
 */
export function shapeContextMenuItems(
    state,
    headType: HeadType,
    dispatch: (action: unknown) => unknown,
    points: { canEditPoints: (elem: Element) => boolean; editPoints: (elem: Element) => void }
): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];
    const combineItems = fittingActions(COMBINE_ACTIONS, state, headType);
    if (combineItems.length > 0) {
        items.push({
            type: 'subMenu',
            label: i18n._('key-CncLaser/Combine-Combine'),
            items: combineItems.map(action => ({ type: 'item', label: withKey(action), onClick: () => action.run(dispatch, headType) })),
        });
    }
    for (const action of fittingActions(MORE_ACTIONS, state, headType)) {
        items.push({ type: 'item', label: withKey(action), onClick: () => action.run(dispatch, headType) });
    }
    const selected = state[headType]?.modelGroup?.getSelectedModelArray?.() || [];
    const elem: Element | null = selected.length === 1 && selected[0].visible !== false ? selected[0].elem : null;
    if (elem && elem.nodeName === 'path' && openPathState(elem.getAttribute('d')).open) {
        items.push({
            type: 'item',
            label: i18n._('key-CncLaser/SelectionBar-Close path'),
            onClick: () => dispatch(editorActions.closeSelectedPath(headType, 'close')),
        });
    }
    if (elem && state[headType]?.SVGCanvasMode === 'select' && points.canEditPoints(elem)) {
        items.push({ type: 'item', label: i18n._('key-CncLaser/ContextMenu-Edit points'), onClick: () => points.editPoints(elem) });
    }
    return items.length > 0 ? [{ type: 'separator' }, ...items] : [];
}
