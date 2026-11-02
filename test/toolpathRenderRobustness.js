import test from 'tape';
import { Observable } from 'rxjs';

import { runWorkerTask } from '../src/app/lib/manager/worker-task';
import { renderToolPathFiles } from '../src/app/workers/toolpath-render-files';
import { renderRunFailed } from '../src/app/toolpaths/render-outcome';

const collect = () => {
    const messages = [];
    return { messages, emit: (m) => messages.push(m) };
};

test('runWorkerTask: a worker error frees the slot and reports the error', async (t) => {
    const seen = [];
    let completed = 0;
    const failing = new Observable((observer) => {
        observer.next({ status: 'progress' });
        observer.error(new Error('worker crashed'));
    });
    await runWorkerTask(failing, {
        onMessage: (m) => seen.push(m.status),
        onComplete: () => completed++,
        onError: (err) => seen.push(`error:${err.message}`)
    });
    t.deepEqual(seen, ['progress', 'error:worker crashed'], 'messages, then the error');
    t.equal(completed, 1, 'onComplete still runs once');
    t.end();
});

test('runWorkerTask: resolves on complete', async (t) => {
    const seen = [];
    await runWorkerTask(new Observable((o) => {
        o.next(1);
        o.complete();
    }), { onMessage: (m) => seen.push(m) });
    t.deepEqual(seen, [1]);
    t.end();
});

test('runWorkerTask: an error without an error handler still resolves', async (t) => {
    await runWorkerTask(new Observable((o) => o.error(new Error('x'))), {});
    t.pass('resolved');
    t.end();
});

const renderResult = (name) => ({ name });

test('renderToolPathFiles: every file rendered -> data per file, then succeed', async (t) => {
    const { messages, emit } = collect();
    await renderToolPathFiles(
        { data: [{ modelID: 'a' }, { modelID: 'b' }], filenames: ['a.json', 'b.json'], headType: 'cnc' },
        async (filename) => renderResult(filename),
        emit
    );
    const data = messages.filter(m => m.status === 'data');
    t.deepEqual(data.map(m => m.value.index).sort(), [0, 1], 'one data message per file');
    t.deepEqual(data.map(m => m.value.renderResult.name).sort(), ['a.json', 'b.json']);
    t.equal(messages[messages.length - 1].status, 'succeed', 'ends with succeed');
    t.end();
});

test('renderToolPathFiles: a failing file ends with err, never hangs', async (t) => {
    const { messages, emit } = collect();
    await renderToolPathFiles(
        { data: [{}, {}], filenames: ['ok.json', 'broken.json'], headType: 'cnc' },
        async (filename) => {
            if (filename === 'broken.json') {
                throw new Error('Failed to load broken.json');
            }
            return renderResult(filename);
        },
        emit
    );
    const last = messages[messages.length - 1];
    t.equal(last.status, 'err', 'ends with err');
    t.ok(String(last.value).includes('broken.json'), 'the error names the file');
    t.notOk(messages.some(m => m.status === 'succeed'), 'no succeed');
    t.end();
});

test('renderToolPathFiles: missing file names end with err', async (t) => {
    const { messages, emit } = collect();
    await renderToolPathFiles({ data: [{}], filenames: undefined, headType: 'cnc' }, async () => renderResult('x'), emit);
    t.equal(messages[messages.length - 1].status, 'err');
    t.end();
});

test('renderToolPathFiles: empty data ends with err', async (t) => {
    const { messages, emit } = collect();
    await renderToolPathFiles({ data: [], filenames: [], headType: 'cnc' }, async () => renderResult('x'), emit);
    t.equal(messages[messages.length - 1].status, 'err');
    t.end();
});

test('renderRunFailed: the run ends in G-code or in a failure', (t) => {
    t.equal(renderRunFailed([true, true], true), false, 'all rendered, G-code triggered');
    t.equal(renderRunFailed([true, false], false), true, 'a render failed');
    t.equal(renderRunFailed([], false), true, 'no render started (toolpaths unknown)');
    t.equal(renderRunFailed([true], false), true, 'rendered, but a toolpath is still not generated');
    t.end();
});

test('renderToolPathFiles: progress messages are rate limited, data messages are small', async (t) => {
    const { messages, emit } = collect();
    const files = Array.from({ length: 50 }, (_, i) => `${i}.json`);
    let clock = 0;
    await renderToolPathFiles(
        { data: files.map(() => ({})), filenames: files, headType: 'cnc', taskId: 'tp' },
        async (filename, onProgress) => {
            onProgress(0.5);
            onProgress(1);
            clock += 10; // 10 ms per file
            return renderResult(filename);
        },
        emit,
        { now: () => clock, progressInterval: 100 }
    );
    const progress = messages.filter(m => m.status === 'progress');
    t.ok(progress.length <= 6, `${progress.length} progress messages for 50 files (500 ms)`);
    const data = messages.filter(m => m.status === 'data');
    t.equal(data.length, 50, 'every file still reports its data');
    t.deepEqual(Object.keys(data[0].value).sort(), ['index', 'renderResult'], 'data carries no copy of the whole task');
    t.end();
});
