import { Machine, MachineType } from '@snapmaker/luban-platform';
import classNames from 'classnames';
import isElectron from 'is-electron';
import { cloneDeep, reverse } from 'lodash';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { actions as projectActions } from '../../../flux/project';
import {
    EDITOR_HEAD_TYPES,
    EditorHeadType,
    RecentFileRef,
    TabsState,
    filterRecentByMode,
    projectHeadTypeOf,
} from '../../../flux/project/tabs-model';
import { getCaseList } from '../../../lib/caseLibrary';
import i18n from '../../../lib/i18n';
import UniApi from '../../../lib/uni-api';
import { HEAD_COLORS, HeadIcon } from './TabStrip';
import styles from './tab-shell.styl';

interface CaseItem {
    title: string;
    // eslint-disable-next-line camelcase
    tag_i18n: string;
    imgSrc: string;
    pathConfig: { name: string; path: string; isDatastoragePath?: boolean };
}

const MODE_TITLES: Record<EditorHeadType, { title: string; hint: string }> = {
    printing: { title: 'key-Tabs/3D Printing', hint: 'key-Tabs/Models, slicing, G-code' },
    laser: { title: 'key-Tabs/Laser', hint: 'key-Tabs/Engrave and cut, 3- and 4-axis' },
    cnc: { title: 'key-Tabs/CNC', hint: 'key-Tabs/Carve and mill, 3- and 4-axis' },
};

/** The modes the active machine offers (the same rule as the start cards of the Home page). */
export function availableModes(machine: Machine | null | undefined): EditorHeadType[] {
    if (!machine) {
        return [...EDITOR_HEAD_TYPES];
    }
    const multi = machine.machineType === MachineType.MultiFuncionPrinter;
    return EDITOR_HEAD_TYPES.filter((head) => {
        if (head === 'printing') {
            return multi || machine.machineType === MachineType.Printer;
        }
        if (head === 'laser') {
            return multi || machine.machineType === MachineType.Laser;
        }
        return multi;
    });
}

const stroke = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
};

const FolderIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
);

const BlankIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M12 10v6M9 13h6" />
    </svg>
);

const BookIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <path d="M4 5a2 2 0 012-2h12v16H6a2 2 0 00-2 2z" />
        <path d="M4 19V5" />
    </svg>
);

const BackIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <path d="M15 6l-6 6 6 6" />
    </svg>
);

interface ModeChooserProps {
    onClose: () => void;
}

/**
 * "+" of the tab strip (design D): step 1 asks the mode, step 2 offers a blank project (4-axis for laser and
 * CNC), Open file…, the case library and the recent files of that mode. Esc or a click outside closes it.
 */
const ModeChooser: React.FC<ModeChooserProps> = ({ onClose }) => {
    const dispatch = useDispatch();
    const history = useHistory();
    const [mode, setMode] = useState<EditorHeadType | null>(null);
    const [listKind, setListKind] = useState<'recent' | 'cases'>('recent');
    const dialogRef = useRef<HTMLDivElement | null>(null);

    const tabs: TabsState = useSelector((state: { project: { tabs: TabsState } }) => state.project.tabs);
    const recentFiles = useSelector((state: { project: { general: { recentFiles: RecentFileRef[] } } }) => state.project.general.recentFiles);
    const machine = useSelector((state: { machine: { activeMachine: Machine | null } }) => state.machine.activeMachine);
    const series = useSelector((state: { machine: { series: string } }) => state.machine.series);
    const toolHead = useSelector((state: { machine: { toolHead: Record<string, string> } }) => state.machine.toolHead);
    const use4Axis = useSelector((state: { machine: { use4Axis: boolean } }) => state.machine.use4Axis);

    const modes = availableModes(machine);

    // the recent list of the main process (the Home page asks for it too)
    useEffect(() => {
        if (isElectron()) {
            window.require('electron').ipcRenderer.send('get-recent-file');
        }
    }, []);

    // Esc closes (before the editor shortcuts see it)
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    useEffect(() => {
        dialogRef.current?.focus();
    }, [mode]);

    const recent = useMemo(() => {
        if (!mode) {
            return [];
        }
        // the store keeps the newest entry last
        return filterRecentByMode(reverse(cloneDeep(recentFiles || [])), mode, tabs);
    }, [mode, recentFiles, tabs]);

    const cases: CaseItem[] = useMemo(() => {
        if (!mode || !toolHead) {
            return [];
        }
        const { caseList, caseListFourAxis } = getCaseList(series, toolHead);
        const all: CaseItem[] = [...caseList, ...(use4Axis ? caseListFourAxis : [])];
        return all.filter((c) => projectHeadTypeOf(c.pathConfig?.name) === mode);
    }, [mode, series, toolHead, use4Axis]);

    const openFile = useCallback((file: RecentFileRef) => {
        UniApi.Event.emit('appbar-menu:open-file', file, [file]);
    }, []);

    const onBlank = (isRotate: boolean) => {
        onClose();
        UniApi.Event.emit('appbar-menu:new-file', { headType: mode, isRotate });
    };

    const onOpenFile = async (head: EditorHeadType | null) => {
        onClose();
        const file = await UniApi.Dialog.showOpenFileDialog(head ? `/project-${head}` : undefined);
        if (file && file.path) {
            openFile(file);
        } else if (!isElectron()) {
            // browser: the hidden file input of the app bar
            UniApi.Event.emit('appbar-menu:open-file-in-browser');
        }
    };

    const onRecent = (file: RecentFileRef) => {
        onClose();
        // a file that is open only gets its tab focused (openProjectInTab)
        openFile({ name: file.name, path: file.path });
    };

    const onCase = (item: CaseItem) => {
        onClose();
        dispatch(projectActions.openProject(item.pathConfig, history));
    };

    const renderStep1 = () => (
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={i18n._('key-Tabs/New or open project')}
            className={classNames(styles.dialog, styles.chooser)}
            tabIndex={-1}
            data-chooser-step="1"
        >
            <div className={styles['dialog-head']}>
                <b className={styles['dialog-title']}>{i18n._('key-Tabs/What do you want to make?')}</b>
                <span className={styles.muted}>{i18n._('key-Tabs/Step 1 of 2 · then start a new project, open a file or pick a recent one')}</span>
            </div>
            <div className={styles['mode-cards']}>
                {modes.map((head) => (
                    <button
                        key={head}
                        type="button"
                        className={styles['mode-card']}
                        data-mode={head}
                        onClick={() => {
                            setMode(head);
                            setListKind('recent');
                        }}
                    >
                        <span className={styles['mode-icon']} style={{ background: `${HEAD_COLORS[head]}14` }}>
                            <HeadIcon headType={head} size={26} />
                        </span>
                        <b>{i18n._(MODE_TITLES[head].title)}</b>
                        <span className={styles.muted}>{i18n._(MODE_TITLES[head].hint)}</span>
                    </button>
                ))}
            </div>
            <div className={styles['dialog-actions']}>
                <button type="button" className={styles.secondary} onClick={() => { onOpenFile(null); }}>
                    <FolderIcon />
                    {i18n._('key-Tabs/Open any file…')}
                </button>
                <span className={styles.spacer} />
                <button type="button" className={styles.secondary} onClick={onClose}>{i18n._('key-Tabs/Cancel')}</button>
            </div>
        </div>
    );

    const renderStep2 = (head: EditorHeadType) => (
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={i18n._('key-Tabs/New or open project')}
            className={classNames(styles.dialog, styles['chooser-wide'])}
            tabIndex={-1}
            data-chooser-step="2"
            data-mode={head}
        >
            <div className={styles['dialog-head-row']}>
                <button type="button" className={styles['icon-button']} aria-label={i18n._('key-Tabs/Back')} onClick={() => setMode(null)}>
                    <BackIcon />
                </button>
                <b className={styles['dialog-title']}>
                    <HeadIcon headType={head} size={20} />
                    {i18n._(MODE_TITLES[head].title)}
                </b>
                <span className={classNames(styles.muted, styles['push-right'])}>{i18n._('key-Tabs/Step 2 of 2')}</span>
            </div>
            <div className={styles['chooser-body']}>
                <div className={styles['chooser-actions']}>
                    <button type="button" className={styles.primary} data-action="blank" onClick={() => onBlank(false)}>
                        <BlankIcon />
                        {i18n._('key-Tabs/Blank project')}
                    </button>
                    {head !== 'printing' && (
                        <button type="button" className={styles.secondary} data-action="blank-4axis" onClick={() => onBlank(true)}>
                            <BlankIcon />
                            {i18n._('key-Tabs/Blank project, 4-axis')}
                        </button>
                    )}
                    <button type="button" className={styles.secondary} data-action="open" onClick={() => { onOpenFile(head); }}>
                        <FolderIcon />
                        {i18n._('key-Tabs/Open file…')}
                    </button>
                    <button
                        type="button"
                        className={classNames(styles.secondary, { [styles.pressed]: listKind === 'cases' })}
                        data-action="cases"
                        aria-pressed={listKind === 'cases'}
                        onClick={() => setListKind(listKind === 'cases' ? 'recent' : 'cases')}
                    >
                        <BookIcon />
                        {i18n._('key-Tabs/Case library')}
                    </button>
                </div>
                <div className={styles['chooser-list']} data-list={listKind}>
                    {listKind === 'recent' && (
                        <>
                            <div className={styles.label}>{i18n._('key-Tabs/Recent')}</div>
                            {recent.length === 0 && <div className={styles.empty}>{i18n._('key-Tabs/No recent projects of this mode')}</div>}
                            {recent.map((file) => (
                                <button
                                    key={file.path || file.name}
                                    type="button"
                                    className={styles.row}
                                    title={file.path || file.name}
                                    data-recent={file.name}
                                    data-open={file.isOpen ? 'true' : 'false'}
                                    onClick={() => onRecent(file)}
                                >
                                    <HeadIcon headType={head} />
                                    <span className={styles['row-name']}>{file.name}</span>
                                    {file.isOpen && <span className={styles.tag}>{i18n._('key-Tabs/open')}</span>}
                                    <span className={styles['row-path']}>{file.path}</span>
                                </button>
                            ))}
                        </>
                    )}
                    {listKind === 'cases' && (
                        <>
                            <div className={styles.label}>{i18n._('key-Tabs/Case library')}</div>
                            {cases.length === 0 && <div className={styles.empty}>{i18n._('key-Tabs/No cases for this machine and mode')}</div>}
                            {cases.map((item) => (
                                <button
                                    key={item.pathConfig.path}
                                    type="button"
                                    className={styles.row}
                                    data-case={item.pathConfig.name}
                                    onClick={() => onCase(item)}
                                >
                                    <img className={styles['case-img']} src={item.imgSrc} alt="" />
                                    <span className={styles['row-name']}>{i18n._(item.title)}</span>
                                    <span className={styles['row-path']}>{i18n._(item.tag_i18n)}</span>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            </div>
            <div className={styles['dialog-actions']}>
                <span className={styles.spacer} />
                <button type="button" className={styles.secondary} onClick={onClose}>{i18n._('key-Tabs/Cancel')}</button>
            </div>
        </div>
    );

    return (
        <div
            role="presentation"
            className={classNames(styles.backdrop, styles['backdrop-top'])}
            data-mode-chooser="true"
            onMouseDown={(e) => {
                // a click outside the dialog closes it
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >
            {mode ? renderStep2(mode) : renderStep1()}
        </div>
    );
};

export default ModeChooser;
