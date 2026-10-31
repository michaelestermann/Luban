import classNames from 'classnames';
import React from 'react';
import { shallowEqual, useSelector } from 'react-redux';

import {
    DocumentMeta,
    EditorHeadType,
    HOME_TAB,
    TabsState,
    WORKSPACE_TAB,
    documentDisplayName,
} from '../../../flux/project/tabs-model';
import i18n from '../../../lib/i18n';
import styles from './tab-shell.styl';

const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
};

export const HEAD_COLORS: Record<EditorHeadType, string> = {
    printing: '#0f766e',
    laser: '#c2410c',
    cnc: '#4338ca',
};

export const HeadIcon: React.FC<{ headType: EditorHeadType; size?: number }> = ({ headType, size = 15 }) => {
    let paths: React.ReactNode;
    if (headType === 'cnc') {
        paths = (
            <>
                <path d="M9 3h6v5H9z" />
                <path d="M10 8l.8 13h2.4L14 8" />
                <path d="M10.4 12.5l3.2-1.8M10.6 16.5l2.8-1.6" />
            </>
        );
    } else if (headType === 'laser') {
        paths = (
            <>
                <rect x="7" y="3" width="10" height="7" rx="1.5" />
                <path d="M12 10v5" />
                <path d="M8 21l4-4 4 4" />
            </>
        );
    } else {
        paths = (
            <>
                <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
                <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
            </>
        );
    }
    return (
        <span className={styles.icon} style={{ color: HEAD_COLORS[headType] }}>
            <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>{paths}</svg>
        </span>
    );
};

export const WorkspaceIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
    <span className={styles.icon} style={{ color: '#15803d' }}>
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
            <rect x="3" y="4" width="18" height="12" rx="1.5" />
            <path d="M8 20h8M12 16v4" />
        </svg>
    </span>
);

const HomeIcon: React.FC = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2}>
        <path d="M4 11l8-7 8 7" />
        <path d="M6 10v10h12V10" />
        <path d="M10 20v-5h4v5" />
    </svg>
);

const PlusIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <path d="M12 5v14M5 12h14" />
    </svg>
);

const CloseIcon: React.FC = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.2}>
        <path d="M6 6l12 12M18 6L6 18" />
    </svg>
);

export function tabDisplayName(meta: DocumentMeta): string {
    return documentDisplayName(meta, i18n._('key-Tabs/Untitled'));
}

function onKeyActivate(e: React.KeyboardEvent, activate: () => void): void {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
    }
}

interface TabStripProps {
    onActivate: (tabId: string) => void;
    onClose?: (tabId: string) => void;
    onAdd?: () => void;
}

const TabStrip: React.FC<TabStripProps> = ({ onActivate, onClose, onAdd }) => {
    const tabs: TabsState = useSelector((state: { project: { tabs: TabsState } }) => state.project.tabs);
    const isConnected = useSelector((state: { workspace: { isConnected: boolean } }) => state.workspace.isConnected, shallowEqual);

    const homeActive = tabs.activeTabId === HOME_TAB;
    const workspaceActive = tabs.activeTabId === WORKSPACE_TAB;
    const docs = tabs.order.map((id) => tabs.documents[id]).filter(Boolean);

    return (
        <div className={styles['tab-strip']} role="tablist" aria-label={i18n._('key-Tabs/Home, Workspace and projects')}>
            <div
                className={classNames(styles.tab, styles.home, { [styles.active]: homeActive })}
                role="tab"
                aria-selected={homeActive}
                data-tab-id={HOME_TAB}
                data-tab-kind="home"
                data-unsaved="false"
                title={i18n._('key-Tabs/Home')}
                tabIndex={homeActive ? 0 : -1}
                onClick={() => onActivate(HOME_TAB)}
                onKeyDown={(e) => onKeyActivate(e, () => onActivate(HOME_TAB))}
            >
                <button type="button" className={styles.name} aria-label={i18n._('key-Tabs/Home')}>
                    <HomeIcon />
                </button>
            </div>
            <div
                className={classNames(styles.tab, styles.workspace, { [styles.active]: workspaceActive })}
                role="tab"
                aria-selected={workspaceActive}
                data-tab-id={WORKSPACE_TAB}
                data-tab-kind="workspace"
                data-unsaved="false"
                title={i18n._('key-Tabs/Workspace (pinned, cannot be closed)')}
                tabIndex={workspaceActive ? 0 : -1}
                onClick={() => onActivate(WORKSPACE_TAB)}
                onKeyDown={(e) => onKeyActivate(e, () => onActivate(WORKSPACE_TAB))}
            >
                <WorkspaceIcon />
                <button type="button" className={styles.name}>{i18n._('key-Tabs/Workspace')}</button>
                <span
                    className={classNames(styles['conn-dot'], { [styles.connected]: isConnected })}
                    title={isConnected ? i18n._('key-Tabs/Connected') : i18n._('key-Tabs/Not connected')}
                />
                {tabs.workspaceNewCount > 0 && !workspaceActive && (
                    <span className={styles.badge}>{i18n._('key-Tabs/{{count}} new', { count: tabs.workspaceNewCount })}</span>
                )}
            </div>
            <span className={styles.separator} />
            <div className={styles['doc-tabs']}>
                {docs.map((meta) => {
                    const active = tabs.activeTabId === meta.id;
                    const name = tabDisplayName(meta);
                    return (
                        <div
                            key={meta.id}
                            className={classNames(styles.tab, { [styles.active]: active, [styles.dirty]: meta.unSaved })}
                            role="tab"
                            aria-selected={active}
                            data-tab-id={meta.id}
                            data-tab-kind="doc"
                            data-head-type={meta.headType}
                            data-unsaved={meta.unSaved ? 'true' : 'false'}
                            title={meta.openedFile?.path || name}
                            tabIndex={active ? 0 : -1}
                            onClick={() => onActivate(meta.id)}
                            onKeyDown={(e) => onKeyActivate(e, () => onActivate(meta.id))}
                        >
                            <HeadIcon headType={meta.headType} />
                            <button type="button" className={styles.name}>{name}</button>
                            {meta.unSaved && <span className={styles['unsaved-dot']} aria-label={i18n._('key-Tabs/Unsaved changes')} />}
                            <button
                                type="button"
                                className={styles.close}
                                aria-label={i18n._('key-Tabs/Close {{name}}', { name })}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClose && onClose(meta.id);
                                }}
                            >
                                <CloseIcon />
                            </button>
                        </div>
                    );
                })}
                <button
                    type="button"
                    className={styles['icon-button']}
                    aria-label={i18n._('key-Tabs/New or open project')}
                    title={i18n._('key-Tabs/New or open project')}
                    onClick={() => onAdd && onAdd()}
                >
                    <PlusIcon />
                </button>
            </div>
        </div>
    );
};

export default TabStrip;
