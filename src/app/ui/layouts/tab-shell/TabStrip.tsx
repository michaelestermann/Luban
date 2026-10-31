import classNames from 'classnames';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { shallowEqual, useSelector } from 'react-redux';

import {
    DocumentMeta,
    EditorHeadType,
    HOME_TAB,
    TabsState,
    WORKSPACE_TAB,
    documentDisplayName,
    filterDocumentsByQuery,
    scrollOffsetToReveal,
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

const ChevronIcon: React.FC<{ direction: 'left' | 'right' | 'down' }> = ({ direction }) => {
    let d = 'M6 9l6 6 6-6';
    if (direction === 'left') {
        d = 'M15 6l-6 6 6 6';
    } else if (direction === 'right') {
        d = 'M9 6l6 6-6 6';
    }
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2}>
            <path d={d} />
        </svg>
    );
};

const SearchIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" />
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

interface AllTabsMenuProps {
    tabs: TabsState;
    onActivate: (tabId: string) => void;
    onDismiss: () => void;
}

const GROUP_LABEL_KEYS: Record<string, string> = {
    printing: 'key-Tabs/3D Printing',
    laser: 'key-Tabs/Laser',
    cnc: 'key-Tabs/CNC',
};

/** The button at the end of the strip: all open projects grouped by mode, with a search field (design D). */
const AllTabsMenu: React.FC<AllTabsMenuProps> = ({ tabs, onActivate, onDismiss }) => {
    const [query, setQuery] = useState('');
    const menuRef = useRef<HTMLDivElement>(null);
    const groups = filterDocumentsByQuery(tabs, query, i18n._('key-Tabs/Untitled'));
    const first = groups[0]?.documents[0];

    useEffect(() => {
        const onPointer = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (menuRef.current && !menuRef.current.contains(target) && !target.closest('[data-all-tabs]')) {
                onDismiss();
            }
        };
        document.addEventListener('mousedown', onPointer, true);
        return () => document.removeEventListener('mousedown', onPointer, true);
    }, [onDismiss]);

    return (
        <div className={styles['all-tabs']} ref={menuRef} role="dialog" aria-label={i18n._('key-Tabs/All tabs')} data-all-tabs-menu>
            <label className={styles['all-tabs-search']}>
                <SearchIcon />
                <input
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    value={query}
                    placeholder={i18n._('key-Tabs/Search {{count}} open projects', { count: tabs.order.length })}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            onDismiss();
                        } else if (e.key === 'Enter' && first) {
                            e.preventDefault();
                            onActivate(first.id);
                        }
                    }}
                    data-all-tabs-search
                />
            </label>
            <div className={styles['all-tabs-list']}>
                {groups.map((group) => (
                    <div key={group.headType} data-all-tabs-group={group.headType}>
                        <div className={styles['all-tabs-label']}>{i18n._(GROUP_LABEL_KEYS[group.headType])}</div>
                        {group.documents.map((meta) => (
                            <button
                                key={meta.id}
                                type="button"
                                className={classNames(styles['all-tabs-row'], { [styles.selected]: tabs.activeTabId === meta.id })}
                                title={meta.openedFile?.path || tabDisplayName(meta)}
                                onClick={() => onActivate(meta.id)}
                                data-all-tabs-doc={meta.id}
                            >
                                <HeadIcon headType={meta.headType} />
                                <span className={styles['all-tabs-name']}>{tabDisplayName(meta)}</span>
                                {meta.unSaved && <span className={styles['unsaved-dot']} aria-label={i18n._('key-Tabs/Unsaved changes')} />}
                            </button>
                        ))}
                    </div>
                ))}
                {groups.length === 0 && (
                    <div className={styles['all-tabs-empty']}>{i18n._('key-Tabs/No open project matches.')}</div>
                )}
            </div>
        </div>
    );
};

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

    // overflow: the tabs shrink to 120 px (CSS), then the strip scrolls with the arrow buttons
    const scrollRef = useRef<HTMLDivElement>(null);
    const [overflow, setOverflow] = useState({ left: false, right: false });
    const updateOverflow = useCallback(() => {
        const el = scrollRef.current;
        if (!el) {
            return;
        }
        const left = el.scrollLeft > 0;
        const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
        setOverflow((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    }, []);
    // the active tab is always scrolled into view: on activation, when tabs come or go or change, and when
    // the strip gets narrower (window or panel)
    const activeTabId = tabs.activeTabId;
    const revealActive = useCallback(() => {
        const el = scrollRef.current;
        if (!el) {
            return;
        }
        const tab = el.querySelector<HTMLElement>(`[data-tab-id="${activeTabId}"]`);
        if (tab) {
            const next = scrollOffsetToReveal(el.scrollLeft, el.clientWidth, tab.offsetLeft - el.offsetLeft, tab.offsetWidth);
            if (Math.abs(next - el.scrollLeft) >= 1) {
                el.scrollLeft = next;
            }
        }
        updateOverflow();
    }, [activeTabId, updateOverflow]);
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || typeof ResizeObserver === 'undefined') {
            return undefined;
        }
        const observer = new ResizeObserver(() => revealActive());
        observer.observe(el);
        return () => observer.disconnect();
    }, [revealActive]);
    const scrollBy = useCallback((direction: number) => {
        const el = scrollRef.current;
        if (el) {
            el.scrollBy({ left: direction * Math.max(120, el.clientWidth * 0.6), behavior: 'smooth' });
        }
    }, []);
    const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        const el = scrollRef.current;
        if (el && e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
            el.scrollLeft += e.deltaY;
        }
    }, []);
    useLayoutEffect(() => {
        revealActive();
    }, [tabs, revealActive]);

    // all projects list
    const [listOpen, setListOpen] = useState(false);

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
                {overflow.left || overflow.right ? (
                    <button
                        type="button"
                        className={classNames(styles['icon-button'], styles['scroll-button'])}
                        aria-label={i18n._('key-Tabs/Scroll tabs left')}
                        title={i18n._('key-Tabs/Scroll tabs left')}
                        disabled={!overflow.left}
                        onClick={() => scrollBy(-1)}
                        data-tab-scroll="left"
                    >
                        <ChevronIcon direction="left" />
                    </button>
                ) : null}
                <div className={styles['doc-scroll']} ref={scrollRef} onScroll={updateOverflow} onWheel={onWheel}>
                    {docs.map((meta) => {
                        const active = tabs.activeTabId === meta.id;
                        const name = tabDisplayName(meta);
                        return (
                            <div
                                key={meta.id}
                                className={classNames(styles.tab, styles['doc-tab'], { [styles.active]: active, [styles.dirty]: meta.unSaved })}
                                role="tab"
                                aria-selected={active}
                                data-tab-id={meta.id}
                                data-tab-kind="doc"
                                data-head-type={meta.headType}
                                data-unsaved={meta.unSaved ? 'true' : 'false'}
                                title={meta.openedFile?.path || name}
                                tabIndex={active ? 0 : -1}
                                onClick={() => onActivate(meta.id)}
                                onMouseDown={(e) => {
                                    // no auto-scroll on a middle click
                                    if (e.button === 1) {
                                        e.preventDefault();
                                    }
                                }}
                                onAuxClick={(e) => {
                                    // middle click closes the tab
                                    if (e.button === 1) {
                                        e.preventDefault();
                                        onClose && onClose(meta.id);
                                    }
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Delete' && onClose) {
                                        e.preventDefault();
                                        onClose(meta.id);
                                        return;
                                    }
                                    onKeyActivate(e, () => onActivate(meta.id));
                                }}
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
                </div>
                {overflow.left || overflow.right ? (
                    <button
                        type="button"
                        className={classNames(styles['icon-button'], styles['scroll-button'])}
                        aria-label={i18n._('key-Tabs/Scroll tabs right')}
                        title={i18n._('key-Tabs/Scroll tabs right')}
                        disabled={!overflow.right}
                        onClick={() => scrollBy(1)}
                        data-tab-scroll="right"
                    >
                        <ChevronIcon direction="right" />
                    </button>
                ) : null}
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
            {docs.length > 0 && (
                <button
                    type="button"
                    className={classNames(styles['icon-button'], { [styles['icon-button-open']]: listOpen })}
                    aria-label={i18n._('key-Tabs/All tabs')}
                    title={i18n._('key-Tabs/All tabs')}
                    aria-expanded={listOpen}
                    onClick={() => setListOpen((open) => !open)}
                    data-all-tabs
                >
                    <ChevronIcon direction="down" />
                </button>
            )}
            {listOpen && (
                <AllTabsMenu
                    tabs={tabs}
                    onActivate={(id) => {
                        setListOpen(false);
                        onActivate(id);
                    }}
                    onDismiss={() => setListOpen(false)}
                />
            )}
        </div>
    );
};

export default TabStrip;
