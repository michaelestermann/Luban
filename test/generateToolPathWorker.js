import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'tape';
import * as sendMessageModule from '../src/server/services/task-manager/utils/sendMessage';

import generateToolPath from '../src/server/services/task-manager/workers/generateToolPath';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><circle cx="20" cy="10" r="5"/></svg>';

const drillTask = (taskId, uploadNames) => ({
    taskId,
    headType: 'cnc',
    identifier: 'A350',
    data: uploadNames.map((uploadName, i) => ({
        modelID: `${taskId}-${i}`,
        headType: 'cnc',
        type: 'vector',
        sourceType: 'svg',
        mode: 'vector',
        uploadName,
        transformation: { positionX: 10 * i, positionY: 0, positionZ: 0, width: 100, height: 50, scaleX: 1, scaleY: 1, rotationZ: 0 },
        gcodeConfig: { pathType: 'drill', stepOver: 0.5, targetDepth: 2, stepDown: 1, safetyHeight: 5, stopHeight: 20, jogSpeed: 1500, plungeSpeed: 300, tabHeight: 0 },
        toolParams: { toolDiameter: 1 },
        materials: { isRotate: false }
    }))
});

const run = async (tasks) => {
    const previousSend = sendMessageModule.default;
    const previousTmpdir = process.env.Tmpdir;
    const messages = [];
    sendMessageModule.default = (m) => messages.push({ ...m, at: Date.now() });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'generate-toolpath-'));
    process.env.Tmpdir = dir;
    try {
        for (const task of tasks) {
            for (const model of task.data) {
                fs.writeFileSync(path.join(dir, model.uploadName), SVG);
            }
        }
        const start = Date.now();
        await generateToolPath(tasks);
        const elapsed = Date.now() - start;
        // anything sent late (e.g. a throttled progress)?
        await new Promise(resolve => setTimeout(resolve, 400));
        return { messages, elapsed, dir };
    } finally {
        sendMessageModule.default = previousSend;
        process.env.Tmpdir = previousTmpdir;
    }
};

test('generateToolPath worker: completes without an artificial delay', async (t) => {
    const { messages, elapsed } = await run([drillTask('tp', ['a.svg', 'b.svg'])]);
    const complete = messages.find(m => m.status === 'complete');
    t.ok(complete, 'complete sent');
    t.ok(elapsed < 300, `done in ${elapsed} ms`);
    t.equal(messages[messages.length - 1].status, 'complete', 'nothing is sent after complete');
    t.end();
});

test('generateToolPath worker: results keep the task and model order', async (t) => {
    const { messages, dir } = await run([drillTask('first', ['a.svg', 'b.svg', 'c.svg']), drillTask('second', ['d.svg'])]);
    const { value } = messages.find(m => m.status === 'complete');
    t.deepEqual(value.map(r => r.taskId), ['first', 'second'], 'task order');
    t.equal(value[0].filenames.length, 3, 'one file per model');
    const positions = value[0].filenames.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).positionX);
    t.deepEqual(positions, [0, 10, 20], 'file order = model order');
    t.end();
});
