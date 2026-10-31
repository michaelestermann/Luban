import React, { useCallback, useEffect, useState } from 'react';
import { shallowEqual, useDispatch, useSelector, useStore } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { tabsActions } from '../../../flux/project/actions-tabs';
import { TabsState, initialPanelCollapsed } from '../../../flux/project/tabs-model';
import log from '../../../lib/log';
import UniApi from '../../../lib/uni-api';
import { machineStore } from '../../../store/local-storage';
import DialogHost from './DialogHost';
import { MISMATCH_BAR_HEIGHT, MachineMismatchBar, MachineNotice, useActiveMismatch } from './MachineNotice';
import ModeChooser from './ModeChooser';
import ProjectPanel, { PROJECT_PANEL_COLLAPSED_WIDTH, PROJECT_PANEL_WIDTH } from './ProjectPanel';
import TabStrip, { tabDisplayName } from './TabStrip';
import { useTabRouteSync } from './useTabRouteSync';
import styles from './tab-shell.styl';

export const TAB_STRIP_HEIGHT = 40;

const PANEL_COLLAPSED_KEY = 'tabs.panelCollapsed';

function readPanelCollapsed(): boolean {
    let stored: boolean | string | undefined;
    try {
        stored = machineStore.get(PANEL_COLLAPSED_KEY);
    } catch (e) {
        stored = undefined;
    }
    return initialPanelCollapsed(stored, window.innerWidth);
}

/** Sets a CSS custom property on html and body (pages read it in calc()). */
function setShellVariable(name: string, px: number): void {
    document.documentElement.style.setProperty(name, `${px}px`);
    document.body.style.setProperty(name, `${px}px`);
}

/**
 * Height of the tab strip in CSS px (0 when there is none), for code that measures with window.innerHeight.
 * It includes the machine mismatch bar while that shows (the page is below it).
 */
export function getTabStripHeight(): number {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--tab-strip-height');
    return parseFloat(value) || 0;
}

/** Returns a callback that activates a tab (Home, Workspace or a document) like a click on it. */
export function useActivateTab(): (tabId: string) => Promise<boolean> {
    const dispatch = useDispatch();
    const history = useHistory();
    return useCallback(
        async (tabId: string) => dispatch(tabsActions.activateTab(tabId, history)) as unknown as Promise<boolean>,
        [dispatch, history]
    );
}

/**
 * Returns a callback that shows the Workspace tab. With a file count (G-code of `headType`'s live project
 * was loaded into the Workspace) it also shows the toast "Loaded into Workspace · … from {{name}}".
 */
export function useOpenWorkspace(headType: string): (count?: number) => Promise<boolean> {
    const dispatch = useDispatch();
    const history = useHistory();
    const store = useStore();
    return useCallback(async (count?: number) => {
        const sourceDocId = (store.getState() as { project: { tabs: TabsState } }).project.tabs.activeDocByHead[headType];
        return dispatch(tabsActions.showInWorkspace(sourceDocId, typeof count === 'number' ? count : 0, history)) as unknown as Promise<boolean>;
    }, [dispatch, history, store, headType]);
}

type ProjectHeadState = { unSaved?: boolean; openedFile?: { name: string; path: string } | null };

const TabShell: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    const dispatch = useDispatch();
    const history = useHistory();
    useTabRouteSync(history);
    const activateTab = useActivateTab();

    const tabs: TabsState = useSelector((state: { project: { tabs: TabsState } }) => state.project.tabs);
    const liveMeta = useSelector((state: { project: Record<string, ProjectHeadState> }) => ['printing', 'laser', 'cnc'].map((head) => ({
        unSaved: !!state.project[head]?.unSaved,
        path: state.project[head]?.openedFile?.path ?? null,
        name: state.project[head]?.openedFile?.name ?? null,
    })), shallowEqual);

    // a project made for another machine shows the mismatch bar above its page
    const mismatch = useActiveMismatch();
    useEffect(() => {
        // pages subtract the strip (and the bar) from 100vh with calc(100vh - var(--tab-strip-height) - …)
        setShellVariable('--tab-strip-height', TAB_STRIP_HEIGHT + (mismatch ? MISMATCH_BAR_HEIGHT : 0));
        window.dispatchEvent(new Event('resize'));
    }, [mismatch]);

    // project panel left of the page: collapsed state stored on toggle (narrow windows start collapsed)
    const [panelCollapsed, setPanelCollapsed] = useState<boolean>(readPanelCollapsed);
    useEffect(() => {
        // pages subtract the panel from 100vw with calc(100vw - var(--project-panel-width) - …)
        setShellVariable('--project-panel-width', panelCollapsed ? PROJECT_PANEL_COLLAPSED_WIDTH : PROJECT_PANEL_WIDTH);
        // the canvases and layouts measure on the window resize event
        window.dispatchEvent(new Event('resize'));
    }, [panelCollapsed]);
    const togglePanel = useCallback(() => {
        setPanelCollapsed((collapsed) => {
            const next = !collapsed;
            try {
                machineStore.set(PANEL_COLLAPSED_KEY, next);
            } catch (e) {
                log.warn(`tabs: could not store the panel state: ${e}`);
            }
            return next;
        });
    }, []);

    // the tab meta follows unSaved / openedFile of the live documents
    const liveMetaKey = JSON.stringify(liveMeta);
    useEffect(() => {
        dispatch(tabsActions.syncLiveDocumentMeta());
    }, [dispatch, liveMetaKey, tabs.activeDocByHead]);

    // the open tabs are stored for the next start (after the last session was restored)
    useEffect(() => {
        dispatch(tabsActions.persistSession());
    }, [dispatch, tabs]);

    // E2E hook of development builds: unload a background tab as memory pressure would
    useEffect(() => {
        if (process.env.NODE_ENV === 'production') {
            return undefined;
        }
        const w = window as unknown as { __lubanTabs?: unknown };
        w.__lubanTabs = {
            unloadDocument: async (docId: string) => dispatch(tabsActions.unloadDocument(docId)),
            unloadBackgroundDocumentsIfNeeded: async () => dispatch(tabsActions.unloadBackgroundDocumentsIfNeeded()),
        };
        return () => {
            delete w.__lubanTabs;
        };
    }, [dispatch]);

    // window title and the Save menu entry follow the active tab
    const activeMeta = tabs.documents[tabs.activeTabId];
    const isDocTab = !!activeMeta;
    const title = activeMeta ? `${tabDisplayName(activeMeta)}${activeMeta.unSaved ? ' *' : ''}` : '';
    useEffect(() => {
        UniApi.Window.setOpenedFile(title);
        UniApi.Menu.setItemEnabled('save', isDocTab);
    }, [title, isDocTab]);

    const onActivate = useCallback((tabId: string) => {
        activateTab(tabId);
    }, [activateTab]);

    // × / middle click: in-app save prompt for unsaved work (DialogHost)
    const onClose = useCallback((tabId: string) => {
        dispatch(tabsActions.closeDocument(tabId, history));
    }, [dispatch, history]);

    // "+" asks the mode first (ModeChooser)
    const [chooserOpen, setChooserOpen] = useState(false);
    const onAdd = useCallback(() => setChooserOpen(true), []);
    const closeChooser = useCallback(() => setChooserOpen(false), []);

    return (
        <div className={styles['tab-shell']}>
            <TabStrip onActivate={onActivate} onAdd={onAdd} onClose={onClose} />
            <div className={styles['tab-body']}>
                <ProjectPanel collapsed={panelCollapsed} onToggle={togglePanel} onAdd={onAdd} onActivate={onActivate} onClose={onClose} />
                <div className={styles['tab-page']}>
                    {mismatch && <MachineMismatchBar />}
                    <div className={styles['tab-content']}>
                        {children}
                    </div>
                </div>
            </div>
            {chooserOpen && <ModeChooser onClose={closeChooser} />}
            <MachineNotice />
            <DialogHost />
        </div>
    );
};

export default TabShell;
