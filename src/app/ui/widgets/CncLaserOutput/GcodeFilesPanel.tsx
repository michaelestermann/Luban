import React, { useCallback } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';

import { HEAD_CNC } from '../../../constants';
import { RootState } from '../../../flux/index.def';
import { actions as projectActions } from '../../../flux/project';
import { logGcodeExport } from '../../../lib/gaEvent';
import i18n from '../../../lib/i18n';
import log from '../../../lib/log';
import { formatDuration, getVisibleToolPathNames } from '../../../toolpaths/gcode-job-summary';
import { operationColor } from '../../../toolpaths/operations-panel';
import { toast } from '../../components/Toast';
import { makeSceneToast } from '../../views/toasts/SceneToast';
import { loadGcodeFileToWorkspace } from './load-gcode-to-workspace';
import { useGcodeOutputAvailability, useRenderImmediately } from './use-gcode-output';
import styles from './gcode-step.styl';

interface GcodeFile {
    uploadName: string;
    renderGcodeFileName: string;
    estimatedTime?: number;
    // CNC jobs with several tools
    index?: number;
    toolName?: string;
    toolPathNames?: string[];
}

interface GcodeFilesPanelProps {
    headType: 'laser' | 'cnc';
    // opens the workspace popup after a file is loaded
    onOpenWorkspace: () => void;
}

const ChangeBitIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 3v12M9 15l3 6 3-6M5 8h14" />
    </svg>
);

/**
 * Left panel of the G-code step: the generated files (CNC: one per tool run, in milling
 * order; laser: its single file) as cards with number, tool, toolpaths, time and file
 * name. "Send via Wi-Fi" loads that file into the workspace and opens it, "Export" saves
 * that file (as Export G-code to File). Between CNC files: change the bit, re-zero Z.
 */
const GcodeFilesPanel: React.FC<GcodeFilesPanelProps> = ({ headType, onOpenWorkspace }) => {
    const dispatch = useDispatch();
    const gcodeFile: GcodeFile | null = useSelector((state: RootState) => state[headType]?.gcodeFile);
    const gcodeFiles: GcodeFile[] = useSelector((state: RootState) => state[headType]?.gcodeFiles) || [];
    const materials = useSelector((state: RootState) => state[headType]?.materials);
    // laser files carry no toolpath names: the visible toolpaths make up the file
    useSelector((state: RootState) => state[headType]?.renderingTimestamp);
    const toolPaths = useSelector((state: RootState) => state[headType]?.toolPathGroup?.getToolPaths(), shallowEqual) || [];
    const { canUseGcode, isOnABPosition } = useGcodeOutputAvailability(headType);
    const renderImmediately = useRenderImmediately();

    const files: GcodeFile[] = gcodeFiles.length > 0 ? gcodeFiles : [gcodeFile].filter(Boolean);
    const isCnc = headType === HEAD_CNC;
    const disabled = isOnABPosition || !canUseGcode;

    const onLoad = useCallback(async (file: GcodeFile) => {
        try {
            const loaded = await dispatch(loadGcodeFileToWorkspace(headType, file.uploadName, renderImmediately));
            if (loaded) {
                onOpenWorkspace();
                window.scrollTo(0, 0);
            }
        } catch (e) {
            log.error(`Failed to load G-code file ${file.uploadName} to the workspace`, e);
            toast(makeSceneToast('warning', i18n._('key-Workspace/Page-Failed to load G-code.')));
        }
    }, [dispatch, headType, renderImmediately, onOpenWorkspace]);

    const onExport = useCallback((file: GcodeFile) => {
        logGcodeExport(headType, 'local', materials?.isRotate);
        dispatch(projectActions.exportFile(file.uploadName, file.renderGcodeFileName));
    }, [dispatch, headType, materials?.isRotate]);

    if (files.length === 0) {
        return null;
    }

    const visibleToolPathNames = getVisibleToolPathNames(toolPaths);

    return (
        <ol className={styles.files} aria-label={i18n._('key-CncLaser/GcodeFiles-Files')}>
            {files.map((file, i) => {
                const number = file.index ?? i + 1;
                const toolPathNames = file.toolPathNames || visibleToolPathNames;
                const title = file.toolName || toolPathNames.join(', ') || i18n._('key-CncLaser/Stepper-G-code');
                const sub = [file.toolName ? toolPathNames.join(' + ') : null, formatDuration(file.estimatedTime)]
                    .filter(Boolean)
                    .join(' · ');
                return (
                    <React.Fragment key={file.uploadName}>
                        {isCnc && i > 0 && (
                            <li className={styles.change}>
                                <ChangeBitIcon />
                                {i18n._('key-CncLaser/GcodeFiles-Change bit · re-zero Z')}
                            </li>
                        )}
                        <li className={styles.file}>
                            <div className={styles['file-head']}>
                                <span className={styles['file-number']} style={{ background: operationColor(i) }}>{number}</span>
                                <div className={styles['file-text']}>
                                    <span className={styles['file-title']} title={title}>{title}</span>
                                    <span className={styles['file-sub']} title={sub}>{sub}</span>
                                </div>
                            </div>
                            <span className={styles['file-name']}>{file.renderGcodeFileName}</span>
                            <div className={styles['file-actions']}>
                                <button
                                    type="button"
                                    className={styles['small-button']}
                                    disabled={disabled}
                                    title={i18n._('key-CncLaser/G-codeAction-Load G-code to Workspace')}
                                    onClick={() => { onLoad(file); }}
                                >
                                    {i18n._('key-CncLaser/GcodeFiles-Send via Wi-Fi')}
                                </button>
                                <button
                                    type="button"
                                    className={styles['small-button']}
                                    disabled={disabled}
                                    title={i18n._('key-CncLaser/G-codeAction-Export G-code to File')}
                                    onClick={() => onExport(file)}
                                >
                                    {i18n._('key-CncLaser/G-codeAction-Export')}
                                </button>
                            </div>
                        </li>
                    </React.Fragment>
                );
            })}
        </ol>
    );
};

export default GcodeFilesPanel;
