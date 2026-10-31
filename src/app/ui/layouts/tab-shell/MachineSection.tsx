import classNames from 'classnames';
import React from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';

import { CONNECTION_STATUS_CONNECTING } from '../../../constants';
import { MACHINE_TOOL_HEADS } from '../../../constants/machines';
import { machineDisplayName } from '../../../flux/project/machine-switch';
import {
    DocumentMeta,
    EDITOR_HEAD_TYPES,
    EditorHeadType,
    MachineRef,
    TabsState,
    lastEditorHead,
    normalizeMachineSeries,
} from '../../../flux/project/tabs-model';
import connectActions from '../../../flux/workspace/actions-connect';
import i18n from '../../../lib/i18n';
import styles from './project-panel.styl';

/** Machine name without the brand ("Artisan", "J1/J1s") for the narrow panel rows. */
export function machineShortName(series: string | null | undefined): string {
    return machineDisplayName(series).replace(/^Snapmaker\s+/, '');
}

/** Display label of a toolhead identifier ("200W CNC"). */
export function toolHeadLabel(id: string | null | undefined): string {
    return id ? i18n._(MACHINE_TOOL_HEADS[id]?.label || id) : '';
}

/**
 * How a tab's machine and the current machine are named in the panel row and the mismatch bar: the machine
 * names, and when the machine is the same and only the toolhead of the tab's mode differs, with the toolheads.
 */
export function mismatchLabels(meta: DocumentMeta, current: MachineRef, short = false): { project: string; current: string } {
    const name = short ? machineShortName : machineDisplayName;
    const key = `${meta.headType}Toolhead`;
    const sameSeries = normalizeMachineSeries(meta.machineSeries) === normalizeMachineSeries(current.series);
    if (!sameSeries) {
        return { project: name(meta.machineSeries), current: name(current.series) };
    }
    return {
        project: `${name(meta.machineSeries)} · ${toolHeadLabel(meta.machineToolHead?.[key])}`,
        current: `${name(current.series)} · ${toolHeadLabel(current.toolHead?.[key])}`,
    };
}

export const MachineIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
        <path d="M3.5 8h17M9 8v6.5h6V8M12 14.5v3" />
    </svg>
);

interface MachineSectionProps {
    collapsed: boolean;
    /** opens the Workspace tab (the connection widget lives there) */
    onOpenWorkspace: () => void;
}

/**
 * Machine section at the bottom of the project panel (design D): the one machine, its toolhead for the
 * active mode (on Home / Workspace the last editor mode), the connection state and Connect / Disconnect.
 * "Connect" only opens the Workspace tab; the connection is made there.
 */
const MachineSection: React.FC<MachineSectionProps> = ({ collapsed, onOpenWorkspace }) => {
    const dispatch = useDispatch();
    const tabs: TabsState = useSelector((state: { project: { tabs: TabsState } }) => state.project.tabs);
    const { series, toolHead } = useSelector((state: { machine: { series: string; toolHead: Record<string, string> } }) => ({
        series: state.machine.series,
        toolHead: state.machine.toolHead,
    }), shallowEqual);
    type WorkspaceLike = { workspace: { isConnected: boolean; connectionStatus: string; server: unknown } };
    const { isConnected, connectionStatus, server } = useSelector((state: WorkspaceLike) => ({
        isConnected: state.workspace.isConnected,
        connectionStatus: state.workspace.connectionStatus,
        server: state.workspace.server,
    }), shallowEqual);

    const name = machineDisplayName(series);
    const head: EditorHeadType | undefined = lastEditorHead(tabs)
        ?? EDITOR_HEAD_TYPES.find((h) => !!MACHINE_TOOL_HEADS[toolHead?.[`${h}Toolhead`]]);
    const toolHeadId = head ? toolHead?.[`${head}Toolhead`] : null;
    const headLabel = toolHeadLabel(toolHeadId);

    let stateText = i18n._('key-Tabs/Not connected');
    if (isConnected) {
        stateText = i18n._('key-Tabs/Connected');
    } else if (connectionStatus === CONNECTION_STATUS_CONNECTING) {
        stateText = i18n._('key-Tabs/Connecting…');
    }

    const onDisconnect = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        server && dispatch(connectActions.disconnect(server as any));
    };

    if (collapsed) {
        return (
            <button
                type="button"
                className={classNames(styles['icon-button'], styles['mini-machine'])}
                title={`${name} · ${stateText}`}
                aria-label={`${i18n._('key-Tabs/Machine')}: ${name} · ${stateText}`}
                onClick={onOpenWorkspace}
                data-machine-section="collapsed"
            >
                <MachineIcon />
                <span className={classNames(styles['mini-conn'], { [styles.connected]: isConnected })} />
            </button>
        );
    }

    return (
        <section className={styles.machine} aria-label={i18n._('key-Tabs/Machine')} data-machine-section="expanded">
            <span className={styles.label}>{i18n._('key-Tabs/Machine')}</span>
            <div className={styles['machine-row']}>
                <span className={styles['machine-icon']}><MachineIcon /></span>
                <div className={styles['machine-text']}>
                    <b className={styles['machine-name']} title={name} data-machine-name>{name}</b>
                    <span className={styles['machine-toolhead']} title={headLabel} data-machine-toolhead={toolHeadId || ''}>{headLabel}</span>
                </div>
            </div>
            <div className={styles['machine-conn']}>
                <span className={classNames(styles['conn-dot'], { [styles.connected]: isConnected })} />
                <span data-connection-state>{stateText}</span>
                <div className={styles.spacer} />
                {isConnected ? (
                    <button type="button" className={styles['small-button']} onClick={onDisconnect} data-machine-disconnect>
                        {i18n._('key-Tabs/Disconnect')}
                    </button>
                ) : (
                    <button type="button" className={classNames(styles['small-button'], styles['small-primary'])} onClick={onOpenWorkspace} data-machine-connect>
                        {i18n._('key-Tabs/Connect')}
                    </button>
                )}
            </div>
        </section>
    );
};

export default MachineSection;
