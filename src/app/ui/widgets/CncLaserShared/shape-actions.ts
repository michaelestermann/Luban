/**
 * Shape actions on the selection, shared by the selection bar (labelled buttons, "Combine ▾") and the
 * right-click context menus. Each entry knows when it fits the selection, its key and how to run it.
 */
import React from 'react';
import { contextMenu } from 'react-contexify';

import { ObjectReference } from '../../../constants/coordinate';
import { actions as editorActions, roundCornerTargets } from '../../../flux/editor';
import { canEditShapes, CombineKind } from '../../../flux/editor/actions-combine';
import i18n from '../../../lib/i18n';
import { selectionActionState } from '../../SVGEditor/combine/selection-actions';
import { openPathState } from '../../SVGEditor/path-edit/shape-to-path';
import OriginPointPicker from './OriginPointPicker';

type HeadType = 'laser' | 'cnc';

export interface ShapeAction {
    id: string;
    label: () => string;
    // key shown in the menu and tooltip
    keyHint?: string;
    fits: (state: unknown, headType: HeadType) => boolean;
    // anchor: screen point a dialog opens at (button, cursor)
    run: (dispatch: (action: unknown) => unknown, headType: HeadType, anchor?: ScreenPoint) => void;
}

export interface ScreenPoint {
    x: number;
    y: number;
    // 'start': open right of the point (cursor), else centred below it (button)
    align?: 'center' | 'start';
}

// where the last right-click was: the "Round corners" values open there from the context menu
let contextMenuPoint: ScreenPoint | null = null;
if (typeof window !== 'undefined') {
    window.addEventListener('contextmenu', (event) => {
        contextMenuPoint = { x: event.clientX, y: event.clientY, align: 'start' };
    }, true);
}

// the "Round corners" button of the selection bar, else below the selection on the canvas
function roundCornersAnchor(): ScreenPoint {
    const button = Array.from(document.querySelectorAll('[data-round-corners]'))
        .map(elem => elem.getBoundingClientRect())
        .find(rect => rect.width > 0 && rect.x > 0);
    if (button) {
        return { x: button.left + button.width / 2, y: button.bottom + 6 };
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 3 };
}

// computed once per selection and render, shared by all actions, the selection bar and the context menu
const available = (state, headType: HeadType) => selectionActionState(state[headType]?.modelGroup, state[headType]?.renderingTimestamp);

const canCombine = (state, headType: HeadType) => canEditShapes(state, headType) && available(state, headType).combine;

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

/** Offset and Array: labelled buttons in the selection bar (in its overflow "⋯" when the bar does not fit). */
export const MORE_ACTIONS: ShapeAction[] = [
    {
        id: 'offset',
        label: () => i18n._('key-CncLaser/Offset-Offset'),
        keyHint: 'O',
        // vector shapes (closed or open); not while the offset values are open
        fits: (state, headType) => canEditShapes(state, headType) && !state[headType]?.offsetSession
            && available(state, headType).offset,
        run: (dispatch, headType) => dispatch(editorActions.startOffset(headType)),
    },
    {
        id: 'array',
        label: () => i18n._('key-CncLaser/Array-Array'),
        keyHint: 'A',
        // any visible objects or whole groups; not while the array values are open
        fits: (state, headType) => canEditShapes(state, headType) && !state[headType]?.arraySession
            && available(state, headType).array,
        run: (dispatch, headType) => dispatch(editorActions.startArray(headType)),
    },
];

/** "Round corners": rectangles and editable paths with sharp corners; opens the radius next to the button. */
export const ROUND_CORNERS_ACTION: ShapeAction = {
    id: 'round-corners',
    label: () => i18n._('key-CncLaser/RoundCorners-Round corners'),
    keyHint: 'R',
    fits: (state, headType) => canEditShapes(state, headType)
        && roundCornerTargets(state[headType]?.modelGroup).length > 0,
    run: (dispatch, headType, anchor) => dispatch(editorActions.startRoundCorners(headType, anchor || roundCornersAnchor())),
};

/**
 * "Set origin here ▸": the work origin on a point of the selected objects. Visible objects on a flat
 * (not rotary) workpiece, outside of drawing / point editing.
 */
export const canSetOriginOnSelection = (state, headType: HeadType): boolean => {
    const editor = state[headType];
    if (!editor || editor.materials?.isRotate || editor.SVGCanvasMode !== 'select' || editor.SVGCanvasExt?.elem) {
        return false;
    }
    const selected = editor.modelGroup?.getSelectedModelArray?.() || [];
    return selected.some(model => model.visible !== false);
};

export const setOriginLabel = () => i18n._('key-CncLaser/Origin-Set origin here');

/** Split button, left part: pick mode on the canvas (key 0). */
export const pickOriginLabel = () => i18n._('key-CncLaser/Origin-Pick origin point on the canvas (0)');

/** Split button, right part: the details. */
export const originDialogLabel = () => i18n._('key-CncLaser/Origin-Origin…');

export const originDialogTitle = () => i18n._('key-CncLaser/Origin-Origin… (Shift+O)');

export const fittingActions = (actions: ShapeAction[], state: unknown, headType: HeadType) => actions.filter(a => a.fits(state, headType));

export interface ContextMenuItem {
    type: 'item' | 'subMenu' | 'separator' | 'custom';
    label?: string;
    disabled?: boolean;
    onClick?: () => void;
    items?: ContextMenuItem[];
    // type 'custom': own content
    render?: () => React.ReactNode;
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
    if (ROUND_CORNERS_ACTION.fits(state, headType)) {
        // the values open where the menu was opened
        const at = contextMenuPoint;
        items.push({ type: 'item', label: withKey(ROUND_CORNERS_ACTION), onClick: () => ROUND_CORNERS_ACTION.run(dispatch, headType, at || undefined) });
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
    if (canSetOriginOnSelection(state, headType)) {
        items.push({
            type: 'subMenu',
            label: setOriginLabel(),
            items: [{
                type: 'custom',
                render: () => React.createElement(OriginPointPicker, {
                    onPick: (reference: ObjectReference) => {
                        contextMenu.hideAll();
                        dispatch(editorActions.setOriginOnSelection(headType, reference));
                    },
                }),
            }],
        });
    }
    return items.length > 0 ? [{ type: 'separator' }, ...items] : [];
}
