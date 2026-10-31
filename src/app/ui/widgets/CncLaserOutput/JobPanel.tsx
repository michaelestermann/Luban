import classNames from 'classnames';
import React from 'react';
import { useSelector } from 'react-redux';

import { HEAD_CNC } from '../../../constants';
import { RootState } from '../../../flux/index.def';
import { ConnectionType } from '../../../flux/workspace/state';
import i18n from '../../../lib/i18n';
import { formatDuration, summarizeGcodeJob } from '../../../toolpaths/gcode-job-summary';
import ExportDropdown from './ExportDropdown';
import { useRenderImmediately } from './use-gcode-output';
import styles from './gcode-step.styl';

interface JobPanelProps {
    headType: 'laser' | 'cnc';
    // opens the workspace popup after the G-code is loaded (Export > Load G-code to Workspace)
    onOpenWorkspace: (count?: number) => void;
}

/** Connection state of the machine (workspace connection, else the selected machine). */
const MachineStatus: React.FC = () => {
    const isConnected: boolean = useSelector((state: RootState) => state.workspace.isConnected);
    const connectionType: string = useSelector((state: RootState) => state.workspace.connectionType);
    const connectedMachine = useSelector((state: RootState) => state.workspace.activeMachine);
    const connectedTool = useSelector((state: RootState) => state.workspace.activeTool);
    const selectedMachine = useSelector((state: RootState) => state.machine.activeMachine);

    const machine = (isConnected && connectedMachine) || selectedMachine;
    let status = i18n._('key-CncLaser/JobPanel-Not connected');
    if (isConnected) {
        status = connectionType === ConnectionType.WiFi
            ? i18n._('key-Workspace/Console-Connected via Wi-Fi')
            : i18n._('key-CncLaser/JobPanel-Connected via serial port');
        if (connectedTool?.label) {
            status = `${status} · ${i18n._(connectedTool.label)}`;
        }
    }

    return (
        <div className={classNames(styles.machine, { [styles.connected]: isConnected })} role="status">
            <span className={styles.dot} />
            <div className={styles['machine-text']}>
                <strong>{machine?.fullName || ''}</strong>
                <span>{status}</span>
            </div>
        </div>
    );
};

/**
 * Right panel of the G-code step: machine connection, job summary (total time, files, tool
 * changes, work area), the CNC tool-change hint and the Export dropdown (Load G-code to
 * Workspace / Export G-code to File).
 */
const JobPanel: React.FC<JobPanelProps> = ({ headType, onOpenWorkspace }) => {
    const gcodeFile = useSelector((state: RootState) => state[headType]?.gcodeFile);
    const gcodeFiles = useSelector((state: RootState) => state[headType]?.gcodeFiles) || [];
    const renderImmediately = useRenderImmediately();

    const isCnc = headType === HEAD_CNC;
    const files = gcodeFiles.length > 0 ? gcodeFiles : [gcodeFile].filter(Boolean);
    const summary = summarizeGcodeJob(files, isCnc);
    const workArea = summary.workArea ? `${summary.workArea.width} × ${summary.workArea.height} mm` : '–';

    const tiles = [
        { key: 'time', label: i18n._('key-CncLaser/JobPanel-Total time'), value: formatDuration(summary.totalTime) },
        { key: 'files', label: i18n._('key-CncLaser/JobPanel-Files'), value: String(summary.fileCount) },
        isCnc && { key: 'changes', label: i18n._('key-CncLaser/JobPanel-Tool changes'), value: String(summary.toolChanges) },
        { key: 'area', label: i18n._('key-CncLaser/JobPanel-Work area'), value: workArea },
    ].filter(Boolean);

    const changeFiles = summary.toolChangeBeforeFiles;

    return (
        <div className={styles.job}>
            <MachineStatus />
            <div className={styles.section}>
                <span className={styles.label}>{i18n._('key-CncLaser/JobPanel-Job')}</span>
                <div className={styles.tiles}>
                    {tiles.map(tile => (
                        <div key={tile.key} className={styles.tile}>
                            <div>{tile.label}</div>
                            <strong>{tile.value}</strong>
                        </div>
                    ))}
                </div>
            </div>
            {changeFiles.length > 0 && (
                <div className={styles.hint}>
                    <strong>
                        {changeFiles.length === 1
                            ? i18n._('key-CncLaser/JobPanel-Before file {{file}}', { file: changeFiles[0] })
                            : i18n._('key-CncLaser/JobPanel-Before files {{files}}', { files: changeFiles.join(', ') })}
                    </strong>
                    <span>
                        {i18n._('key-CncLaser/JobPanel-Swap the bit as shown in the list and set the Z zero again on the machine. Luban adds no tool-change pause.')}
                    </span>
                </div>
            )}
            <ExportDropdown
                headType={headType}
                renderImmediately={renderImmediately}
                onOpenWorkspace={onOpenWorkspace}
            />
        </div>
    );
};

export default JobPanel;
