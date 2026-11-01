/**
 * Tab thunks (Luban 4.17 tabs): register documents, activate tabs, keep the strip in sync with the route.
 *
 * The registry itself is pure (`tabs-model.ts`); these thunks read `state.project.tabs`, compute the next
 * state and dispatch `project/SET_TABS`.
 */
import { batch } from 'react-redux';
import { v4 as uuid } from 'uuid';

import api from '../../api';

import { DISPLAYED_TYPE_MODEL, PAGE_EDITOR } from '../../constants';
import { HEAD_CNC, HEAD_LASER } from '../../constants/machines';
import { checkIsGCodeFile, checkIsSnapmakerProjectFile } from '../../lib/check-name';
import { logModuleVisit } from '../../lib/gaEvent';
import i18n from '../../lib/i18n';
import log from '../../lib/log';
import { stashMachineNotice } from '../../lib/machine-notice';
import { requestQuitSelection, requestSaveChanges } from '../../lib/tab-dialogs';
import workerManager from '../../lib/manager/workerManager';
import { machineStore } from '../../store/local-storage';
import { toast } from '../../ui/components/Toast';
import { makeSceneToast } from '../../ui/views/toasts/SceneToast';
/* eslint-disable import/no-cycle */
import { actions as editorActions } from '../editor';
import { actions as machineActions } from '../machine';
import { actions as printingActions } from '../printing';
import { actions as workspaceActions } from '../workspace';
import { actions as projectActions } from './index';
import { createDocumentObjects, disposeDocumentObjects, initialStateOf, wireDocumentObjects } from './document-objects';
import { currentMachineRef, knownMachineOf, machineDisplayName, switchMachineForProject } from './machine-switch';
/* eslint-enable import/no-cycle */
import { documentStore } from './document-store';
import { PROJECT_META_KEYS, closedDocumentReset, documentStatusOf, isHeadBusy, planActivation, swapDocumentState } from './document-swap';
import {
    DocumentMeta,
    EDITOR_HEAD_TYPES,
    EditorHeadType,
    HOME_TAB,
    MachineRef,
    OpenedFileRef,
    TabsState,
    WORKSPACE_TAB,
    activateTab as activateTabInModel,
    addDocument,
    collectUnsavedDocuments,
    documentDisplayName,
    findDocumentByPath,
    isEditorHeadType,
    keepFailedDocument,
    machineActionOnOpen,
    needsMachineSwitch,
    nextTabAfterClose,
    RestoreOutcome,
    RestorePlan,
    nextUntitledIndex,
    parseSession,
    pathForTab,
    pickDocumentToUnload,
    planLegacyMigration,
    planRestore,
    removeDocument,
    restoreEntryPoint,
    serializeSession,
    sessionPersistAllowed,
    tabIdForPath,
    unloadedMeta,
    updateDocument,
} from './tabs-model';

const ACTION_SET_TABS = 'project/SET_TABS';

export interface HistoryLike {
    location: { pathname: string };
    push: (to: string | { pathname: string; state?: unknown }) => void;
}

export interface RegisterInit {
    openedFile?: OpenedFileRef | null;
    isRotate?: boolean;
    machineSeries?: string | null;
    machineToolHead?: Record<string, string> | null;
    unSaved?: boolean;
}

const getTabsState = (state): TabsState => state.project.tabs;

const setTabs = (update: (s: TabsState) => TabsState) => (dispatch, getState): TabsState => {
    const current = getTabsState(getState());
    const next = update(current);
    if (next !== current) {
        dispatch({ type: ACTION_SET_TABS, tabs: next });
    }
    return next;
};

/** Registers a new document (not activated) and returns its id. */
const registerDocument = (headType: EditorHeadType, init: RegisterInit = {}) => (dispatch, getState): string => {
    const id = uuid();
    const { series, toolHead } = getState().machine;
    const openedFile = init.openedFile ? { name: init.openedFile.name, path: init.openedFile.path } : null;
    const meta: DocumentMeta = {
        id,
        headType,
        openedFile,
        untitledIndex: openedFile ? 0 : nextUntitledIndex(getTabsState(getState()), headType),
        unSaved: !!init.unSaved,
        loaded: true,
        source: 'live',
        isRotate: !!init.isRotate,
        machineSeries: init.machineSeries ?? series ?? null,
        machineToolHead: init.machineToolHead ?? (toolHead ? { ...toolHead } : null),
        status: 'design',
        lastActiveAt: Date.now(),
    };
    dispatch(setTabs((s) => addDocument(s, meta)));
    return id;
};

/**
 * The live document of `headType` gets this file (4.16 "replace" semantics): an existing live doc keeps
 * its id and only its meta changes, otherwise a doc is registered. The doc becomes the active tab.
 */
const ensureLiveDocument = (headType: EditorHeadType | string, init: RegisterInit = {}) => (dispatch, getState): string => {
    if (!isEditorHeadType(headType)) {
        return '';
    }
    const tabs = getTabsState(getState());
    let id = tabs.activeDocByHead[headType];
    if (id && tabs.documents[id]) {
        const openedFile = init.openedFile ? { name: init.openedFile.name, path: init.openedFile.path } : null;
        const meta = tabs.documents[id];
        dispatch(setTabs((s) => addDocument(s, {
            ...meta,
            openedFile,
            untitledIndex: openedFile ? 0 : (meta.untitledIndex || nextUntitledIndex(s, headType)),
            isRotate: init.isRotate ?? meta.isRotate,
            unSaved: !!init.unSaved,
            status: 'design',
        })));
    } else {
        id = dispatch(registerDocument(headType, init)) as unknown as string;
    }
    dispatch(setTabs((s) => activateTabInModel(s, id, Date.now())));
    return id;
};

// project meta of a document without a file (as INITIAL_STATE of flux/project)
const EMPTY_PROJECT_META = {
    findLastEnvironment: false,
    targetFile: null,
    openedFile: null,
    unSaved: false,
    content: null,
    initState: true,
};

function pickProjectMeta(project: Record<string, unknown> | undefined): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of PROJECT_META_KEYS) {
        out[key] = project ? project[key] : undefined;
    }
    return out;
}

const sliceUpdate = (headType: EditorHeadType, patch: Record<string, unknown>) => {
    return headType === 'printing' ? printingActions.updateState(patch) : editorActions.updateState(headType, patch);
};

/** Modes whose live document may still get a background result (see isHeadBusy). */
export const busyHeads = (state): EditorHeadType[] => {
    const loading = documentStore.loadingHeads();
    return EDITOR_HEAD_TYPES.filter((head) => isHeadBusy(state, head, loading));
};

const isOnPage = (history: HistoryLike, headType: string) => history.location.pathname === `/${headType}`;

const isEditor2D = (headType: string) => headType === HEAD_LASER || headType === HEAD_CNC;

/**
 * Makes `inId` the live document of `headType`: the document the slice holds now (`liveId`) is parked with
 * its project meta, the incoming slice keys and project meta are installed, and `inId` becomes the active
 * tab. One React render: the edit page of the mode is mounted again (route key = live doc).
 */
const installDocument = (
    headType: EditorHeadType,
    liveId: string | undefined,
    inId: string,
    incoming: { slice: Record<string, unknown>; projectMeta: Record<string, unknown> },
) => (dispatch, getState): void => {
    const state = getState();
    const { outgoing, patch } = swapDocumentState(state[headType], incoming.slice, headType);
    const outGroup = outgoing.modelGroup as { clipboard?: unknown; selectedModelArray?: Array<{ modelID: string }> } | undefined;
    const inGroup = patch.modelGroup as { clipboard?: unknown } | undefined;
    // copy / paste works between the documents of a mode
    if (inGroup && outGroup && inGroup !== outGroup && Array.isArray(outGroup.clipboard)) {
        inGroup.clipboard = outGroup.clipboard;
    }
    const tabs = getTabsState(state);
    const parkId = liveId && tabs.documents[liveId] ? liveId : undefined;
    if (parkId) {
        documentStore.park(parkId, {
            slice: outgoing,
            projectMeta: pickProjectMeta(state.project[headType]),
            selectedModelIDs: (outGroup?.selectedModelArray || []).map((m) => m.modelID),
        });
        documentStore.resetEditorReady(parkId);
    }
    documentStore.resetEditorReady(inId);
    const status = documentStatusOf(outgoing, headType);
    batch(() => {
        dispatch(sliceUpdate(headType, patch));
        dispatch(projectActions.updateState(headType, { ...EMPTY_PROJECT_META, ...incoming.projectMeta }));
        dispatch(setTabs((s) => {
            let next = activateTabInModel(s, inId, Date.now());
            if (parkId && next.documents[parkId]) {
                next = updateDocument(next, parkId, { status });
            }
            return next;
        }));
    });
    dispatch(wireDocumentObjects(headType));
};

/** Toast when a switch within a mode has to wait for a running task. */
const showBusyToast = (getState, headType: EditorHeadType) => {
    const tabs = getTabsState(getState());
    const liveMeta = tabs.documents[tabs.activeDocByHead[headType]];
    const name = liveMeta ? documentDisplayName(liveMeta, i18n._('key-Tabs/Untitled')) : headType;
    toast(makeSceneToast('warning', i18n._('key-Tabs/{{name}} is still busy. Switch when it is done.', { name })));
};

/** Leaving a laser/cnc page: finish an open edit (drawing, text) first, as the 4.16 Home/Workspace buttons did. */
const leaveCurrentPage = (history: HistoryLike) => async (dispatch, getState): Promise<void> => {
    const tabs = getTabsState(getState());
    const current = tabs.documents[tabs.activeTabId];
    if (current && isEditor2D(current.headType) && isOnPage(history, current.headType)) {
        await dispatch(editorActions.onRouterWillLeave(current.headType));
    }
};

/**
 * Activates Home, Workspace or a document. A parked document of a mode is swapped in (its page is
 * mounted again); this waits while that mode is busy (toast, returns false), so a background result
 * never lands in the wrong document. Returns true when the tab is shown.
 */
const activateTab = (tabId: string, history: HistoryLike) => async (dispatch, getState): Promise<boolean> => {
    const tabs = getTabsState(getState());
    const plan = planActivation(tabs, tabId, { parked: documentStore.ids(), busyHeads: busyHeads(getState()) });
    const pathname = pathForTab(tabs, tabId);
    if (plan.kind === 'noop') {
        if (tabId === tabs.activeTabId && history.location.pathname !== pathname) {
            history.push(pathname);
        }
        return tabId === tabs.activeTabId;
    }
    if (plan.blockedBy) {
        showBusyToast(getState, plan.blockedBy);
        return false;
    }
    await dispatch(leaveCurrentPage(history));
    if (plan.kind === 'load') {
        // restored or unloaded document: it is loaded now (from its file or its auto-save)
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        const loaded: boolean = await dispatch(loadDocument(tabId, history));
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        loaded && dispatch(unloadBackgroundDocumentsIfNeeded());
        return loaded;
    }
    if (plan.kind === 'swap') {
        const head = tabs.documents[tabId].headType;
        // the live document of that mode may still have an edit open although its page is not shown
        if (isEditor2D(head) && plan.parkId && !isOnPage(history, head)) {
            const { SVGCanvasMode, SVGCanvasExt } = getState()[head];
            if (SVGCanvasMode === 'draw' || SVGCanvasExt?.elem) {
                await dispatch(editorActions.onRouterWillLeave(head));
            }
        }
        const parked = documentStore.take(tabId);
        dispatch(installDocument(head, plan.parkId, tabId, { slice: parked.slice, projectMeta: parked.projectMeta }));
    } else {
        dispatch(setTabs((s) => activateTabInModel(s, tabId, Date.now())));
    }
    if (history.location.pathname !== pathname) {
        history.push(pathname);
    }
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    dispatch(unloadBackgroundDocumentsIfNeeded());
    return true;
};

/** A document that can take a project instead of opening another tab: untitled, unchanged and empty. */
const isPristine = (state, id: string | undefined): boolean => {
    const meta = id ? getTabsState(state).documents[id] : undefined;
    if (!meta || meta.openedFile || meta.unSaved) {
        return false;
    }
    const slice = state[meta.headType];
    const project = state.project[meta.headType] || {};
    if (project.unSaved || project.openedFile) {
        return false;
    }
    const models = slice?.modelGroup?.getModels?.() || [];
    const toolPaths = slice?.toolPathGroup?.getToolPaths?.() || [];
    return models.length === 0 && toolPaths.length === 0;
};

/**
 * Gives `headType` a new empty live document in a new tab (the current live doc is parked), or reuses
 * a pristine one (`reusePristine`, used when a file is opened). The doc is active afterwards and the
 * mode's page is shown. Returns the doc id.
 */
const startDocument = (headType: EditorHeadType, init: RegisterInit, history: HistoryLike, reusePristine = true) => (dispatch, getState): string => {
    const state = getState();
    const liveId = getTabsState(state).activeDocByHead[headType];
    // the tab shows the file name while the project loads (the live meta is synced into the tab)
    const fileMeta = init.openedFile ? { openedFile: { name: init.openedFile.name, path: init.openedFile.path } } : {};
    let id: string;
    if (reusePristine && liveId && isPristine(state, liveId)) {
        id = liveId;
        dispatch(setTabs((s) => {
            const meta = s.documents[liveId];
            const openedFile = init.openedFile ? { name: init.openedFile.name, path: init.openedFile.path } : null;
            return activateTabInModel(addDocument(s, {
                ...meta,
                openedFile,
                untitledIndex: openedFile ? 0 : meta.untitledIndex,
                isRotate: init.isRotate ?? meta.isRotate,
                machineSeries: init.machineSeries ?? meta.machineSeries,
                machineToolHead: init.machineToolHead ?? meta.machineToolHead,
            }), liveId, Date.now());
        }));
        init.openedFile && dispatch(projectActions.updateState(headType, fileMeta));
    } else if (liveId && getTabsState(state).documents[liveId]) {
        id = dispatch(registerDocument(headType, init)) as unknown as string;
        const objects = createDocumentObjects(headType, state[headType]);
        dispatch(installDocument(headType, liveId, id, { slice: objects, projectMeta: fileMeta }));
    } else {
        // no document of this mode yet: the slice holds the initial (4.16) objects; start from an empty slice
        id = dispatch(registerDocument(headType, init)) as unknown as string;
        dispatch(projectActions.closeProject(headType));
        dispatch(projectActions.updateState(headType, { ...EMPTY_PROJECT_META, ...fileMeta }));
        documentStore.resetEditorReady(id);
        dispatch(setTabs((s) => activateTabInModel(s, id, Date.now())));
    }
    if (!isOnPage(history, headType)) {
        history.push(`/${headType}`);
    }
    return id;
};

/** Waits until the edit page of the doc has adopted its canvas (laser/cnc), at most `ms`. */
const editorReady = async (id: string, ms = 15000): Promise<void> => {
    let timer;
    await Promise.race([
        documentStore.whenEditorReady(id),
        new Promise<void>((resolve) => { timer = setTimeout(resolve, ms); }),
    ]);
    clearTimeout(timer);
};

/**
 * The machine a project file was made for, for its tab meta (`machineInfo` of the file); nothing when the
 * file names no machine Luban knows (the tab then gets the current machine).
 */
const projectMachineInit = (machineInfo: { series?: string; toolHead?: Record<string, string> } | null | undefined)
    : Pick<RegisterInit, 'machineSeries' | 'machineToolHead'> => {
    const machine = knownMachineOf(machineInfo?.series);
    if (!machine) {
        return {};
    }
    const toolHead = machineInfo?.toolHead && typeof machineInfo.toolHead === 'object' ? { ...machineInfo.toolHead } : null;
    return { machineSeries: machine.identifier, machineToolHead: toolHead };
};

/** After a save the project is made for the current machine: its tab gets that machine (no mismatch bar). */
const adoptCurrentMachine = (headType: EditorHeadType | string) => (dispatch, getState): void => {
    if (!isEditorHeadType(headType)) {
        return;
    }
    const id = getTabsState(getState()).activeDocByHead[headType];
    if (!id) {
        return;
    }
    const { series, toolHead } = currentMachineRef(getState());
    dispatch(setTabs((s) => updateDocument(s, id, { machineSeries: series, machineToolHead: toolHead })));
};

/**
 * Mismatch bar "Switch machine to …": the machine of the tab becomes the machine (notice with Undo).
 * Nothing switches on a tab change by itself.
 */
const switchMachineToDocument = (docId: string) => (dispatch, getState): boolean => {
    const meta = getTabsState(getState()).documents[docId];
    if (!meta || !meta.machineSeries) {
        return false;
    }
    const project = { series: meta.machineSeries, toolHead: meta.machineToolHead };
    return !!dispatch(switchMachineForProject(project, meta.headType));
};

// project files are opened one after the other
let openQueue: Promise<unknown> = Promise.resolve();
// opens waiting in or running from the queue
let openPending = 0;
// a queued open waits at most this long for its mode to finish the previous project (image processing)
const QUEUED_OPEN_WAIT_MS = 120000;

const waitUntil = async (done: () => boolean, ms: number): Promise<boolean> => {
    const start = Date.now();
    while (!done()) {
        if (Date.now() - start > ms) {
            return false;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return true;
};

interface ProjectFileLike {
    name: string;
    path?: string;
}

const TEMPLATE_PATH = /^\.\//;

/**
 * Opens a project file in its own tab. A file that is already open is focused. An empty untitled tab of
 * that mode takes the project, otherwise the mode's live doc is parked. G-code goes to the Workspace tab.
 * Returns the doc id (null for G-code, unreadable files, or when the mode is busy).
 */
const openProjectInTab = (file: ProjectFileLike, history: HistoryLike) => async (dispatch, getState): Promise<string | null> => {
    if (checkIsGCodeFile(file.name)) {
        dispatch(workspaceActions.uploadGcodeFile(file));
        await dispatch(activateTab(WORKSPACE_TAB, history));
        return null;
    }
    if (!checkIsSnapmakerProjectFile(file.name)) {
        return null;
    }
    // case-library templates ('./UserCase/...') open as new untitled projects every time
    const isTemplate = !!file.path && TEMPLATE_PATH.test(file.path);
    // a file queued behind another open (several files from the OS, a drop) waits for the mode to settle
    const queuedBehind = openPending > 0;
    openPending++;
    const focusOpen = async (path: string | undefined): Promise<string | null> => {
        const open = !isTemplate ? findDocumentByPath(getTabsState(getState()), path) : null;
        if (open) {
            if (queuedBehind) {
                await waitUntil(() => !busyHeads(getState()).includes(open.headType), QUEUED_OPEN_WAIT_MS);
            }
            await dispatch(activateTab(open.id, history));
            return open.id;
        }
        return null;
    };
    const job = openQueue.then(async (): Promise<string | null> => {
        const already = await focusOpen(file.path);
        if (already) {
            return already;
        }
        dispatch(projectActions.updateState('general', { opening: true }));
        let loadingHead: EditorHeadType | null = null;
        try {
            const parsed = await dispatch(projectActions.parseProjectFile(file));
            if (!parsed || !isEditorHeadType(parsed.headType)) {
                return null;
            }
            const headType: EditorHeadType = parsed.headType;
            // a File object only knows its path after the upload
            const openNow = await focusOpen(parsed.fileRef?.path);
            if (openNow) {
                return openNow;
            }
            // busy without our own "opening" flag
            const isBusy = () => isHeadBusy({ ...getState(), project: { general: {} } }, headType, documentStore.loadingHeads());
            if (queuedBehind && isBusy()) {
                await waitUntil(() => !isBusy(), QUEUED_OPEN_WAIT_MS);
            }
            const busy = isBusy();
            if (busy && getTabsState(getState()).activeDocByHead[headType]) {
                showBusyToast(getState, headType);
                return null;
            }
            loadingHead = headType;
            documentStore.setLoading(headType, true);
            await dispatch(leaveCurrentPage(history));
            // one machine overall: a project made for another machine switches it (notice with Undo); the
            // tab remembers the project's machine (case-library templates are for the current machine).
            // While a machine is connected nothing switches: the tab opens with the mismatch bar
            const machineInit = isTemplate ? {} : projectMachineInit(parsed.envObj?.machineInfo);
            const projectMachine = parsed.envObj?.machineInfo;
            const machineAction = isTemplate ? 'none' : machineActionOnOpen(currentMachineRef(getState()), projectMachine, headType, {
                connected: !!getState().workspace?.isConnected,
                known: !!knownMachineOf(projectMachine?.series),
            });
            if (machineAction === 'switch') {
                dispatch(switchMachineForProject(projectMachine, headType));
            } else if (machineAction === 'mismatch') {
                toast(makeSceneToast('info', i18n._('key-Tabs/{{name}} was made for {{machine}}. The machine is not switched while one is connected.', {
                    name: parsed.fileRef?.name || file.name || '',
                    machine: machineDisplayName(projectMachine?.series),
                    interpolation: { escapeValue: false },
                })));
            }
            const id = dispatch(startDocument(headType, { openedFile: parsed.fileRef, ...machineInit }, history)) as unknown as string;
            if (isEditor2D(headType)) {
                await editorReady(id);
            }
            await dispatch(projectActions.loadParsedProject(parsed));
            return id;
        } finally {
            loadingHead && documentStore.setLoading(loadingHead, false);
            dispatch(projectActions.updateState('general', { opening: false }));
        }
    });
    openQueue = job.catch(() => undefined);
    job.then(() => { openPending--; }, () => { openPending--; });
    return job;
};

/**
 * A new, empty project of `headType` in its own tab (always a new tab, also next to an empty untitled
 * one): the 4.16 new-file steps (tool head, workpiece, origin, fit) run on the new document.
 */
const newDocument = (headType: EditorHeadType, opts: { isRotate?: boolean }, history: HistoryLike) => async (dispatch, getState): Promise<string | null> => {
    const isRotate = !!opts?.isRotate;
    if (busyHeads(getState()).includes(headType) && getTabsState(getState()).activeDocByHead[headType]) {
        showBusyToast(getState, headType);
        return null;
    }
    await dispatch(leaveCurrentPage(history));
    documentStore.setLoading(headType, true);
    try {
        const id = dispatch(startDocument(headType, { isRotate }, history, false)) as unknown as string;
        await dispatch(projectActions.clearEnvironmentsForNewProject(headType));
        if (isEditor2D(headType)) {
            dispatch(editorActions.updateState(headType, {
                page: PAGE_EDITOR,
                displayedType: DISPLAYED_TYPE_MODEL,
            }));
            workerManager.setClipperWorkerEnable(false);
        } else {
            dispatch(printingActions.displayModel());
        }
        await dispatch(projectActions.setOpenedFileWithType(headType, null));
        logModuleVisit(headType, isRotate);

        const { toolHead, series } = getState().machine;
        await dispatch(machineActions.updateMachineToolHead(toolHead, series, headType));
        if (isEditor2D(headType)) {
            await editorReady(id);
            await dispatch(editorActions.initializeWorkpiece(headType as 'laser' | 'cnc', { isRotate }));
            await dispatch(editorActions.initializeOrigin(headType as 'laser' | 'cnc'));
            await dispatch(editorActions.scaleCanvasToFit(headType));
        }
        return id;
    } finally {
        documentStore.setLoading(headType, false);
    }
};

interface ModelGroupLike {
    hasModelWhole?: () => boolean | unknown[];
    getModels?: () => unknown[];
}

const hasModels = (modelGroup: ModelGroupLike | undefined): boolean => {
    if (!modelGroup) {
        return false;
    }
    if (typeof modelGroup.hasModelWhole === 'function') {
        // ModelGroup2D.hasModelWhole returns its model array, ModelGroup a boolean
        const whole: unknown = modelGroup.hasModelWhole();
        return Array.isArray(whole) ? whole.length > 0 : !!whole;
    }
    return (modelGroup.getModels?.() || []).length > 0;
};

/**
 * Whether closing the document loses work: it is unsaved and has models. The live document is judged by
 * its slice and project meta, a parked one by what was parked, an unloaded one (session restore) by its meta.
 */
const documentNeedsSave = (state, id: string): boolean => {
    const tabs = getTabsState(state);
    const meta = tabs.documents[id];
    if (!meta) {
        return false;
    }
    const head = meta.headType;
    if (tabs.activeDocByHead[head] === id) {
        return !!state.project[head]?.unSaved && hasModels(state[head]?.modelGroup);
    }
    const parked = documentStore.peek(id);
    if (parked) {
        const unSaved = parked.projectMeta.unSaved ?? meta.unSaved;
        return !!unSaved && hasModels(parked.slice.modelGroup as ModelGroupLike);
    }
    return meta.unSaved;
};

/**
 * Closes a document tab. Unsaved work is offered for saving first (in-app Save / Don't save / Cancel; a
 * parked doc is shown for that). Returns false when the close was cancelled, Save failed or Save As was
 * cancelled, or the mode of the live doc is busy. Afterwards the tab is gone, its objects are freed and
 * its auto-save folder `env/docs/<id>` is removed; the right neighbour (else the left one, else Home)
 * becomes active when it was the active tab, otherwise the active tab stays.
 */
interface FailedLoad {
    /** the meta before the load (source, unsaved flag) */
    before: DocumentMeta;
    /** the tab that was shown before the load */
    returnTo: string;
}

const closeDocumentNow = (docId: string, history: HistoryLike, failedLoad: FailedLoad | null = null) => async (dispatch, getState): Promise<boolean> => {
    const tabsAtStart = getTabsState(getState());
    const meta = tabsAtStart.documents[docId];
    if (!meta) {
        return false;
    }
    const head = meta.headType;
    const name = documentDisplayName(meta, i18n._('key-Tabs/Untitled'));
    const isLive = () => getTabsState(getState()).activeDocByHead[head] === docId;
    // a running task of the live document would land in the next document of the mode
    if (!failedLoad && isLive() && busyHeads(getState()).includes(head)) {
        toast(makeSceneToast('warning', i18n._('key-Tabs/{{name}} is still busy. Close it when it is done.', { name })));
        return false;
    }
    let returnTo = tabsAtStart.activeTabId === docId ? nextTabAfterClose(tabsAtStart, docId) : tabsAtStart.activeTabId;
    if (failedLoad) {
        // back to where the user was (the neighbour could be another document that is not loaded)
        returnTo = failedLoad.returnTo !== docId && (tabsAtStart.documents[failedLoad.returnTo] || failedLoad.returnTo === WORKSPACE_TAB)
            ? failedLoad.returnTo
            : HOME_TAB;
    }

    if (!failedLoad && documentNeedsSave(getState(), docId)) {
        if (!isLive()) {
            // Save works on the live slice: show the document
            const shown = await dispatch(activateTab(docId, history));
            if (!shown) {
                return false;
            }
        }
        const answer = await requestSaveChanges(name);
        if (answer === 'cancel') {
            return false;
        }
        if (answer === 'save') {
            const saved = await dispatch(projectActions.save(head));
            if (!saved || getState().project[head]?.unSaved) {
                return false;
            }
        }
    }

    // leave the document first: the next tab is shown (a document of the same mode parks this one)
    if (getTabsState(getState()).activeTabId !== returnTo || returnTo === docId) {
        const target = getTabsState(getState()).documents[returnTo] || returnTo === WORKSPACE_TAB ? returnTo : HOME_TAB;
        const shown = await dispatch(activateTab(target, history));
        if (!shown && getTabsState(getState()).activeTabId === docId) {
            await dispatch(activateTab(HOME_TAB, history));
        }
    }
    if (getTabsState(getState()).activeTabId === docId) {
        return false;
    }

    await documentStore.lastAutosave(docId);
    const wasLive = isLive();
    const parked = documentStore.take(docId);
    if (parked) {
        disposeDocumentObjects(parked.slice, head);
    } else if (wasLive) {
        // the slice keeps the emptied objects until another document of the mode goes live; its G-code and
        // steps go back to the initial state, so the next project opened into it does not show them
        dispatch(projectActions.closeProject(head));
        dispatch(sliceUpdate(head, closedDocumentReset(initialStateOf(head), head)));
    }
    if (failedLoad) {
        // a failed load: the tab stays (not loaded, marked) and its auto-save is kept, it may be the only copy
        dispatch(setTabs((s) => keepFailedDocument(s, docId, failedLoad.before)));
    } else {
        dispatch(setTabs((s) => removeDocument(s, docId)));
    }
    if (wasLive) {
        dispatch(projectActions.updateState(head, { ...EMPTY_PROJECT_META }));
    }
    // an autosave started by the close must not write the folder again after it is removed
    await documentStore.lastAutosave(docId);
    documentStore.delete(docId);
    if (failedLoad) {
        documentStore.resetEditorReady(docId);
        return true;
    }
    try {
        await api.env.removeEnv({ headType: head, docId });
    } catch (e) {
        log.warn(`tabs: could not remove the auto-save of ${docId}`);
    }
    return true;
};

// documents whose close is running (a second × / menu close of the same tab is ignored meanwhile)
const closing = new Set<string>();

const closeDocument = (docId: string, history: HistoryLike) => async (dispatch): Promise<boolean> => {
    if (closing.has(docId)) {
        return false;
    }
    closing.add(docId);
    try {
        return await dispatch(closeDocumentNow(docId, history));
    } finally {
        closing.delete(docId);
    }
};

// ---- session restore, lazy load and unload (memory pressure) ----

const SESSION_KEY = 'tabs.session';

// the manifest is written only after the last session was restored (else a start would overwrite it)
let sessionRestored = false;
let lastPersisted: string | null = null;

/**
 * Stores the open tabs (order, active tab, file, unsaved flag) for the next start in `machine.json`
 * (`tabs.session`). Written when the stored part changed; nothing before the last session is restored.
 */
const persistSession = () => async (dispatch, getState): Promise<void> => {
    if (!sessionRestored) {
        return;
    }
    const json = serializeSession(getTabsState(getState()));
    if (json === lastPersisted) {
        return;
    }
    try {
        machineStore.set(SESSION_KEY, json);
        lastPersisted = json;
    } catch (e) {
        log.warn(`tabs: could not store the session: ${e}`);
    }
};

/** Whether a file exists on disk (Electron); in a browser every path counts as there. */
const fileExistsOnDisk = (path: string): boolean => {
    try {
        const req = (window as unknown as { require?: (m: string) => { existsSync: (p: string) => boolean } }).require;
        return req ? req('fs').existsSync(path) : true;
    } catch (e) {
        return true;
    }
};

const displayName = (meta: { openedFile: OpenedFileRef | null; untitledIndex: number }) => documentDisplayName(meta as DocumentMeta, i18n._('key-Tabs/Untitled'));

interface EnvApiBody {
    content?: string;
    docIds?: string[];
    removed?: string[];
    migrated?: boolean;
}

const bodyOf = (response: unknown): EnvApiBody => (response as { body?: EnvApiBody } | undefined)?.body || {};

/** Ids of the documents with an auto-save folder (env/docs/<id>/config.json). */
const listEnvDocIds = async (): Promise<string[]> => bodyOf(await api.env.listEnvDocs()).docIds || [];

const readEnv = async (params: { headType: string; docId?: string }): Promise<string | null> => {
    const body = bodyOf(await api.env.getEnv(params));
    return typeof body.content === 'string' && body.content ? body.content : null;
};

const envHasModels = (content: string | null): boolean => {
    if (!content) {
        return false;
    }
    try {
        const env = JSON.parse(content) as { models?: unknown[] };
        return Array.isArray(env.models) && env.models.length > 0;
    } catch (e) {
        return false;
    }
};

/**
 * Loads the content of a document that is now live in its (empty) slice. `env`: its auto-save, restored
 * unsaved with its file name (also a migrated 4.16 auto-save); `file`: the project file. False when nothing
 * could be loaded.
 */
const loadDocumentContent = (meta: DocumentMeta) => async (dispatch): Promise<boolean> => {
    const head = meta.headType;
    const loadFile = async (): Promise<boolean> => {
        if (!meta.openedFile || !fileExistsOnDisk(meta.openedFile.path)) {
            return false;
        }
        const parsed = await dispatch(projectActions.parseProjectFile({ name: meta.openedFile.name, path: meta.openedFile.path }));
        if (!parsed || parsed.headType !== head) {
            return false;
        }
        await dispatch(projectActions.loadParsedProject(parsed));
        return true;
    };
    if (meta.source === 'file') {
        return loadFile();
    }
    const content = await readEnv({ headType: head, docId: meta.id });
    if (!content) {
        // no auto-save (anymore): the file, or an empty untitled project
        if (meta.openedFile) {
            return loadFile();
        }
        return !meta.unSaved;
    }
    const envObj = JSON.parse(content);
    await dispatch(projectActions.onRecovery(head, envObj, true, false));
    if (!meta.machineSeries && knownMachineOf(envObj?.machineInfo?.series)) {
        // a migrated 4.16 auto-save: its tab is for the machine it was made with
        const machineInit = projectMachineInit(envObj.machineInfo);
        dispatch(setTabs((s) => updateDocument(s, meta.id, machineInit)));
    }
    await dispatch(projectActions.updateState(head, {
        findLastEnvironment: false,
        openedFile: meta.openedFile ? { ...meta.openedFile } : null,
        unSaved: true,
        initState: false,
        content,
    }));
    return true;
};

/**
 * Loads a document that is not loaded (restored session, or unloaded under memory pressure): the live
 * document of its mode is parked, fresh objects go live, the page is shown, then the content is loaded
 * from its source. A failed load drops the tab with a toast. Returns true when it is shown.
 */
const loadDocument = (docId: string, history: HistoryLike) => async (dispatch, getState): Promise<boolean> => {
    const tabs = getTabsState(getState());
    const meta = tabs.documents[docId];
    if (!meta || meta.loaded) {
        return false;
    }
    const head = meta.headType;
    const returnTo = tabs.activeTabId;
    let ok = false;
    documentStore.setLoading(head, true);
    documentStore.setDocLoading(docId, true);
    try {
        const liveId = tabs.activeDocByHead[head];
        if (liveId && liveId !== docId && tabs.documents[liveId]) {
            const objects = createDocumentObjects(head, getState()[head]);
            dispatch(installDocument(head, liveId, docId, { slice: objects, projectMeta: {} }));
        } else {
            // no document of this mode is live: empty the objects the slice holds
            dispatch(projectActions.closeProject(head));
            dispatch(projectActions.updateState(head, { ...EMPTY_PROJECT_META }));
            documentStore.resetEditorReady(docId);
            dispatch(setTabs((s) => activateTabInModel(s, docId, Date.now())));
        }
        dispatch(setTabs((s) => updateDocument(s, docId, { loaded: true, source: 'live', loadFailed: false })));
        if (!isOnPage(history, head)) {
            history.push(`/${head}`);
        }
        if (isEditor2D(head)) {
            await editorReady(docId);
        }
        ok = await dispatch(loadDocumentContent(meta));
    } catch (e) {
        log.error(`tabs: could not load ${docId}: ${e instanceof Error ? e.stack : JSON.stringify(e)?.slice(0, 500)}`);
        ok = false;
    } finally {
        documentStore.setLoading(head, false);
        documentStore.setDocLoading(docId, false);
    }
    if (!ok) {
        // the tab stays (marked, not loaded) and its auto-save is never removed: a click tries again
        toast(makeSceneToast('warning', i18n._('key-Tabs/{{name}} could not be opened. Its autosave is kept; click its tab to try again.', {
            name: displayName(meta),
            interpolation: { escapeValue: false },
        })));
        // what was loaded of it is not saved anywhere (the auto-save stays as it was)
        dispatch(projectActions.updateState(head, { unSaved: false }));
        await dispatch(closeDocumentNow(docId, history, { before: meta, returnTo }));
        return false;
    }
    return true;
};

/**
 * Unloads a parked (background) document: its objects and undo history are freed, the tab stays and is
 * loaded again from its auto-save (unsaved) or its file on the next activation. The live document of a
 * mode is never unloaded. An unsaved document without an auto-save is kept. Returns true when unloaded.
 */
const unloadDocument = (docId: string) => async (dispatch, getState): Promise<boolean> => {
    const isUnloadable = () => {
        const tabs = getTabsState(getState());
        const m = tabs.documents[docId];
        return !!m && m.loaded && tabs.activeDocByHead[m.headType] !== docId && !!documentStore.peek(docId);
    };
    if (!isUnloadable()) {
        return false;
    }
    await documentStore.lastAutosave(docId);
    if (!isUnloadable()) {
        return false;
    }
    const meta = getTabsState(getState()).documents[docId];
    const parked = documentStore.peek(docId);
    const unSaved = !!(parked.projectMeta.unSaved ?? meta.unSaved) && hasModels(parked.slice.modelGroup as ModelGroupLike);
    const patch = unloadedMeta(meta, unSaved);
    if (patch.source === 'env' && unSaved) {
        // the auto-save is all that is left of it: make sure it is there
        let envIds: string[] = [];
        try {
            envIds = await listEnvDocIds();
            if (!envIds.includes(docId) && typeof parked.projectMeta.content === 'string') {
                await api.env.saveEnv({ content: parked.projectMeta.content, docId });
                envIds = await listEnvDocIds();
            }
        } catch (e) {
            log.warn(`tabs: no auto-save for ${docId}: ${e}`);
        }
        if (!envIds.includes(docId) || !isUnloadable()) {
            log.warn(`tabs: ${docId} is kept loaded (no auto-save)`);
            return false;
        }
    }
    const taken = documentStore.take(docId);
    disposeDocumentObjects(taken.slice, meta.headType);
    documentStore.resetEditorReady(docId);
    dispatch(setTabs((s) => updateDocument(s, docId, patch)));
    log.info(`tabs: unloaded ${docId} (${patch.source})`);
    return true;
};

// above this share of the JS heap limit one background document is unloaded per tab activation
const UNLOAD_HEAP_RATIO = 0.75;

/**
 * After a tab activation: when the JS heap is above 75 % of its limit, the least recently used parked
 * document is unloaded (one per call: the heap only shrinks after the next GC).
 */
const unloadBackgroundDocumentsIfNeeded = () => async (dispatch, getState): Promise<string | null> => {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    if (!memory || !memory.jsHeapSizeLimit) {
        return null;
    }
    const tabs = getTabsState(getState());
    const live = Object.values(tabs.activeDocByHead).filter(Boolean) as string[];
    const id = pickDocumentToUnload(tabs, live, memory.usedJSHeapSize / memory.jsHeapSizeLimit, UNLOAD_HEAP_RATIO);
    if (!id) {
        return null;
    }
    try {
        return (await dispatch(unloadDocument(id))) ? id : null;
    } catch (e) {
        log.warn(`tabs: unload of ${id} failed: ${e}`);
        return null;
    }
};

/**
 * Keeps the strip in sync when code still navigates with `history.push('/laser')`: the tab of the route
 * becomes active. An editor route without a document registers an untitled one for the live slice.
 */
const syncTabWithPath = (pathname: string) => (dispatch, getState): void => {
    const tabs = getTabsState(getState());
    let tabId = tabIdForPath(tabs, pathname);
    if (!tabId) {
        const head = pathname.replace(/^\//, '');
        if (!isEditorHeadType(head)) {
            return;
        }
        const { openedFile, unSaved } = getState().project[head] || {};
        tabId = dispatch(registerDocument(head, { openedFile, unSaved })) as unknown as string;
    }
    if (tabId !== getTabsState(getState()).activeTabId) {
        dispatch(setTabs((s) => activateTabInModel(s, tabId, Date.now())));
    }
};

/** Copies `unSaved` / `openedFile` of the live slices into the meta of their documents. */
const syncLiveDocumentMeta = () => (dispatch, getState): void => {
    const state = getState();
    const tabs = getTabsState(state);
    let next = tabs;
    for (const head of [HEAD_LASER, HEAD_CNC, 'printing'] as EditorHeadType[]) {
        const id = next.activeDocByHead[head];
        const meta = id && next.documents[id];
        if (!meta) {
            continue;
        }
        const project = state.project[head] || {};
        const unSaved = !!project.unSaved;
        const file = project.openedFile && project.openedFile.path ? project.openedFile : null;
        const fileChanged = (file?.path ?? null) !== (meta.openedFile?.path ?? null) || (file?.name ?? null) !== (meta.openedFile?.name ?? null);
        if (meta.unSaved !== unSaved || fileChanged) {
            const openedFile = file ? { name: file.name, path: file.path } : null;
            next = addDocument(next, {
                ...meta,
                unSaved,
                openedFile,
                untitledIndex: openedFile ? 0 : (meta.untitledIndex || nextUntitledIndex(next, head)),
            });
        }
    }
    if (next !== tabs) {
        dispatch({ type: ACTION_SET_TABS, tabs: next });
    }
};

/** Saves one document for quitting (it is shown first when it is parked). False when Save / Save As did not complete. */
const saveDocumentForQuit = (docId: string, history: HistoryLike) => async (dispatch, getState): Promise<boolean> => {
    const meta = getTabsState(getState()).documents[docId];
    if (!meta) {
        return true;
    }
    if (getTabsState(getState()).activeDocByHead[meta.headType] !== docId || getTabsState(getState()).activeTabId !== docId) {
        // the user sees which project a Save As dialog is for
        const shown = await dispatch(activateTab(docId, history));
        if (!shown) {
            return false;
        }
    }
    const saved = await dispatch(projectActions.save(meta.headType));
    return !!saved && !getState().project[meta.headType]?.unSaved;
};

/** The unsaved documents with models, grouped by mode (the live flag of each mode wins over the tab meta). */
const unsavedDocuments = () => (dispatch, getState): DocumentMeta[] => {
    dispatch(syncLiveDocumentMeta());
    const state = getState();
    const tabs = getTabsState(state);
    const liveUnsaved: Partial<Record<EditorHeadType, boolean>> = {};
    for (const head of EDITOR_HEAD_TYPES) {
        if (tabs.activeDocByHead[head]) {
            liveUnsaved[head] = !!state.project[head]?.unSaved;
        }
    }
    return collectUnsavedDocuments(tabs, liveUnsaved).filter((meta) => documentNeedsSave(state, meta.id));
};

let quitInProgress: Promise<boolean> | null = null;

// longest wait for running autosaves before the app quits
const QUIT_AUTOSAVE_WAIT_MS = 10000;

/**
 * Asks once before the app quits. No unsaved project → true. One → "Save changes to …?" (Save / Don't
 * save / Cancel). Several → one list grouped by mode ("Save selected and quit" / "Don’t save any" /
 * "Cancel"). The selected ones are saved in order; a cancelled Save As or a failed save aborts the quit
 * (false). Projects that are not saved keep their auto-save, their tabs come back on the next start
 * (board 9). A second request while the question is open gets the same answer.
 */
const confirmQuit = (history: HistoryLike) => async (dispatch, getState): Promise<boolean> => {
    if (quitInProgress) {
        return quitInProgress;
    }
    const run = async (): Promise<boolean> => {
        const unsaved: DocumentMeta[] = dispatch(unsavedDocuments());
        let toSave: string[] = [];
        if (unsaved.length === 1) {
            const answer = await requestSaveChanges(documentDisplayName(unsaved[0], i18n._('key-Tabs/Untitled')), 'quit');
            if (answer === 'cancel') {
                return false;
            }
            toSave = answer === 'save' ? [unsaved[0].id] : [];
        } else if (unsaved.length > 1) {
            const answer = await requestQuitSelection(unsaved.map((meta) => ({
                id: meta.id,
                name: documentDisplayName(meta, i18n._('key-Tabs/Untitled')),
                headType: meta.headType,
                path: meta.openedFile?.path ?? null,
            })));
            if (answer.action === 'cancel') {
                return false;
            }
            toSave = answer.action === 'save' ? unsaved.map((m) => m.id).filter((id) => answer.ids.includes(id)) : [];
        }
        for (const id of toSave) {
            const saved = await dispatch(saveDocumentForQuit(id, history));
            if (!saved) {
                return false;
            }
        }
        // the server is stopped when the window closes: running autosaves ("Don't save" relies on them) finish first
        const ids = getTabsState(getState()).order;
        if (!(await documentStore.settleAutosaves(ids, QUIT_AUTOSAVE_WAIT_MS))) {
            log.warn(`tabs: quit after ${QUIT_AUTOSAVE_WAIT_MS} ms with an autosave still running`);
        }
        await dispatch(persistSession());
        return true;
    };
    quitInProgress = run();
    try {
        return await quitInProgress;
    } finally {
        quitInProgress = null;
    }
};

/**
 * Restores the tabs of the last session (`tabs.session`): the tabs come back in their order, nothing is
 * loaded but the active tab. A file that is gone comes back from its auto-save, else the tab is dropped
 * with a toast. Without a manifest, the 4.16 auto-saves of the modes become tabs (migration). Auto-save
 * folders that no restored tab uses are removed. Runs once at start, before files given to the app open.
 */
const restoreSessionNow = (history: HistoryLike) => async (dispatch, getState): Promise<RestoreOutcome> => {
    const current = getTabsState(getState());
    // a dev reload on an editor route registers an empty untitled doc for the route: it gives way
    if (current.order.some((id) => !isPristine(getState(), id))) {
        log.warn('tabs: documents are open already, the last session is not restored');
        return 'kept-open';
    }
    let envIds: string[];
    try {
        envIds = await listEnvDocIds();
    } catch (e) {
        // without the list an auto-save could be taken for an orphan: restore nothing, remove nothing, and
        // the stored session is not overwritten in this run (see sessionPersistAllowed)
        log.warn(`tabs: could not list the auto-saves: ${e}`);
        return 'unreadable';
    }
    let raw: unknown = null;
    try {
        raw = machineStore.get(SESSION_KEY);
    } catch (e) {
        raw = null;
    }
    const manifest = parseSession(raw);
    let restored: TabsState;
    let plan: RestorePlan | null = null;
    if (manifest) {
        plan = planRestore(manifest, envIds, fileExistsOnDisk);
        restored = plan.state;
    } else {
        // first start with tabs: the 4.16 auto-saves of the modes become tabs. Each one is copied into its
        // own document folder first (server side; env/{head} is emptied only after the copy), so the tab
        // loads from env/docs/<id> and comes back on every start until it is closed
        const migrated: Array<{ headType: EditorHeadType; id: string }> = [];
        for (const head of EDITOR_HEAD_TYPES) {
            try {
                if (envHasModels(await readEnv({ headType: head }))) {
                    const id = uuid();
                    if (bodyOf(await api.env.migrateLegacyEnv({ headType: head, docId: id })).migrated) {
                        migrated.push({ headType: head, id });
                    }
                }
            } catch (e) {
                // env/{head} stays as it is (4.16 still finds it)
                log.warn(`tabs: could not migrate the ${head} auto-save: ${e}`);
            }
        }
        restored = planLegacyMigration(migrated);
    }

    // auto-saves that no restored tab uses are removed (only env/docs/<uuid> folders, on the server)
    try {
        const body = bodyOf(await api.env.pruneEnvDocs({ keep: restored.order }));
        body.removed?.length && log.info(`tabs: removed ${body.removed.length} old auto-saves`);
    } catch (e) {
        log.warn(`tabs: could not remove old auto-saves: ${e}`);
    }

    const { state, activate } = restoreEntryPoint(restored);
    if (state.order.length > 0) {
        // the empty route doc of a dev reload is replaced
        current.order.forEach((id) => documentStore.delete(id));
        dispatch({ type: ACTION_SET_TABS, tabs: { ...state, workspaceNewCount: current.workspaceNewCount } });
        if (history.location.pathname !== '/') {
            history.push('/');
        }
        const count = state.order.length;
        toast(makeSceneToast('info', count === 1
            ? i18n._('key-Tabs/Restored 1 project from your last session.')
            : i18n._('key-Tabs/Restored {{count}} projects from your last session.', { count })));
        if (plan?.autosaved.length) {
            toast(makeSceneToast('info', i18n._('key-Tabs/{{name}} has autosaved changes.', { name: displayName(plan.autosaved[0]) })));
        }
        if (activate !== HOME_TAB) {
            await dispatch(activateTab(activate, history));
        }
    }
    for (const meta of plan?.missingFile || []) {
        toast(makeSceneToast('warning', i18n._('key-Tabs/{{name}} was not found. It was restored from its autosave.', { name: displayName(meta) })));
    }
    for (const d of plan?.dropped || []) {
        toast(makeSceneToast('warning', i18n._('key-Tabs/{{name}} could not be found and was not reopened.', { name: displayName(d) })));
    }
    return 'restored';
};

/**
 * The machine settings switch the machine and reload the window (4.16). With open tabs nothing is
 * discarded: the auto-saves of the live documents are written and the session is stored, so every tab
 * comes back after the reload (the tabs of the previous machine with the mismatch bar), and the notice
 * "Machine switched to …" is shown after the reload. Without tabs the 4.16 behaviour stays (the auto-save
 * of the page's mode is cleared).
 */
const prepareMachineReload = (previous: MachineRef, next: MachineRef, headType: string | null) => async (dispatch, getState): Promise<void> => {
    const tabs = getTabsState(getState());
    if (tabs.order.length === 0) {
        if (headType) {
            await dispatch(projectActions.clearSavedEnvironment(headType));
        }
        return;
    }
    const changed = EDITOR_HEAD_TYPES.some((head) => needsMachineSwitch(previous, next, head));
    if (changed) {
        stashMachineNotice(next.series, previous);
    }
    for (const head of EDITOR_HEAD_TYPES) {
        const id = tabs.activeDocByHead[head];
        if (id && getState().project[head]?.unSaved) {
            dispatch(projectActions.autoSaveEnvironment(head));
        }
    }
    await Promise.all(tabs.order.map(async (id) => documentStore.lastAutosave(id)));
    dispatch(syncLiveDocumentMeta());
    await dispatch(persistSession());
};

let restoreRun: Promise<void> | null = null;

/**
 * Restores the last session once (see restoreSessionNow). Project files opened meanwhile wait for it
 * (same queue); afterwards the session is stored on every change.
 */
const restoreSession = (history: HistoryLike) => async (dispatch): Promise<void> => {
    if (restoreRun) {
        return restoreRun;
    }
    const job = openQueue.then(async () => {
        let outcome: RestoreOutcome = 'failed';
        try {
            outcome = await dispatch(restoreSessionNow(history));
        } catch (e) {
            log.error(`tabs: session restore failed: ${e}`);
        }
        if (sessionPersistAllowed(outcome)) {
            sessionRestored = true;
            await dispatch(persistSession());
        } else {
            log.warn(`tabs: the session is not stored in this run (restore: ${outcome})`);
        }
    });
    openQueue = job.catch(() => undefined);
    restoreRun = job;
    return job;
};

/**
 * After "Load G-code to Workspace" or Export: the Workspace tab is shown with a toast naming what was
 * loaded and a "Back to {{name}}" button. The "{{count}} new" badge of the Workspace tab counts the files
 * until the Workspace is shown (when the switch does not happen, the badge stays).
 */
const showInWorkspace = (sourceDocId: string | null | undefined, count: number, history: HistoryLike) => async (dispatch, getState): Promise<boolean> => {
    const tabs = getTabsState(getState());
    if (count > 0 && tabs.activeTabId !== WORKSPACE_TAB) {
        dispatch(setTabs((s) => ({ ...s, workspaceNewCount: s.workspaceNewCount + count })));
    }
    const shown: boolean = await dispatch(activateTab(WORKSPACE_TAB, history));
    const meta = sourceDocId ? getTabsState(getState()).documents[sourceDocId] : undefined;
    if (count > 0 && meta) {
        const name = displayName(meta);
        const text = count === 1
            ? i18n._('key-Tabs/Loaded into Workspace · 1 file from {{name}}', { name, interpolation: { escapeValue: false } })
            : i18n._('key-Tabs/Loaded into Workspace · {{count}} files from {{name}}', { count, name, interpolation: { escapeValue: false } });
        const content = makeSceneToast('success', text, {
            label: i18n._('key-Tabs/Back to {{name}}', { name, interpolation: { escapeValue: false } }),
            onClick: () => {
                if (getTabsState(getState()).documents[sourceDocId]) {
                    dispatch(activateTab(sourceDocId, history));
                }
            },
        });
        // loading the same project again updates its toast
        const toastId = `workspace-load-${sourceDocId}`;
        if (toast.isActive(toastId)) {
            toast.update(toastId, { render: content });
        } else {
            toast(content, { toastId });
        }
    }
    return shown;
};

export const tabsActions = {
    setTabs,
    registerDocument,
    ensureLiveDocument,
    activateTab,
    syncTabWithPath,
    syncLiveDocumentMeta,
    openProjectInTab,
    newDocument,
    installDocument,
    closeDocument,
    confirmQuit,
    persistSession,
    restoreSession,
    loadDocument,
    unloadDocument,
    unloadBackgroundDocumentsIfNeeded,
    adoptCurrentMachine,
    switchMachineToDocument,
    prepareMachineReload,
    showInWorkspace,
};

export default tabsActions;
