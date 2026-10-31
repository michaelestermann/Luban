/**
 * One machine overall (Luban 4.17 tabs, design D): switch the global machine without reloading the window.
 *
 * The machine slice gets the series, toolheads, machine definition and size (as `__initMachine` does at
 * start) and they are stored for the next start. The shown edit page is mounted again by its route key
 * (App.tsx keys the editor routes by document and machine), so its init reads the new machine; pages of
 * other modes read it on their next mount.
 */
import { findMachineByName, MACHINE_TOOL_HEADS } from '../../constants/machines';
import log from '../../lib/log';
import { showMachineNotice } from '../../lib/machine-notice';
import { machineStore } from '../../store/local-storage';
/* eslint-disable import/no-cycle */
import { actions as machineActions } from '../machine';
import baseActions from '../machine/action-base';
import { actions as widgetActions } from '../widget';
/* eslint-enable import/no-cycle */
import {
    EDITOR_HEAD_TYPES,
    EditorHeadType,
    MachineRef,
    ProjectMachineRef,
    isEditorHeadType,
    machineSwitchToolHead,
    needsMachineSwitch,
    normalizeMachineSeries,
} from './tabs-model';

interface MachineLike {
    identifier: string;
    fullName?: string;
    metadata?: { size?: { x: number; y: number; z: number }; toolHeads?: Array<{ identifier: string }> };
}

/** The toolhead identifiers of a machine per mode. */
export function availableToolHeadsOf(machine: MachineLike | null | undefined): Partial<Record<EditorHeadType, string[]>> {
    const out: Partial<Record<EditorHeadType, string[]>> = {};
    for (const option of machine?.metadata?.toolHeads || []) {
        const head = MACHINE_TOOL_HEADS[option.identifier]?.metadata?.headType;
        if (isEditorHeadType(head)) {
            out[head] = [...(out[head] || []), option.identifier];
        }
    }
    return out;
}

/** The machine a project or tab was made for, by its series (legacy names mapped); null when it is unknown. */
export function knownMachineOf(series: string | null | undefined): MachineLike | null {
    const normalized = normalizeMachineSeries(series);
    return normalized ? (findMachineByName(normalized) as MachineLike | null) : null;
}

/** Display name of a machine series ("Snapmaker Artisan"); the series itself when it is unknown. */
export function machineDisplayName(series: string | null | undefined): string {
    return knownMachineOf(series)?.fullName || normalizeMachineSeries(series) || '';
}

export function currentMachineRef(state): MachineRef {
    return { series: state.machine.series, toolHead: { ...(state.machine.toolHead || {}) } };
}

/**
 * Whether a project needs another machine that Luban knows (an unknown series can not be switched to).
 */
export function shouldSwitchMachineFor(state, project: ProjectMachineRef | null | undefined, headType: EditorHeadType): boolean {
    return needsMachineSwitch(currentMachineRef(state), project, headType) && !!knownMachineOf(project?.series);
}

/**
 * Makes `series` with `toolHead` the machine (stored for the next start). Toolheads the machine does not
 * have are replaced by its first toolhead of that mode. Returns false for an unknown series.
 */
export const applyMachine = (series: string, toolHead: Record<string, string>) => (dispatch, getState): boolean => {
    const machine = knownMachineOf(series);
    if (!machine) {
        return false;
    }
    const identifier = machine.identifier;
    const fixed = machineSwitchToolHead(toolHead, null, EDITOR_HEAD_TYPES[0], availableToolHeadsOf(machine));
    const before = currentMachineRef(getState());
    machineStore.set('machine.series', identifier);
    machineStore.set('machine.toolHead', fixed);
    dispatch(baseActions.updateState({
        series: identifier,
        toolHead: fixed,
        activeMachine: machine,
        machine,
    }));
    if (machine.metadata?.size) {
        dispatch(machineActions.updateMachineSize({ ...machine.metadata.size }));
    }
    dispatch(widgetActions.updateMachineSeries(identifier));
    log.info(`tabs: machine ${before.series} -> ${identifier}`);
    return true;
};

/**
 * Switches to the machine a project was made for (its toolhead for the project's mode, the current ones for
 * the other modes where the machine has them) and shows "Machine switched to …" with Undo. Returns the
 * machine before the switch, or null when nothing was switched.
 */
export const switchMachineForProject = (project: ProjectMachineRef, headType: EditorHeadType) => (dispatch, getState): MachineRef | null => {
    const state = getState();
    if (!shouldSwitchMachineFor(state, project, headType)) {
        return null;
    }
    const machine = knownMachineOf(project.series);
    const previous = currentMachineRef(state);
    const toolHead = machineSwitchToolHead(previous.toolHead, project.toolHead || null, headType, availableToolHeadsOf(machine));
    if (!dispatch(applyMachine(machine.identifier, toolHead))) {
        return null;
    }
    showMachineNotice(machine.identifier, previous);
    return previous;
};

/** Switches back to a machine (Undo of the notice) or to the machine of a tab (mismatch bar). */
export const switchMachineTo = (target: MachineRef, notify = false) => (dispatch, getState): boolean => {
    const previous = currentMachineRef(getState());
    const ok = dispatch(applyMachine(normalizeMachineSeries(target.series) || target.series, target.toolHead || {}));
    if (ok && notify) {
        showMachineNotice(getState().machine.series, previous);
    }
    return ok;
};
