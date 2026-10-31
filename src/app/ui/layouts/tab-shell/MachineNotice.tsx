import React, { useEffect, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';

import { tabsActions } from '../../../flux/project/actions-tabs';
import { machineDisplayName, switchMachineTo } from '../../../flux/project/machine-switch';
import { MachineRef, TabsState, isDocumentForOtherMachine } from '../../../flux/project/tabs-model';
import i18n from '../../../lib/i18n';
import {
    MachineNoticeInfo,
    currentMachineNotice,
    dismissMachineNotice,
    showMachineNotice,
    subscribeMachineNotice,
    takeStashedMachineNotice,
} from '../../../lib/machine-notice';
import { mismatchLabels } from './MachineSection';
import { tabDisplayName } from './TabStrip';
import styles from './project-panel.styl';

// React escapes the text; i18next must not escape the machine names ("A350/A350T")
const RAW = { interpolation: { escapeValue: false } };

/** The notice hides itself after this time (ms). */
export const MACHINE_NOTICE_TIMEOUT = 10000;

const WarningIcon: React.FC = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.5l9.5 16.5h-19z" />
        <path d="M12 10v4.5M12 17.5v.01" />
    </svg>
);

const DismissIcon: React.FC = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
    </svg>
);

/**
 * "Machine switched to {{machine}}" with Undo (design D), at the top of the window. Shown when opening a
 * project made for another machine switched it, or after the machine settings switched it (the window is
 * reloaded then). Hides itself after 10 s.
 */
export const MachineNotice: React.FC = () => {
    const dispatch = useDispatch();
    const [notice, setNotice] = useState<MachineNoticeInfo | null>(currentMachineNotice());

    useEffect(() => {
        const unsubscribe = subscribeMachineNotice(setNotice);
        // a switch of the machine settings reloaded the window
        const stashed = takeStashedMachineNotice();
        if (stashed) {
            showMachineNotice(stashed.series, stashed.previous);
        }
        return unsubscribe;
    }, []);

    useEffect(() => {
        if (!notice) {
            return undefined;
        }
        const timer = setTimeout(() => dismissMachineNotice(notice.id), MACHINE_NOTICE_TIMEOUT);
        return () => clearTimeout(timer);
    }, [notice]);

    if (!notice) {
        return null;
    }
    const onUndo = () => {
        dismissMachineNotice(notice.id);
        dispatch(switchMachineTo(notice.previous));
    };
    return (
        <div className={styles.notice} role="status" data-machine-notice={notice.series}>
            <WarningIcon />
            <span>{i18n._('key-Tabs/Machine switched to {{machine}}', { machine: machineDisplayName(notice.series), ...RAW })}</span>
            <button type="button" className={styles['notice-action']} onClick={onUndo} data-machine-notice-undo>
                {i18n._('key-Tabs/Undo')}
            </button>
            <button
                type="button"
                className={styles['notice-dismiss']}
                aria-label={i18n._('key-Tabs/Dismiss')}
                onClick={() => dismissMachineNotice(notice.id)}
            >
                <DismissIcon />
            </button>
        </div>
    );
};

/** Height of the mismatch bar in CSS px (it is added to --tab-strip-height while it shows). */
export const MISMATCH_BAR_HEIGHT = 36;

/** Whether the active tab is a project made for another machine (the mismatch bar shows). */
export function useActiveMismatch(): boolean {
    return useSelector((state: { project: { tabs: TabsState }; machine: MachineRef }) => {
        const tabs = state.project.tabs;
        return isDocumentForOtherMachine(tabs.documents[tabs.activeTabId], { series: state.machine.series, toolHead: state.machine.toolHead });
    });
}

/**
 * Non-blocking bar above the page of a project made for another machine (design D):
 * "{{name}} was made for {{machine}}. Current machine: {{current}}." + "Switch machine to {{machine}}".
 * Nothing switches on a tab change by itself.
 */
export const MachineMismatchBar: React.FC = () => {
    const dispatch = useDispatch();
    const { meta, series, toolHead } = useSelector((state: { project: { tabs: TabsState }; machine: MachineRef }) => ({
        meta: state.project.tabs.documents[state.project.tabs.activeTabId],
        series: state.machine.series,
        toolHead: state.machine.toolHead,
    }), shallowEqual);
    if (!meta) {
        return null;
    }
    const name = tabDisplayName(meta);
    const labels = mismatchLabels(meta, { series, toolHead });
    return (
        <div className={styles['mismatch-bar']} role="status" data-mismatch-bar={meta.id}>
            <WarningIcon />
            <span className={styles['mismatch-text']}>
                {i18n._('key-Tabs/{{name}} was made for {{machine}}. Current machine: {{current}}.', {
                    name,
                    machine: labels.project,
                    current: labels.current,
                    ...RAW,
                })}
            </span>
            <div className={styles.spacer} />
            <button
                type="button"
                className={styles['mismatch-action']}
                onClick={() => dispatch(tabsActions.switchMachineToDocument(meta.id))}
                data-mismatch-switch
            >
                {i18n._('key-Tabs/Switch machine to {{machine}}', { machine: mismatchLabels(meta, { series, toolHead }, true).project, ...RAW })}
            </button>
        </div>
    );
};
