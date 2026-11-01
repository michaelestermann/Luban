/**
 * Escape hatch of the busy guard (Luban 4.17 tabs): a mode whose calculation hangs can be stopped, so its
 * tab can be closed, left or the app quit. Pure helpers; the thunk is `stopBusyMode` in actions-tabs.
 */
import { STEP_STAGE } from '../../lib/manager/ProgressManager';
import { EditorHeadType } from './tabs-model';

/** A progress that has not advanced for this long offers "Stop" on the progress overlay. */
export const PROGRESS_STALL_MS = 120000;

export interface ProgressClock {
    progress: number;
    /** when the progress got this value (ms) */
    since: number;
}

/** The clock after a progress value was seen at `now`: a changed value restarts it, the same value keeps it. */
export function trackProgress(prev: ProgressClock | null, progress: number, now: number): ProgressClock {
    if (prev && prev.progress === progress) {
        return prev;
    }
    return { progress, since: now };
}

/** Whether a running progress has not advanced for `limitMs` (finished progress never counts). */
export function isProgressStalled(clock: ProgressClock | null, now: number, limitMs: number = PROGRESS_STALL_MS): boolean {
    if (!clock || clock.progress >= 1) {
        return false;
    }
    return now - clock.since >= limitMs;
}

/**
 * Slice keys that end a running operation of a mode: no task flags, no step, progress 1 (the progress
 * overlay closes). With a finished progress manager and no running toolpath the mode is not busy any more.
 */
export function stoppedSliceState(headType: EditorHeadType): Record<string, unknown> {
    if (headType === 'printing') {
        return { inProgress: false, stage: STEP_STAGE.EMPTY, progress: 1 };
    }
    return { inProgress: false, isGcodeGenerating: false, stage: STEP_STAGE.EMPTY, progress: 1 };
}

/** The toolpaths of a slice that are still calculating. */
export function runningToolPaths<T extends { status?: string }>(toolPaths: readonly T[] | null | undefined): T[] {
    return (toolPaths || []).filter((t) => t && t.status === 'running');
}
