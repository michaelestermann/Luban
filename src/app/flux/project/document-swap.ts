/**
 * Live document swap (Luban 4.17 tabs), part 1.
 *
 * Each editor slice (`state.printing`, `state.laser`, `state.cnc`) holds exactly one live document.
 * The slice keys below are mode state (UI, definitions, machine level): they stay in the slice when
 * the document is swapped. All other own keys of a slice are document state and travel with the
 * document (by reference: modelGroup, toolPathGroup, SVGActions, history, ...).
 *
 * Pure functions only: no redux, three.js or DOM imports.
 */
import type { EditorHeadType } from './tabs-model';

const EDITOR_2D_MODE_KEYS = [
    'contentGroup',
    'initFlag',
    'initEventFlag',
    'toolDefinitions',
    'activeToolListDefinition',
    'defaultDefinitions',
    'showCncToolManager',
    'progressStatesManager',
    'enableShortcut',
    'promptTasks',
    'removingModelsWarning',
    'removingModelsWarningCallback',
    'stlVisualizer',
    'autoPreviewEnabled',
    // runtime keys found in the running app (not in INITIAL_STATE), UI level
    'showImportStackedModelModal',
    'enableABPositionShortcut',
] as const;

const PRINTING_MODE_KEYS = [
    'name',
    'defaultDefinitions',
    'materialDefinitions',
    'qualityDefinitions',
    'extruderLDefinition',
    'extruderRDefinition',
    'progressStatesManager',
    'enableShortcut',
    'promptTasks',
    'isNewUser',
    'showPrintingManager',
    'managerDisplayType',
    'materialManagerDirection',
    'showPrintParameterModifierDialog',
    'printingParamsType',
    'materialParamsType',
    'customMode',
    'showParamsProfile',
    'modelExtruderInfoShow',
    'helpersExtruderInfoShow',
    'printMode',
    'stopArea',
    // runtime keys found in the running app, UI / profile-display level
    'isOpenSelectModals',
    'isOpenHelpers',
    'printingProfileLevel',
    'materialProfileLevel',
    'isRecommended',
] as const;

/** Slice keys that are NOT part of a document. */
export const MODE_STATE_KEYS: Record<EditorHeadType, readonly string[]> = {
    printing: PRINTING_MODE_KEYS,
    laser: EDITOR_2D_MODE_KEYS,
    cnc: EDITOR_2D_MODE_KEYS,
};

/** Keys of `state.project[headType]` that belong to the live document. */
export const PROJECT_META_KEYS = ['openedFile', 'unSaved', 'targetFile', 'content', 'initState', 'findLastEnvironment'] as const;

function isModeKey(headType: EditorHeadType, key: string): boolean {
    return MODE_STATE_KEYS[headType].includes(key);
}

/** All own keys of the slice minus the mode keys (values by reference). */
export function pickDocumentState(slice: object, headType: EditorHeadType): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(slice)) {
        if (!isModeKey(headType, key)) {
            out[key] = (slice as Record<string, unknown>)[key];
        }
    }
    return out;
}

/**
 * `outgoing` is the current document of the slice; `patch` puts `incoming` in its place:
 * every document key of the current slice is set (to `undefined` when `incoming` lacks it),
 * plus the document keys that only `incoming` has. Mode keys are never in the patch.
 */
export function swapDocumentState(
    slice: object,
    incoming: Record<string, unknown>,
    headType: EditorHeadType,
): { outgoing: Record<string, unknown>; patch: Record<string, unknown> } {
    const outgoing = pickDocumentState(slice, headType);
    const patch: Record<string, unknown> = {};
    for (const key of Object.keys(outgoing)) {
        patch[key] = incoming[key];
    }
    for (const key of Object.keys(incoming)) {
        if (!isModeKey(headType, key)) {
            patch[key] = incoming[key];
        }
    }
    return { outgoing, patch };
}

export interface NodeLike {
    childNodes: ArrayLike<unknown>;
    appendChild(n: unknown): unknown;
}

export interface SvgGroupsLike {
    group: NodeLike;
    backgroundGroup: NodeLike;
}

function moveChildren(from: NodeLike, to: NodeLike): number {
    // copy first: appendChild removes the node from `from.childNodes` (a live list in the DOM)
    const nodes = Array.from(from.childNodes);
    nodes.forEach((n) => to.appendChild(n));
    return nodes.length;
}

/**
 * Moves the SVG nodes of a document from the content group of an unmounted canvas into the new one
 * (object nodes and background nodes, in order). Returns the number of moved nodes.
 */
export function adoptSvgChildren(from: SvgGroupsLike | null | undefined, to: SvgGroupsLike): number {
    if (!from || !to || from === to) {
        return 0;
    }
    let count = 0;
    if (from.group && to.group && from.group !== to.group) {
        count += moveChildren(from.group, to.group);
    }
    if (from.backgroundGroup && to.backgroundGroup && from.backgroundGroup !== to.backgroundGroup) {
        count += moveChildren(from.backgroundGroup, to.backgroundGroup);
    }
    return count;
}
