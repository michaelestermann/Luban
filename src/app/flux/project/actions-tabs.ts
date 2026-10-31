/**
 * Tab thunks (Luban 4.17 tabs): register documents, activate tabs, keep the strip in sync with the route.
 *
 * The registry itself is pure (`tabs-model.ts`); these thunks read `state.project.tabs`, compute the next
 * state and dispatch `project/SET_TABS`.
 */
import { v4 as uuid } from 'uuid';

import { HEAD_CNC, HEAD_LASER } from '../../constants/machines';
import { actions as editorActions } from '../editor';
import {
    DocumentMeta,
    EditorHeadType,
    HOME_TAB,
    OpenedFileRef,
    TabsState,
    activateTab as activateTabInModel,
    addDocument,
    isEditorHeadType,
    nextUntitledIndex,
    pathForTab,
    tabIdForPath,
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

/**
 * Activates Home, Workspace or a document that is live in its slice. Returns false if the tab cannot be
 * shown (unknown id, or a document that is not live: switching within a mode comes with Task 5).
 */
const activateTab = (tabId: string, history: HistoryLike) => async (dispatch, getState): Promise<boolean> => {
    const tabs = getTabsState(getState());
    const meta = tabs.documents[tabId];
    if (tabId !== HOME_TAB && tabId !== 'workspace' && !meta) {
        return false;
    }
    if (meta && tabs.activeDocByHead[meta.headType] !== tabId) {
        return false;
    }
    const pathname = pathForTab(tabs, tabId);
    if (tabId === tabs.activeTabId && history.location.pathname === pathname) {
        return true;
    }
    // leaving a laser/cnc page: finish an open edit (drawing, text) first, as the 4.16 Home/Workspace buttons did
    const leaving = tabs.documents[tabs.activeTabId];
    if (leaving && (leaving.headType === HEAD_LASER || leaving.headType === HEAD_CNC) && history.location.pathname === `/${leaving.headType}`) {
        await dispatch(editorActions.onRouterWillLeave(leaving.headType));
    }
    dispatch(setTabs((s) => activateTabInModel(s, tabId, Date.now())));
    if (history.location.pathname !== pathname) {
        history.push(pathname);
    }
    return true;
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
};

export default tabsActions;
