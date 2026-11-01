import { test } from 'tape';
import { SLICE_TASK_ID, TaskTracker } from '../src/app/lib/task-tracker';
import {
    PROGRESS_STALL_MS,
    isProgressStalled,
    runningToolPaths,
    stoppedSliceState,
    trackProgress,
} from '../src/app/flux/project/busy-stop';
import { isHeadBusy } from '../src/app/flux/project/document-swap';
import { currentDialogRequest, requestBusyStop } from '../src/app/lib/tab-dialogs';

test('trackProgress: the clock restarts only when the progress changes', (t) => {
    const a = trackProgress(null, 0.2, 1000);
    t.deepEqual(a, { progress: 0.2, since: 1000 }, 'first value');
    t.equal(trackProgress(a, 0.2, 5000), a, 'same value keeps the clock');
    t.deepEqual(trackProgress(a, 0.3, 6000), { progress: 0.3, since: 6000 }, 'new value restarts it');
    t.end();
});

test('isProgressStalled: 120 s without progress, finished progress never', (t) => {
    t.equal(PROGRESS_STALL_MS, 120000, '120 s');
    const clock = { progress: 0.4, since: 0 };
    t.equal(isProgressStalled(clock, 119999), false, 'just under');
    t.equal(isProgressStalled(clock, 120000), true, 'at the limit');
    t.equal(isProgressStalled({ progress: 1, since: 0 }, 500000), false, 'finished');
    t.equal(isProgressStalled(null, 500000), false, 'no clock');
    t.equal(isProgressStalled(clock, 3000, 2000), true, 'custom limit');
    t.end();
});

test('stoppedSliceState: a busy laser/cnc/printing slice is idle afterwards', (t) => {
    const finished = { inProgress: () => false };
    for (const head of ['laser', 'cnc']) {
        const busy = { inProgress: true, isGcodeGenerating: true, stage: 9, progress: 0.3, progressStatesManager: finished, toolPathGroup: { toolPaths: [] } };
        const state = { [head]: { ...busy, ...stoppedSliceState(head) }, project: { general: {} } };
        t.equal(isHeadBusy(state, head), false, `${head} idle`);
        t.equal(state[head].progress, 1, `${head} progress 1 closes the overlay`);
    }
    const printing = { printing: { stage: 27, progress: 0.4, inProgress: true, ...stoppedSliceState('printing') }, project: { general: {} } };
    t.equal(isHeadBusy(printing, 'printing'), false, 'printing idle');
    t.end();
});

test('runningToolPaths: only the calculating ones', (t) => {
    const a = { id: 'a', status: 'running' };
    const b = { id: 'b', status: 'success' };
    t.deepEqual(runningToolPaths([a, b, null]), [a]);
    t.deepEqual(runningToolPaths(undefined), []);
    t.end();
});

test('TaskTracker: stop returns the pending tasks of the mode and drops their late events', (t) => {
    const tracker = new TaskTracker();
    tracker.commit('tp1', 'cnc');
    tracker.commit('g1', 'cnc');
    tracker.commit('l1', 'laser');
    t.deepEqual(tracker.pendingOf('cnc').sort(), ['g1', 'tp1']);
    t.equal(tracker.shouldDrop('taskProgress:generateToolPath', { headType: 'cnc', progress: 0.5 }), false, 'progress of a running task passes');
    t.deepEqual(tracker.stop('cnc').sort(), ['g1', 'tp1'], 'stopped ids');
    t.deepEqual(tracker.pendingOf('cnc'), [], 'nothing pending');
    t.equal(tracker.shouldDrop('taskProgress:generateToolPath', { headType: 'cnc', progress: 0.6 }), true, 'late progress dropped');
    t.equal(tracker.shouldDrop('taskProgress:generateToolPath', { headType: 'laser', progress: 0.6 }), false, 'other mode passes');
    t.equal(tracker.shouldDrop('taskCompleted:generateToolPath', { taskId: 'tp1', headType: 'cnc' }), true, 'late result dropped');
    t.equal(tracker.shouldDrop('taskCompleted:generateToolPath', { taskId: 'tp1', headType: 'cnc' }), false, 'only once');
    t.equal(tracker.shouldDrop('taskCompleted:generateGcode', { taskId: 'l1', headType: 'laser' }), false, 'result of a running task passes');
    t.deepEqual(tracker.pendingOf('laser'), [], 'and ends it');
    t.end();
});

test('TaskTracker: a new task of the mode after a stop gets its progress again', (t) => {
    const tracker = new TaskTracker();
    tracker.commit('tp1', 'cnc');
    tracker.stop('cnc');
    tracker.commit('tp2', 'cnc');
    t.equal(tracker.shouldDrop('taskProgress:generateToolPath', { headType: 'cnc' }), false, 'progress of the new task passes');
    tracker.commit('tp1', 'cnc');
    t.equal(tracker.isStopped('tp1'), false, 'the same id sent again runs again');
    tracker.commit(undefined, 'cnc');
    tracker.commit('x', undefined);
    t.deepEqual(tracker.pendingOf('cnc').sort(), ['tp1', 'tp2'], 'incomplete commits ignored');
    t.end();
});

test('requestBusyStop: "Stop and close" / "Wait" through the dialog host', async (t) => {
    const promise = requestBusyStop(['Sign.snapcnc'], 'close');
    const req = currentDialogRequest();
    t.equal(req.kind, 'busy-stop', 'busy dialog');
    t.deepEqual(req.names, ['Sign.snapcnc']);
    t.equal(req.context, 'close');
    req.respond('stop');
    t.equal(await promise, 'stop');
    const quit = requestBusyStop(['A', 'B'], 'quit');
    currentDialogRequest().respond('wait');
    t.equal(await quit, 'wait');
    t.end();
});

test('TaskTracker: the printing slice is tracked by its socket events', (t) => {
    const tracker = new TaskTracker();
    tracker.commit(SLICE_TASK_ID, 'printing');
    t.equal(tracker.shouldDrop('slice:progress', 0.4), false, 'progress of a running slice passes');
    t.deepEqual(tracker.stop('printing'), [SLICE_TASK_ID]);
    t.equal(tracker.shouldDrop('slice:progress', 0.5), true, 'late progress dropped');
    t.equal(tracker.shouldDrop('slice:completed', { gcodeFilename: 'x' }), true, 'late result dropped');
    t.equal(tracker.shouldDrop('slice:error', {}), false, 'only once');
    t.equal(tracker.shouldDrop('connection:open', {}), false, 'other events pass');
    t.end();
});
