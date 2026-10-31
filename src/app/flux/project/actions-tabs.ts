/**
 * Tab thunks (Luban 4.17 tabs): register documents, activate tabs, keep the strip in sync with the route.
 *
 * The registry itself is pure (`tabs-model.ts`); these thunks read `state.project.tabs`, compute the next
 * state and dispatch `project/SET_TABS`.
 */
import { batch } from 'react-redux';
import { v4 as uuid } from 'uuid';

import { DISPLAYED_TYPE_MODEL, PAGE_EDITOR } from '../../constants';
import { HEAD_CNC, HEAD_LASER } from '../../constants/machines';
import { checkIsGCodeFile, checkIsSnapmakerProjectFile } from '../../lib/check-name';
import { logModuleVisit } from '../../lib/gaEvent';
import i18n from '../../lib/i18n';
import log from '../../lib/log';
import workerManager from '../../lib/manager/workerManager';
import { toast } from '../../ui/components/Toast';
import { makeSceneToast } from '../../ui/views/toasts/SceneToast';
/* eslint-disable import/no-cycle */
import { actions as editorActions } from '../editor';
import { actions as machineActions } from '../machine';
import { actions as printingActions } from '../printing';
import { actions as workspaceActions } from '../workspace';
import { actions as projectActions } from './index';
import { createDocumentObjects, wireDocumentObjects } from './document-objects';
/* eslint-enable import/no-cycle */
import { documentStore } from './document-store';
import { PROJECT_META_KEYS, documentStatusOf, isHeadBusy, planActivation, swapDocumentState } from './document-swap';
import {
    DocumentMeta,
    EDITOR_HEAD_TYPES,
    EditorHeadType,
    OpenedFileRef,
    TabsState,
    WORKSPACE_TAB,
    activateTab as activateTabInModel,
    addDocument,
    documentDisplayName,
    findDocumentByPath,
    isEditorHeadType,
    nextUntitledIndex,
    pathForTab,
    tabIdForPath,
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
    if (plan.kind === 'load') {
        // unloaded documents come with session restore (Task 9)
        log.warn(`tabs: document ${tabId} is not loaded`);
        return false;
    }
    await dispatch(leaveCurrentPage(history));
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
 * a pristine one. The doc is active afterwards and the mode's page is shown. Returns the doc id.
 */
const startDocument = (headType: EditorHeadType, init: RegisterInit, history: HistoryLike) => (dispatch, getState): string => {
    const state = getState();
    const liveId = getTabsState(state).activeDocByHead[headType];
    // the tab shows the file name while the project loads (the live meta is synced into the tab)
    const fileMeta = init.openedFile ? { openedFile: { name: init.openedFile.name, path: init.openedFile.path } } : {};
    let id: string;
    if (liveId && isPristine(state, liveId)) {
        id = liveId;
        dispatch(setTabs((s) => {
            const meta = s.documents[liveId];
            const openedFile = init.openedFile ? { name: init.openedFile.name, path: init.openedFile.path } : null;
            return activateTabInModel(addDocument(s, {
                ...meta,
                openedFile,
                untitledIndex: openedFile ? 0 : meta.untitledIndex,
                isRotate: init.isRotate ?? meta.isRotate,
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

// project files are opened one after the other
let openQueue: Promise<unknown> = Promise.resolve();

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
    const focusOpen = async (path: string | undefined): Promise<string | null> => {
        const open = !isTemplate ? findDocumentByPath(getTabsState(getState()), path) : null;
        if (open) {
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
            const busy = isHeadBusy({ ...getState(), project: { general: {} } }, headType, documentStore.loadingHeads());
            if (busy && getTabsState(getState()).activeDocByHead[headType]) {
                showBusyToast(getState, headType);
                return null;
            }
            loadingHead = headType;
            documentStore.setLoading(headType, true);
            await dispatch(leaveCurrentPage(history));
            const id = dispatch(startDocument(headType, { openedFile: parsed.fileRef }, history)) as unknown as string;
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
    return job;
};

/**
 * A new, empty project of `headType` in its own tab (an empty untitled tab of that mode is reused):
 * the 4.16 new-file steps (tool head, workpiece, origin, fit) run on the new document.
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
        const id = dispatch(startDocument(headType, { isRotate }, history)) as unknown as string;
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
};

export default tabsActions;
