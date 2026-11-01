import { Machine, MachineType } from '@snapmaker/luban-platform';
import classNames from 'classnames';
import isElectron from 'is-electron';
import { cloneDeep, reverse } from 'lodash';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';

import {
    CylinderWorkpieceSize,
    Materials,
    ObjectReference,
    Origin,
    OriginType,
    RectangleWorkpieceSize,
    WorkpieceShape,
} from '../../../constants/coordinate';
import { actions as projectActions } from '../../../flux/project';
import { tabsActions } from '../../../flux/project/actions-tabs';
import {
    NewProjectPage,
    PROJECT_NAME_MAX_LENGTH,
    cleanProjectName,
    lockingBlockWorkpieceSize,
    machineSupportsRotary,
    newProjectPages,
    newProjectSize,
    projectFileName,
    rememberedSizeKey,
} from '../../../flux/project/new-project';
import {
    EDITOR_HEAD_TYPES,
    EditorHeadType,
    PROJECT_EXTENSIONS,
    RecentFileRef,
    TabsState,
    filterRecentByMode,
    nextUntitledIndex,
    projectHeadTypeOf,
} from '../../../flux/project/tabs-model';
import { getCaseList } from '../../../lib/caseLibrary';
import i18n from '../../../lib/i18n';
import UniApi from '../../../lib/uni-api';
import { machineStore } from '../../../store/local-storage';
import CncJobSetupView, { JobSetupViewHandle as CncJobSetupHandle } from '../../pages/cnc-main/modals/JobSetupView';
import LaserJobSetupView, { JobSetupViewHandle as LaserJobSetupHandle } from '../../pages/laser-main/modals/JobSetupView';
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

const PAGE_LABELS: Record<NewProjectPage, string> = {
    'blank': 'key-Tabs/Blank project',
    'blank-4axis': 'key-Tabs/Blank project, 4-axis',
    'open': 'key-Tabs/Open file…',
    'cases': 'key-Tabs/Case library',
    'recent': 'key-Tabs/Recent',
};

// the drop-down lists of the Job Setup form open above the dialog (backdrop z-index 1100)
const POPUP_Z_INDEX = 1200;

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

const FolderIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
);

const BlankIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M12 10v6M9 13h6" />
    </svg>
);

const CylinderIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <ellipse cx="7" cy="12" rx="3" ry="6" />
        <path d="M7 6h10M7 18h10" />
        <path d="M17 6a3 6 0 010 12" />
    </svg>
);

const BookIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <path d="M4 5a2 2 0 012-2h12v16H6a2 2 0 00-2 2z" />
        <path d="M4 19V5" />
    </svg>
);

const ClockIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
    </svg>
);

const BackIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
        <path d="M15 6l-6 6 6 6" />
    </svg>
);

const PAGE_ICONS: Record<NewProjectPage, React.FC> = {
    'blank': BlankIcon,
    'blank-4axis': CylinderIcon,
    'open': FolderIcon,
    'cases': BookIcon,
    'recent': ClockIcon,
};

const isBlankPage = (page: NewProjectPage): boolean => page === 'blank' || page === 'blank-4axis';

/** An antd drop-down list of the form is open (Enter / Esc belong to it then). */
const selectMenuOpen = (): boolean => !!document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');

interface ModeChooserProps {
    onClose: () => void;
}

/**
 * "+" of the tab strip (design D): step 1 asks the mode; step 2 lists Blank project (4-axis for laser and
 * CNC), Open file…, Case library and Recent on the left and shows the page of the selected item on the
 * right. A blank project gets its name, workpiece and origin there (the Job Setup form) and opens in a new
 * tab with them. Enter creates, Esc or a click outside closes.
 */
const ModeChooser: React.FC<ModeChooserProps> = ({ onClose }) => {
    const dispatch = useDispatch();
    const history = useHistory();
    const [mode, setMode] = useState<EditorHeadType | null>(null);
    const [page, setPage] = useState<NewProjectPage>('blank');
    const [name, setName] = useState('');
    const [dropState, setDropState] = useState<'idle' | 'over' | 'rejected'>('idle');
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const nameRef = useRef<HTMLInputElement | null>(null);
    const laserFormRef = useRef<LaserJobSetupHandle>();
    const cncFormRef = useRef<CncJobSetupHandle>();
    const creatingRef = useRef(false);

    const tabs: TabsState = useSelector((state: { project: { tabs: TabsState } }) => state.project.tabs);
    const recentFiles = useSelector((state: { project: { general: { recentFiles: RecentFileRef[] } } }) => state.project.general.recentFiles);
    const machine = useSelector((state: { machine: { activeMachine: Machine | null } }) => state.machine.activeMachine);
    const series = useSelector((state: { machine: { series: string } }) => state.machine.series);
    const toolHead = useSelector((state: { machine: { toolHead: Record<string, string> } }) => state.machine.toolHead);
    const use4Axis = useSelector((state: { machine: { use4Axis: boolean } }) => state.machine.use4Axis);
    const cncLockingBlockPosition = useSelector((state: { cnc?: { lockingBlockPosition?: string } }) => state.cnc?.lockingBlockPosition);

    const modes = availableModes(machine);
    const pages = mode ? newProjectPages(mode, machineSupportsRotary(machine?.identifier)) : [];

    // the recent list of the main process (the Home page asks for it too)
    useEffect(() => {
        if (isElectron()) {
            window.require('electron').ipcRenderer.send('get-recent-file');
        }
    }, []);

    // Esc closes (before the editor shortcuts see it), unless a drop-down list of the form is open
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !selectMenuOpen()) {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    // focus: the name field of a blank project (on entering step 2 and after a click on an item; the arrow
    // keys keep it in the left column), else the dialog
    const focusNameRef = useRef(true);
    useEffect(() => {
        if (!focusNameRef.current) {
            return;
        }
        focusNameRef.current = false;
        if (mode && isBlankPage(page) && nameRef.current) {
            nameRef.current.focus();
            nameRef.current.select();
        } else {
            dialogRef.current?.focus();
        }
    }, [mode, page]);

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

    const isRotate = page === 'blank-4axis';

    // what the form starts with: the size last used for a new project of this mode and shape (else the
    // 4.16 defaults) and the remembered origin (as a new 4.16 project gets it)
    const initial = useMemo(() => {
        if (!mode || mode === 'printing' || !isBlankPage(page)) {
            return null;
        }
        const machineSize = machine?.metadata?.size || { x: 400, y: 400, z: 400 };
        const size = newProjectSize(mode, isRotate, machineSize, machineStore.get(rememberedSizeKey(mode, isRotate)));
        const originType = Number(machineStore.get(`${mode}.origin.type`, mode === 'laser' ? OriginType.Object : OriginType.Workpiece));
        const origin: Origin = {
            type: Number.isFinite(originType) ? originType : OriginType.Workpiece,
            reference: machineStore.get('origin.reference', ObjectReference.BottomLeft),
            referenceMetadata: {},
        };
        const lockingBlockPosition = cncLockingBlockPosition || 'A';
        let rect = size as RectangleWorkpieceSize;
        if (!isRotate && mode === 'cnc' && origin.type === OriginType.CNCLockingBlock) {
            rect = { ...rect, ...lockingBlockWorkpieceSize(lockingBlockPosition) };
        }
        const cyl = size as CylinderWorkpieceSize;
        const materials: Materials = isRotate
            ? { isRotate: true, diameter: cyl.diameter, length: cyl.length, x: 0, y: 0, z: 0 }
            : { isRotate: false, diameter: 0, length: 0, x: rect.x, y: rect.y, z: rect.z ?? 0 };
        return { materials, origin, lockingBlockPosition };
    }, [mode, page, isRotate, machine, cncLockingBlockPosition]);

    const untitledName = mode ? `${i18n._('key-Tabs/Untitled')} ${nextUntitledIndex(tabs, mode)}` : '';
    const projectName = cleanProjectName(name);
    const fileName = mode && projectName ? projectFileName(projectName, mode) : null;

    const create = useCallback(() => {
        if (!mode || !isBlankPage(page) || creatingRef.current) {
            return;
        }
        creatingRef.current = true;
        let form: LaserJobSetupHandle | CncJobSetupHandle | undefined;
        if (mode === 'laser') {
            form = laserFormRef.current;
        } else if (mode === 'cnc') {
            form = cncFormRef.current;
        }
        const jobSetup = form ? form.getSettings() : undefined;
        if (jobSetup) {
            // the size of this new project is the default of the next one
            const size = jobSetup.workpiece.shape === WorkpieceShape.Cylinder
                ? { ...(jobSetup.workpiece.size as CylinderWorkpieceSize) }
                : { ...(jobSetup.workpiece.size as RectangleWorkpieceSize) };
            machineStore.set(rememberedSizeKey(mode, isRotate), size);
        }
        onClose();
        dispatch(tabsActions.newDocument(mode, { isRotate, projectName: projectName || undefined, jobSetup }, history));
    }, [mode, page, isRotate, projectName, onClose, dispatch, history]);

    // Enter creates the blank project (not on a button or in a drop-down list): a number being typed is
    // committed first (on blur)
    const createRef = useRef(create);
    createRef.current = create;
    const blankPageShown = !!mode && isBlankPage(page);
    useEffect(() => {
        if (!blankPageShown) {
            return undefined;
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Enter' || selectMenuOpen()) {
                return;
            }
            const target = e.target as HTMLElement | null;
            // a button does its own thing; an item of the left column (a blank project) creates too
            if (!target || !dialogRef.current?.contains(target) || target.closest('.ant-select')
                || (target.closest('button') && !target.closest('[role="tab"]'))) {
                return;
            }
            e.preventDefault();
            (document.activeElement as HTMLElement | null)?.blur?.();
            setTimeout(() => createRef.current(), 60);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [blankPageShown]);

    const openFile = useCallback((file: RecentFileRef) => {
        UniApi.Event.emit('appbar-menu:open-file', file, [file]);
    }, []);

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

    // a dropped project file is opened by the window drop handler of the tab shell
    const onDrop = (e: React.DragEvent) => {
        const names = Array.from(e.dataTransfer?.files || []).map((f) => f.name);
        if (names.some((n) => projectHeadTypeOf(n))) {
            setDropState('idle');
            onClose();
        } else {
            e.preventDefault();
            e.stopPropagation();
            setDropState('rejected');
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

    const chooseMode = (head: EditorHeadType) => {
        focusNameRef.current = true;
        setMode(head);
        setPage('blank');
        setName('');
        setDropState('idle');
    };

    // up / down move through the items of the left column
    const onNavKeyDown = (e: React.KeyboardEvent) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
            return;
        }
        e.preventDefault();
        const index = pages.indexOf(page);
        const next = pages[(index + (e.key === 'ArrowDown' ? 1 : pages.length - 1)) % pages.length];
        setPage(next);
        const button = dialogRef.current?.querySelector(`[data-page="${next}"]`) as HTMLElement | null;
        button?.focus();
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
                        onClick={() => chooseMode(head)}
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

    const renderBlank = (head: EditorHeadType) => (
        <div className={styles['np-form']} data-page-body={page}>
            <label className={styles['np-field']} htmlFor="new-project-name">
                <span className={styles['np-section']}>{i18n._('key-Tabs/Project name')}</span>
                <input
                    id="new-project-name"
                    ref={nameRef}
                    className={styles['np-input']}
                    type="text"
                    value={name}
                    maxLength={PROJECT_NAME_MAX_LENGTH}
                    placeholder={untitledName}
                    spellCheck={false}
                    autoComplete="off"
                    data-new-project-name="true"
                    onChange={(e) => setName(e.target.value)}
                />
                <span className={styles['np-hint']}>
                    {fileName
                        ? i18n._('key-Tabs/Tab title; Save proposes {{file}}', { file: fileName, interpolation: { escapeValue: false } })
                        : i18n._('key-Tabs/Tab title and file name on the first save')}
                </span>
            </label>
            {head === 'laser' && initial && (
                <div className={styles['np-job-setup']}>
                    <LaserJobSetupView key={page} ref={laserFormRef} initial={initial} popupZIndex={POPUP_Z_INDEX} compact />
                </div>
            )}
            {head === 'cnc' && initial && (
                <div className={styles['np-job-setup']}>
                    <CncJobSetupView key={page} ref={cncFormRef} initial={initial} popupZIndex={POPUP_Z_INDEX} />
                </div>
            )}
            {head === 'printing' && (
                <div className={styles['np-note']}>
                    {i18n._('key-Tabs/Printer, nozzles and materials are set in the project, as for every 3D printing project.')}
                </div>
            )}
        </div>
    );

    const renderOpen = (head: EditorHeadType) => (
        <div className={styles['np-page']} data-page-body="open">
            <div
                className={classNames(styles['np-drop'], { [styles['np-drop-over']]: dropState === 'over' })}
                data-drop-zone="true"
                onDragOver={(e) => {
                    e.preventDefault();
                    if (dropState !== 'over') {
                        setDropState('over');
                    }
                }}
                onDragLeave={() => setDropState('idle')}
                onDrop={onDrop}
            >
                <FolderIcon size={36} />
                <b>{i18n._('key-Tabs/Drop a project file here')}</b>
                <span className={styles.muted}>
                    {i18n._('key-Tabs/{{ext}} files of this mode, or any other Luban project', { ext: PROJECT_EXTENSIONS[head] })}
                </span>
                <button type="button" className={styles.primary} data-action="open" onClick={() => { onOpenFile(head); }}>
                    <FolderIcon />
                    {i18n._('key-Tabs/Choose file…')}
                </button>
                {dropState === 'rejected' && <span className={styles['np-error']}>{i18n._('key-Tabs/This is not a Luban project file.')}</span>}
            </div>
        </div>
    );

    const renderCases = () => (
        <div className={styles['np-page']} data-page-body="cases">
            {cases.length === 0 && <div className={styles.empty}>{i18n._('key-Tabs/No cases for this machine and mode')}</div>}
            <div className={styles['case-grid']}>
                {cases.map((item) => (
                    <button
                        key={item.pathConfig.path}
                        type="button"
                        className={styles['case-card']}
                        data-case={item.pathConfig.name}
                        title={i18n._(item.title)}
                        onClick={() => onCase(item)}
                    >
                        <img className={styles['case-card-img']} src={item.imgSrc} alt="" />
                        <span className={styles['case-card-title']}>{i18n._(item.title)}</span>
                        <span className={styles['case-card-tag']}>{i18n._(item.tag_i18n)}</span>
                    </button>
                ))}
            </div>
        </div>
    );

    const renderRecent = (head: EditorHeadType) => (
        <div className={styles['np-page']} data-page-body="recent">
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
            data-page={page}
        >
            <div className={styles['dialog-head-row']}>
                <button type="button" className={styles['icon-button']} aria-label={i18n._('key-Tabs/Back')} data-action="back" onClick={() => { focusNameRef.current = true; setMode(null); }}>
                    <BackIcon />
                </button>
                <b className={styles['dialog-title']}>
                    <HeadIcon headType={head} size={20} />
                    {i18n._(MODE_TITLES[head].title)}
                </b>
                <span className={classNames(styles.muted, styles['push-right'])}>{i18n._('key-Tabs/Step 2 of 2')}</span>
            </div>
            <div className={styles['np-body']}>
                <div className={styles['np-nav']} role="tablist" aria-orientation="vertical">
                    {pages.map((item) => {
                        const Icon = PAGE_ICONS[item];
                        const selected = item === page;
                        return (
                            <button
                                key={item}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                tabIndex={selected ? 0 : -1}
                                className={classNames(styles['np-nav-item'], { [styles.selected]: selected })}
                                data-page={item}
                                onKeyDown={onNavKeyDown}
                                onClick={() => {
                                    // (the effect runs only when the page changes)
                                    focusNameRef.current = item !== page;
                                    setPage(item);
                                    setDropState('idle');
                                }}
                            >
                                <Icon />
                                <span className={styles['np-nav-label']}>{i18n._(PAGE_LABELS[item])}</span>
                                {item === 'recent' && recent.length > 0 && <span className={styles['np-count']}>{recent.length}</span>}
                            </button>
                        );
                    })}
                </div>
                <div className={styles['np-content']} role="tabpanel">
                    {isBlankPage(page) && renderBlank(head)}
                    {page === 'open' && renderOpen(head)}
                    {page === 'cases' && renderCases()}
                    {page === 'recent' && renderRecent(head)}
                </div>
            </div>
            <div className={styles['dialog-actions']}>
                <span className={styles.spacer} />
                <button type="button" className={styles.secondary} onClick={onClose}>{i18n._('key-Tabs/Cancel')}</button>
                {isBlankPage(page) && (
                    <button type="button" className={styles.primary} data-action="create" onClick={create}>
                        {i18n._('key-Tabs/Create project')}
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div
            role="presentation"
            className={classNames(styles.backdrop, mode ? styles['backdrop-np'] : styles['backdrop-top'])}
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
