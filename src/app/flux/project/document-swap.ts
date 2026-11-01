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
import { STEP_STAGE } from '../../lib/manager/ProgressManager';
import { DocumentStatus, EditorHeadType, HOME_TAB, TabsState, WORKSPACE_TAB } from './tabs-model';

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

// live objects of a document: closeProject empties them in place, they are not reset to the initial ones
const DOCUMENT_OBJECT_KEYS = new Set(['modelGroup', 'toolPathGroup', 'SVGActions', 'history', 'gcodeLineGroup', 'background']);

// printing: only the result of slicing is reset (presets and the rest are set again by the page init)
const PRINTING_RESULT_KEYS = ['stage', 'progress', 'gcodeFile', 'gcodeLine', 'displayedType'];

function clonePlainValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(clonePlainValue);
    }
    if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = clonePlainValue(v);
        }
        return out;
    }
    return value;
}

/**
 * The slice patch after the last document of a mode was closed: laser/CNC get every document key of the
 * initial state back (G-code files, steps, origin, ...), printing the slicing result keys, so the next
 * project opened into the slice does not show the G-code of the closed one. Live objects are left out.
 */
export function closedDocumentReset(initial: object, headType: EditorHeadType): Record<string, unknown> {
    const doc = pickDocumentState(initial, headType);
    const keys = headType === 'printing'
        ? PRINTING_RESULT_KEYS.filter((key) => key in doc)
        : Object.keys(doc).filter((key) => !DOCUMENT_OBJECT_KEYS.has(key));
    const out: Record<string, unknown> = {};
    for (const key of keys) {
        out[key] = clonePlainValue(doc[key]);
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

export interface ActivationPlan {
    kind: 'noop' | 'route' | 'live' | 'swap' | 'load';
    parkId?: string;
    blockedBy?: EditorHeadType;
}

/**
 * What activating `tabId` takes:
 * - `route`: Home / Workspace (only the route changes)
 * - `live`: the doc is already live in its slice (another mode, or the mode's page was left)
 * - `swap`: a parked doc goes live; `parkId` is the doc the slice holds now (it gets parked)
 * - `load`: the doc is not loaded (session restore / unloaded); `parkId` as for swap
 * A swap or load would change the doc of a busy mode: `blockedBy` names the mode, the switch must wait.
 */
export function planActivation(s: TabsState, tabId: string, opts: { parked: string[]; busyHeads: EditorHeadType[] }): ActivationPlan {
    if (tabId === HOME_TAB || tabId === WORKSPACE_TAB) {
        return tabId === s.activeTabId ? { kind: 'noop' } : { kind: 'route' };
    }
    const meta = s.documents[tabId];
    if (!meta) {
        return { kind: 'noop' };
    }
    const head = meta.headType;
    const liveId = s.activeDocByHead[head];
    if (liveId === tabId) {
        return tabId === s.activeTabId ? { kind: 'noop' } : { kind: 'live' };
    }
    const plan: ActivationPlan = { kind: meta.loaded && opts.parked.includes(tabId) ? 'swap' : 'load' };
    if (liveId && s.documents[liveId]) {
        plan.parkId = liveId;
    }
    if (opts.busyHeads.includes(head)) {
        plan.blockedBy = head;
    }
    return plan;
}

/** Step status of a document for the project panel: sliced (printing G-code), G-code ready (laser/cnc, up to date), design. */
export function documentStatusOf(slice: Record<string, unknown> | null | undefined, headType: EditorHeadType): DocumentStatus {
    if (!slice || !slice.gcodeFile) {
        return 'design';
    }
    if (headType === 'printing') {
        return 'sliced';
    }
    return slice.isChangedAfterGcodeGenerating ? 'design' : 'gcode-ready';
}

/**
 * Where an auto-save result goes: into the live slice / project meta when its document is still live,
 * else into the parked document it was started for.
 */
export function routeAutosaveResult(activeId: string | undefined, docId: string | undefined): 'slice' | 'parked' {
    return activeId === docId ? 'slice' : 'parked';
}

// STEP_STAGE names of finished printing steps ("… succeeded / complete / failed", or no step at all)
const FINISHED_STAGE_NAME = /^EMPTY$|_(SUCCEED|SUCCESS|SUCCESSED|COMPLETE|FAILED)$/;
const FINISHED_PRINTING_STAGES: ReadonlySet<number> = new Set(
    Object.entries(STEP_STAGE)
        .filter(([name]) => FINISHED_STAGE_NAME.test(name))
        .map(([, value]) => value),
);

/**
 * Whether a printing operation (load, slice, preview, arrange, auto rotate, place on face, scale to fit,
 * support, simplify, repair, split, mesh colouring, …) is running: its step is not a finished one and its
 * progress has not reached 1. Several 4.16 operations end by writing their running step with progress 1
 * and never set a finished step, so the progress decides.
 */
export function isPrintingOperationRunning(stage: number | undefined, progress: number | undefined): boolean {
    if (typeof stage !== 'number' || FINISHED_PRINTING_STAGES.has(stage)) {
        return false;
    }
    return (progress ?? 0) < 1;
}

interface BusySliceLike {
    stage?: number;
    progress?: number;
    inProgress?: boolean;
    isGcodeGenerating?: boolean;
    progressStatesManager?: { inProgress?: () => boolean };
    toolPathGroup?: { toolPaths?: Array<{ status?: string }> };
}

/**
 * A mode is busy while a background result may still arrive for its live document: a running task
 * (toolpaths, G-code, image processing, slicing), a project being opened, or a pending document load.
 */
export function isHeadBusy(
    state: { project?: { general?: { opening?: boolean } } } & Record<string, unknown>,
    headType: EditorHeadType,
    loadingHeads: readonly string[] = [],
): boolean {
    if (state.project?.general?.opening || loadingHeads.includes(headType)) {
        return true;
    }
    const slice = state[headType] as BusySliceLike | undefined;
    if (!slice) {
        return false;
    }
    if (slice.inProgress || slice.isGcodeGenerating) {
        return true;
    }
    if (headType === 'printing') {
        // the printing progress manager is started by every project load (also laser/cnc) and not always
        // finished, so the step and its progress tell whether a printing operation runs
        return isPrintingOperationRunning(slice.stage, slice.progress);
    }
    if (typeof slice.progressStatesManager?.inProgress === 'function' && slice.progressStatesManager.inProgress()) {
        return true;
    }
    return !!slice.toolPathGroup?.toolPaths?.some((t) => t && t.status === 'running');
}
