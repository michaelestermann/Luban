import classNames from 'classnames';
import isElectron from 'is-electron';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shallowEqual, useSelector } from 'react-redux';

import { documentStatusOf } from '../../../flux/project/document-swap';
import {
    DocumentStatus,
    EDITOR_HEAD_TYPES,
    EditorHeadType,
    MachineRef,
    PanelDocument,
    RecentFileRef,
    TabsState,
    WORKSPACE_TAB,
    isDocumentForOtherMachine,
    projectPanelGroups,
    recentProjects,
} from '../../../flux/project/tabs-model';
import i18n from '../../../lib/i18n';
import UniApi from '../../../lib/uni-api';
import MachineSection, { mismatchLabels } from './MachineSection';
import { HeadIcon, tabDisplayName } from './TabStrip';
import styles from './project-panel.styl';

// React escapes the text; i18next must not escape the machine names ("A350/A350T")
const RAW = { interpolation: { escapeValue: false } };

export const PROJECT_PANEL_WIDTH = 232;
export const PROJECT_PANEL_COLLAPSED_WIDTH = 48;

const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
};

const PanelToggleIcon: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d={collapsed ? 'M9 4v16M13.5 10l2 2-2 2' : 'M9 4v16M15.5 10l-2 2 2 2'} />
    </svg>
);

const PlusIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <path d="M12 5v14M5 12h14" />
    </svg>
);

const FolderIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <path d="M12 11v5M9.5 13.5L12 11l2.5 2.5" />
    </svg>
);

const OpenIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
);

const ClockIcon: React.FC = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
    </svg>
);

const CloseIcon: React.FC = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.2}>
        <path d="M6 6l12 12M18 6L6 18" />
    </svg>
);

const GROUP_LABELS: Record<EditorHeadType, string> = {
    printing: 'key-Tabs/3D Printing',
    laser: 'key-Tabs/Laser',
    cnc: 'key-Tabs/CNC',
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
    design: 'key-Tabs/Design',
    'gcode-ready': 'key-Tabs/G-code ready',
    sliced: 'key-Tabs/Sliced',
};

/** The step status of the live documents, computed from their slices (parked ones keep it in their meta). */
function useLiveStatus(): Partial<Record<EditorHeadType, DocumentStatus>> {
    return useSelector((state: Record<string, unknown>) => {
        const out: Partial<Record<EditorHeadType, DocumentStatus>> = {};
        for (const head of EDITOR_HEAD_TYPES) {
            const slice = state[head] as Record<string, unknown> | undefined;
            out[head] = documentStatusOf(slice, head);
        }
        return out;
    }, shallowEqual);
}

interface ProjectPanelProps {
    collapsed: boolean;
    onToggle: () => void;
    onAdd: () => void;
    onActivate: (tabId: string) => void;
    onClose: (tabId: string) => void;
}

/**
 * Project panel (design D): the open projects grouped by mode with their step status, Open… and Recent,
 * and the Machine section at the bottom. Collapsed (48 px): one icon per project, + and the machine icon.
 */
const ProjectPanel: React.FC<ProjectPanelProps> = ({ collapsed, onToggle, onAdd, onActivate, onClose }) => {
    const tabs: TabsState = useSelector((state: { project: { tabs: TabsState } }) => state.project.tabs);
    const machine: MachineRef = useSelector((state: { machine: MachineRef }) => ({
        series: state.machine.series,
        toolHead: state.machine.toolHead,
    }), shallowEqual);
    const recentFiles = useSelector((state: { project: { general: { recentFiles: RecentFileRef[] } } }) => state.project.general.recentFiles);
    const liveStatus = useLiveStatus();
    const groups = useMemo(() => projectPanelGroups(tabs, liveStatus), [tabs, liveStatus]);
    const docCount = tabs.order.length;

    const [recentOpen, setRecentOpen] = useState(false);
    const recentRef = useRef<HTMLDivElement | null>(null);
    const recent = useMemo(() => recentProjects(recentFiles, tabs), [recentFiles, tabs]);

    // the recent list of the main process (the Home page asks for it too)
    useEffect(() => {
        if (recentOpen && isElectron()) {
            window.require('electron').ipcRenderer.send('get-recent-file');
        }
    }, [recentOpen]);

    // a click outside or Esc closes the Recent list
    useEffect(() => {
        if (!recentOpen) {
            return undefined;
        }
        const onDown = (e: MouseEvent) => {
            if (recentRef.current && !recentRef.current.contains(e.target as Node)) {
                setRecentOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setRecentOpen(false);
            }
        };
        window.addEventListener('mousedown', onDown, true);
        window.addEventListener('keydown', onKey, true);
        return () => {
            window.removeEventListener('mousedown', onDown, true);
            window.removeEventListener('keydown', onKey, true);
        };
    }, [recentOpen]);

    const onOpenFile = useCallback(async () => {
        const file = await UniApi.Dialog.showOpenFileDialog();
        if (file && file.path) {
            UniApi.Event.emit('appbar-menu:open-file', file, [file]);
        } else if (!isElectron()) {
            UniApi.Event.emit('appbar-menu:open-file-in-browser');
        }
    }, []);

    const onRecent = useCallback((file: RecentFileRef) => {
        setRecentOpen(false);
        // a file that is open only gets its tab focused (openProjectInTab)
        UniApi.Event.emit('appbar-menu:open-file', { name: file.name, path: file.path }, [{ name: file.name, path: file.path }]);
    }, []);

    const subtitle = (item: PanelDocument): string => {
        const status = i18n._(STATUS_LABELS[item.status]);
        if (isDocumentForOtherMachine(item.meta, machine)) {
            return `${status} · ${i18n._('key-Tabs/for {{machine}}', { machine: mismatchLabels(item.meta, machine, true).project, ...RAW })}`;
        }
        return status;
    };

    const onOpenWorkspace = useCallback(() => onActivate(WORKSPACE_TAB), [onActivate]);

    const toggleLabel = collapsed ? i18n._('key-Tabs/Expand panel') : i18n._('key-Tabs/Collapse panel');

    if (collapsed) {
        return (
            <aside
                className={classNames(styles.panel, styles.collapsed)}
                aria-label={i18n._('key-Tabs/Projects')}
                data-project-panel="collapsed"
            >
                <button type="button" className={styles['icon-button']} title={toggleLabel} aria-label={toggleLabel} onClick={onToggle} data-panel-toggle>
                    <PanelToggleIcon collapsed />
                </button>
                <div className={styles['mini-list']}>
                    {groups.map((group) => (
                        <React.Fragment key={group.headType}>
                            <span className={styles['mini-separator']} />
                            {group.documents.map((item) => {
                                const name = tabDisplayName(item.meta);
                                return (
                                    <button
                                        type="button"
                                        key={item.meta.id}
                                        className={classNames(styles['mini-row'], { [styles.active]: item.active })}
                                        title={`${name} · ${subtitle(item)}`}
                                        aria-label={name}
                                        aria-current={item.active ? 'page' : undefined}
                                        data-doc-id={item.meta.id}
                                        onClick={() => onActivate(item.meta.id)}
                                    >
                                        <HeadIcon headType={item.meta.headType} size={17} />
                                        {item.meta.unSaved && <span className={styles['mini-dot']} />}
                                    </button>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </div>
                <button
                    type="button"
                    className={styles['icon-button']}
                    title={i18n._('key-Tabs/New or open project')}
                    aria-label={i18n._('key-Tabs/New or open project')}
                    onClick={onAdd}
                    data-panel-add
                >
                    <PlusIcon />
                </button>
                <div className={styles.spacer} />
                <MachineSection collapsed onOpenWorkspace={onOpenWorkspace} />
            </aside>
        );
    }

    return (
        <aside className={styles.panel} aria-label={i18n._('key-Tabs/Projects')} data-project-panel="expanded">
            <div className={styles.header}>
                <button type="button" className={styles['icon-button']} title={toggleLabel} aria-label={toggleLabel} onClick={onToggle} data-panel-toggle>
                    <PanelToggleIcon collapsed={false} />
                </button>
                <span className={styles.label}>{i18n._('key-Tabs/Projects')}</span>
                <div className={styles.spacer} />
                <button
                    type="button"
                    className={styles['icon-button']}
                    title={i18n._('key-Tabs/New or open project')}
                    aria-label={i18n._('key-Tabs/New or open project')}
                    onClick={onAdd}
                    data-panel-add
                >
                    <PlusIcon />
                </button>
            </div>
            <div className={styles.list}>
                {groups.map((group) => (
                    <div key={group.headType} className={styles.group} data-panel-group={group.headType}>
                        <div className={classNames(styles.label, styles['group-label'])}>
                            {i18n._(GROUP_LABELS[group.headType])}
                            <span className={styles.count}>{group.documents.length}</span>
                        </div>
                        {group.documents.map((item) => {
                            const name = tabDisplayName(item.meta);
                            const path = item.meta.openedFile?.path;
                            return (
                                <div
                                    key={item.meta.id}
                                    className={classNames(styles.row, { [styles.active]: item.active })}
                                    data-doc-id={item.meta.id}
                                    data-status={item.status}
                                    data-unsaved={item.meta.unSaved ? 'true' : 'false'}
                                >
                                    <HeadIcon headType={item.meta.headType} />
                                    <button
                                        type="button"
                                        className={styles['row-main']}
                                        title={path || name}
                                        aria-current={item.active ? 'page' : undefined}
                                        onClick={() => onActivate(item.meta.id)}
                                    >
                                        <span className={styles['row-name']}>{name}</span>
                                        <span className={styles['row-status']}>{subtitle(item)}</span>
                                    </button>
                                    {item.meta.unSaved && <span className={styles['unsaved-dot']} aria-label={i18n._('key-Tabs/Unsaved changes')} />}
                                    <span className={styles['row-actions']}>
                                        {path && (
                                            <button
                                                type="button"
                                                className={styles['small-icon-button']}
                                                title={i18n._('key-Tabs/Show in folder')}
                                                aria-label={i18n._('key-Tabs/Show in folder')}
                                                data-action="show-in-folder"
                                                onClick={() => UniApi.File.showItemInFolder(path)}
                                            >
                                                <FolderIcon />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className={styles['small-icon-button']}
                                            title={i18n._('key-Tabs/Close {{name}}', { name })}
                                            aria-label={i18n._('key-Tabs/Close {{name}}', { name })}
                                            data-action="close"
                                            onClick={() => onClose(item.meta.id)}
                                        >
                                            <CloseIcon />
                                        </button>
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                ))}
                {docCount === 0 && (
                    <div className={styles.empty}>{i18n._('key-Tabs/No open projects. Start one with + or open a file.')}</div>
                )}
            </div>
            <div className={styles.actions} ref={recentRef}>
                <button type="button" className={styles['small-button']} onClick={onOpenFile} data-panel-open>
                    <OpenIcon />
                    {i18n._('key-Tabs/Open…')}
                </button>
                <button
                    type="button"
                    className={classNames(styles['small-button'], { [styles.pressed]: recentOpen })}
                    aria-expanded={recentOpen}
                    onClick={() => setRecentOpen(!recentOpen)}
                    data-panel-recent
                >
                    <ClockIcon />
                    {i18n._('key-Tabs/Recent')}
                </button>
                {recentOpen && (
                    <div className={styles.popover} role="menu" aria-label={i18n._('key-Tabs/Recent')} data-recent-popover>
                        {recent.length === 0 && <div className={styles.empty}>{i18n._('key-Tabs/No recent projects')}</div>}
                        {recent.map((file) => (
                            <button
                                type="button"
                                role="menuitem"
                                key={file.path || file.name}
                                className={styles['popover-row']}
                                title={file.path}
                                data-recent={file.name}
                                onClick={() => onRecent(file)}
                            >
                                <HeadIcon headType={file.headType} />
                                <span className={styles['row-name']}>{file.name}</span>
                                {file.isOpen && <span className={styles.tag}>{i18n._('key-Tabs/open')}</span>}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div className={styles.spacer} />
            <MachineSection collapsed={false} onOpenWorkspace={onOpenWorkspace} />
        </aside>
    );
};

export default ProjectPanel;
