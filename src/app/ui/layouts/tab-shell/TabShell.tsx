import React, { useCallback, useEffect } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { tabsActions } from '../../../flux/project/actions-tabs';
import { TabsState } from '../../../flux/project/tabs-model';
import UniApi from '../../../lib/uni-api';
import TabStrip, { tabDisplayName } from './TabStrip';
import { useTabRouteSync } from './useTabRouteSync';
import styles from './tab-shell.styl';

export const TAB_STRIP_HEIGHT = 40;

/** Height of the tab strip in CSS px (0 when there is none), for code that measures with window.innerHeight. */
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

    useEffect(() => {
        // pages subtract the strip from 100vh with calc(100vh - var(--tab-strip-height) - …)
        document.documentElement.style.setProperty('--tab-strip-height', `${TAB_STRIP_HEIGHT}px`);
        document.body.style.setProperty('--tab-strip-height', `${TAB_STRIP_HEIGHT}px`);
    }, []);

    // the tab meta follows unSaved / openedFile of the live documents
    const liveMetaKey = JSON.stringify(liveMeta);
    useEffect(() => {
        dispatch(tabsActions.syncLiveDocumentMeta());
    }, [dispatch, liveMetaKey, tabs.activeDocByHead]);

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

    return (
        <div className={styles['tab-shell']}>
            <TabStrip onActivate={onActivate} />
            <div className={styles['tab-content']}>
                {children}
            </div>
        </div>
    );
};

export default TabShell;
