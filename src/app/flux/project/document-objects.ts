/**
 * Live document objects (Luban 4.17 tabs): a fresh document for a mode, its wiring when it goes live,
 * and disposal when it is closed. Kept apart from `document-swap.ts`, which stays pure (no three.js).
 */
import { cloneDeep } from 'lodash';
import * as THREE from 'three';

import { HEAD_PRINTING } from '../../constants/machines';
import OperationHistory from '../../core/OperationHistory';
import ModelGroup from '../../models/ModelGroup';
import ModelGroup2D from '../../models/ModelGroup2D';
import SVGActionsFactory from '../../models/SVGActionsFactory';
import ThreeUtils from '../../scene/three-extensions/ThreeUtils';
import ToolPathGroup from '../../toolpaths/ToolPathGroup';
/* eslint-disable import/no-cycle */
import { INITIAL_STATE as CNC_INITIAL_STATE } from '../cnc';
import { actions as editorActions } from '../editor';
import { INITIAL_STATE as LASER_INITIAL_STATE } from '../laser';
import { INITIAL_STATE as PRINTING_INITIAL_STATE } from '../printing';
/* eslint-enable import/no-cycle */
import { pickDocumentState } from './document-swap';
import { EditorHeadType } from './tabs-model';

// live objects of a document: never cloned, created fresh
const LIVE_KEYS = new Set(['modelGroup', 'toolPathGroup', 'SVGActions', 'history', 'gcodeLineGroup', 'background']);

const initialStateOf = (headType: EditorHeadType): Record<string, unknown> => {
    if (headType === 'laser') {
        return LASER_INITIAL_STATE as unknown as Record<string, unknown>;
    }
    if (headType === 'cnc') {
        return CNC_INITIAL_STATE as unknown as Record<string, unknown>;
    }
    return PRINTING_INITIAL_STATE as unknown as Record<string, unknown>;
};

function clonePlain(value: unknown): unknown {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    const proto = Object.getPrototypeOf(value);
    if (Array.isArray(value) || proto === Object.prototype || proto === null) {
        return cloneDeep(value);
    }
    // a class instance in the initial state that is not a known live object: share it (as 4.16 did)
    return value;
}

/**
 * The document keys of a new, empty document of `headType`: the plain keys of the slice's initial state
 * (cloned) plus fresh live objects. The new model group takes over the clipboard of `outgoing` so copy /
 * paste works between the tabs of a mode.
 */
export function createDocumentObjects(headType: EditorHeadType, outgoing?: Record<string, unknown>): Record<string, unknown> {
    const doc: Record<string, unknown> = {};
    const initial = pickDocumentState(initialStateOf(headType), headType);
    for (const key of Object.keys(initial)) {
        if (!LIVE_KEYS.has(key)) {
            doc[key] = clonePlain(initial[key]);
        }
    }
    let modelGroup: { clipboard?: unknown };
    if (headType === 'printing') {
        const mg = new ModelGroup(HEAD_PRINTING);
        modelGroup = mg as unknown as { clipboard?: unknown };
        doc.modelGroup = mg;
        doc.gcodeLineGroup = new THREE.Group();
        doc.history = new OperationHistory();
    } else {
        const mg = new ModelGroup2D(headType);
        modelGroup = mg as unknown as { clipboard?: unknown };
        doc.modelGroup = mg;
        doc.toolPathGroup = new ToolPathGroup(mg, headType);
        doc.SVGActions = new SVGActionsFactory(mg);
        doc.history = new OperationHistory();
        if (headType === 'laser') {
            doc.background = { enabled: false, group: new THREE.Group() };
        }
    }
    const outgoingGroup = outgoing?.modelGroup as { clipboard?: unknown } | undefined;
    if (outgoingGroup && Array.isArray(outgoingGroup.clipboard)) {
        modelGroup.clipboard = outgoingGroup.clipboard;
    }
    return doc;
}

/**
 * Wires the live objects of the document that just went live in its slice. The page mount does the rest
 * (`editorActions._init` sets the change callbacks, `printingActions.init` binds scene and model group).
 */
export const wireDocumentObjects = (headType: EditorHeadType) => (dispatch, getState): void => {
    const slice = getState()[headType];
    const modelGroup = slice?.modelGroup;
    if (!modelGroup) {
        return;
    }
    if (headType === 'laser' || headType === 'cnc') {
        // adds its listener once per model group
        dispatch(editorActions.initSelectedModelListener(headType));
        // the tool paths take their object origin point from the group
        slice.origin && slice.toolPathGroup?.setOrigin?.(slice.origin);
    }
};

/** Frees a closed document: models, tool paths, the G-code preview and its undo history. */
export function disposeDocumentObjects(objects: Record<string, unknown>, headType: EditorHeadType): void {
    const modelGroup = objects.modelGroup as { removeAllModels?: () => void } | undefined;
    modelGroup?.removeAllModels?.();
    const toolPathGroup = objects.toolPathGroup as { deleteAllToolPaths?: () => void } | undefined;
    toolPathGroup?.deleteAllToolPaths?.();
    if (headType === 'printing' && objects.gcodeLineGroup) {
        ThreeUtils.dispose(objects.gcodeLineGroup);
    }
    const history = objects.history as { clear?: () => void } | undefined;
    history?.clear?.();
}
