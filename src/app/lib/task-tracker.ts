/**
 * Background tasks of the server task manager (toolpaths, view paths, G-code, image processing, SVG clipping,
 * cut model) per mode, so a hanging calculation can be stopped (Luban 4.17 busy guard escape hatch).
 *
 * A task is pending from its commit until its `taskCompleted:*` event. `stop(head)` turns the pending tasks
 * of a mode into stopped ones: their late completions are dropped, and progress events of the mode are
 * dropped while it has no pending task any more. No socket, React or redux here.
 */
/** The printing slice runs one at a time and has no task id: it is tracked under this id. */
export const SLICE_TASK_ID = 'printing-slice';

type TaskEvent = { kind: 'completed'; taskId?: string } | { kind: 'progress'; headType?: string };

/** Which task event a socket event is: a result (ends the task) or a progress, else null. */
export function taskEventOf(eventName: string, payload: unknown): TaskEvent | null {
    const data = (payload && typeof payload === 'object' ? payload : {}) as { taskId?: string; headType?: string };
    if (eventName.startsWith('taskCompleted:')) {
        return { kind: 'completed', taskId: data.taskId };
    }
    if (eventName.startsWith('taskProgress:')) {
        return { kind: 'progress', headType: data.headType };
    }
    if (eventName === 'slice:completed' || eventName === 'slice:error') {
        return { kind: 'completed', taskId: SLICE_TASK_ID };
    }
    if (eventName === 'slice:progress' || eventName === 'slice:started') {
        return { kind: 'progress', headType: 'printing' };
    }
    return null;
}

export class TaskTracker {
    private pending = new Map<string, string>();

    private stopped = new Map<string, string>();

    /** A task was sent to the server. A task id sent again (same toolpath) stays one pending task. */
    public commit(taskId: string | undefined, headType: string | undefined): void {
        if (!taskId || !headType) {
            return;
        }
        this.stopped.delete(taskId);
        this.pending.set(taskId, headType);
    }

    /** The pending task ids of a mode. */
    public pendingOf(headType: string): string[] {
        return Array.from(this.pending.entries()).filter(([, head]) => head === headType).map(([id]) => id);
    }

    /** Stops the pending tasks of a mode; returns their ids (to cancel them on the server). */
    public stop(headType: string): string[] {
        const ids = this.pendingOf(headType);
        for (const id of ids) {
            this.pending.delete(id);
            this.stopped.set(id, headType);
        }
        return ids;
    }

    public isStopped(taskId: string): boolean {
        return this.stopped.has(taskId);
    }

    /**
     * Whether a socket event of a task must not reach the editor: the completion of a stopped task, or a
     * progress of a mode whose tasks were all stopped. A completion ends the task in either case.
     */
    public shouldDrop(eventName: string, payload: unknown): boolean {
        const event = taskEventOf(eventName, payload);
        if (event?.kind === 'completed') {
            const id = event.taskId;
            if (!id) {
                return false;
            }
            if (this.stopped.has(id)) {
                this.stopped.delete(id);
                return true;
            }
            this.pending.delete(id);
            return false;
        }
        if (event?.kind === 'progress') {
            const head = event.headType;
            if (!head) {
                return false;
            }
            const hasStopped = Array.from(this.stopped.values()).includes(head);
            return hasStopped && this.pendingOf(head).length === 0;
        }
        return false;
    }
}

export const taskTracker = new TaskTracker();
