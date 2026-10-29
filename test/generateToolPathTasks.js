import test from 'tape';
import { buildGenerateToolPathTasks } from '../src/app/toolpaths/generate-tasks';

test('buildGenerateToolPathTasks: skips toolpaths without a task', (t) => {
    const toolPaths = [
        { id: 'isolation', visible: true },
        { id: 'holes', visible: true }
    ];
    // a toolpath without visible models (or already generated, or failed) yields no task
    const getTask = (id) => (id === 'holes' ? { taskId: 'holes', data: [{}] } : null);
    const tasks = buildGenerateToolPathTasks(toolPaths, getTask, 'A400');
    t.deepEqual(tasks, [{ taskId: 'holes', data: [{}], identifier: 'A400' }], 'only the drill task, with machine identifier');
    t.end();
});

test('buildGenerateToolPathTasks: hidden toolpaths are not generated', (t) => {
    const asked = [];
    const getTask = (id) => {
        asked.push(id);
        return { taskId: id };
    };
    buildGenerateToolPathTasks([{ id: 'a', visible: false }, { id: 'b', visible: true }], getTask, 'A400');
    t.deepEqual(asked, ['b'], 'only visible toolpaths are asked for a task');
    t.end();
});
