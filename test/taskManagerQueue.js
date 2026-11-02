import test from 'tape';
import { TaskManager } from '../src/server/services/task-manager/TaskManager';
import Task from '../src/server/services/task-manager/Task';

const fakeWorkers = () => {
    const runs = [];
    const workers = {
        generateToolPath: (data, onmessage) => {
            const run = { data, onmessage, terminated: false };
            runs.push(run);
            return { terminate: () => { run.terminated = true; } };
        }
    };
    return { runs, workers };
};

const fakeSocket = () => {
    const emitted = [];
    return { emitted, emit: (event, payload) => emitted.push({ event, payload }) };
};

const newManager = (workers) => {
    const manager = new TaskManager();
    manager.workerManager = workers;
    return manager;
};

const toolPathTask = (socket, id) => new Task(id, socket, [{ taskId: id }], 'generateToolPath', 'cnc');

test('TaskManager: a re-submitted task replaces the old one, other tasks stay cancellable', async (t) => {
    const { runs, workers } = fakeWorkers();
    const socket = fakeSocket();
    const manager = newManager(workers);

    await manager.addTask(toolPathTask(socket, 'other'));
    await manager.addTask(toolPathTask(socket, 'tp'));
    await manager.addTask(toolPathTask(socket, 'tp')); // the old 'tp' run is outdated now

    runs[2].onmessage({ status: 'complete', value: [] });
    runs[1].onmessage({ status: 'complete', value: [] });

    const completed = socket.emitted.filter(e => e.event === 'taskCompleted:generateToolPath');
    t.equal(completed.length, 1, 'only the newest run reports');

    manager.cancelTask('other');
    t.ok(runs[0].terminated, 'the unrelated task is still known and can be cancelled');

    runs[0].onmessage({ status: 'complete', value: [] });
    t.equal(manager.tasks.length, 0, 'no task left behind');
    t.end();
});

test('TaskManager: a worker failure reports a failed task', async (t) => {
    const { runs, workers } = fakeWorkers();
    const socket = fakeSocket();
    const manager = newManager(workers);
    await manager.addTask(toolPathTask(socket, 'tp'));
    runs[0].onmessage({ status: 'fail', value: 'worker exited' });
    const completed = socket.emitted.filter(e => e.event === 'taskCompleted:generateToolPath');
    t.equal(completed.length, 1);
    t.equal(completed[0].payload.taskStatus, 'failed');
    t.end();
});
