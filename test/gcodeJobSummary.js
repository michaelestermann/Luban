import test from 'tape';
import { formatDuration, getVisibleToolPathNames, getWorkArea, summarizeGcodeJob } from '../src/app/toolpaths/gcode-job-summary';
import { planSingleFileWorkspaceLoad, removeStaleJobFiles } from '../src/app/flux/workspace/gcode-file-list';

const box = (minX, minY, maxX, maxY, minZ = 0) => ({ min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: 0 } });

test('job summary: CNC with three files', (t) => {
    const files = [
        { index: 1, estimatedTime: 250, boundingBox: box(0, 0, 60, 70) },
        { index: 2, estimatedTime: 131, boundingBox: box(2, 4, 50, 74) },
        { index: 3, estimatedTime: 190.4, boundingBox: box(-6, 1, 30, 20) },
    ];
    const summary = summarizeGcodeJob(files, true);
    t.equal(summary.totalTime, 571.4, 'total time is the sum of the files');
    t.equal(summary.fileCount, 3, 'three files');
    t.equal(summary.toolChanges, 2, 'a tool change before every file but the first');
    t.deepEqual(summary.toolChangeBeforeFiles, [2, 3], 'tool change before file 2 and 3');
    t.deepEqual(summary.workArea, { width: 66, height: 74 }, 'work area is the union of the bounding boxes');
    t.end();
});

test('job summary: laser single file has no tool change', (t) => {
    const summary = summarizeGcodeJob([{ estimatedTime: 42, boundingBox: box(10, 10, 20.04, 15.06) }], false);
    t.equal(summary.totalTime, 42);
    t.equal(summary.fileCount, 1);
    t.equal(summary.toolChanges, 0, 'laser: no tool change');
    t.deepEqual(summary.toolChangeBeforeFiles, []);
    t.deepEqual(summary.workArea, { width: 10, height: 5.1 }, 'rounded to 0.1 mm');
    t.end();
});

test('job summary: CNC single file has no tool change; empty job', (t) => {
    t.equal(summarizeGcodeJob([{ estimatedTime: 1 }], true).toolChanges, 0, 'one file: no change');
    const empty = summarizeGcodeJob([], true);
    t.equal(empty.totalTime, 0);
    t.equal(empty.fileCount, 0);
    t.equal(empty.toolChanges, 0);
    t.equal(empty.workArea, null, 'no files: no work area');
    t.end();
});

test('job summary: missing estimated time counts as 0, file index falls back to position', (t) => {
    const summary = summarizeGcodeJob([{ estimatedTime: 10 }, { estimatedTime: undefined }, { estimatedTime: NaN }], true);
    t.equal(summary.totalTime, 10);
    t.deepEqual(summary.toolChangeBeforeFiles, [2, 3]);
    t.end();
});

test('work area: falls back to the G-code header range, skips files without data, null for rotary', (t) => {
    const header = { gcodeAxisWorkRange: { min: { x: '0', y: '-5' }, max: { x: '40', y: '15' } } };
    t.deepEqual(getWorkArea([header]), { width: 40, height: 20 }, 'header strings are numbers');
    t.deepEqual(getWorkArea([{}, { boundingBox: box(0, 0, 10, 10) }]), { width: 10, height: 10 }, 'file without data skipped');
    t.equal(getWorkArea([{ is_rotate: true, boundingBox: box(0, 0, 10, 10) }]), null, 'rotary: no flat work area');
    t.equal(getWorkArea([{ boundingBox: { min: { x: Infinity, y: Infinity }, max: { x: -Infinity, y: -Infinity } } }]), null, 'empty box: none');
    t.end();
});

test('formatDuration', (t) => {
    t.equal(formatDuration(0), '0 s');
    t.equal(formatDuration(35.4), '35 s');
    t.equal(formatDuration(250), '4 min 10 s');
    t.equal(formatDuration(571.4), '9 min 31 s');
    t.equal(formatDuration(3600 + 5 * 60 + 9), '1 h 5 min');
    t.equal(formatDuration(undefined), '–', 'unknown time');
    t.end();
});

test('removeStaleJobFiles: drops earlier generations of the job, keeps the current files and other jobs', (t) => {
    const workspace = [
        { uploadName: 'old1', jobName: 'PCB' },
        { uploadName: 'u2', jobName: 'PCB' },
        { uploadName: 'x', jobName: 'Other' },
        { uploadName: 'loose' },
    ];
    const job = [{ uploadName: 'u1', jobName: 'PCB' }, { uploadName: 'u2', jobName: 'PCB' }];
    t.deepEqual(removeStaleJobFiles(workspace, job).map(f => f.uploadName), ['u2', 'x', 'loose']);
    t.deepEqual(removeStaleJobFiles(workspace, [{ uploadName: 'n' }]), workspace, 'no job name: unchanged');
    t.end();
});

test('planSingleFileWorkspaceLoad: the chosen file becomes active, files of the job already sent stay', (t) => {
    const workspace = [{ uploadName: 'u1', jobName: 'PCB' }, { uploadName: 'stale', jobName: 'PCB' }];
    const job = [{ uploadName: 'u1', jobName: 'PCB' }, { uploadName: 'u2', jobName: 'PCB' }];
    const plan = planSingleFileWorkspaceLoad(workspace, job, 'u2');
    t.equal(plan.active.uploadName, 'u2', 'file 2 is loaded');
    t.deepEqual(plan.keep.map(f => f.uploadName), ['u1'], 'file 1 sent earlier stays, stale file of the job is dropped');
    t.equal(planSingleFileWorkspaceLoad(workspace, job, 'nope').active, null, 'unknown file: nothing to load');
    t.end();
});

test('getVisibleToolPathNames: works on toolpath states (plain objects from getToolPaths)', (t) => {
    const states = [
        { name: 'Isolation', visible: true, visibleModelIDs: ['a'] },
        { name: 'Hidden', visible: false, visibleModelIDs: ['b'] },
        { name: 'Empty', visible: true, visibleModelIDs: [] },
        { name: 'Umriss', visible: true, visibleModelIDs: ['c', 'd'] },
    ];
    t.deepEqual(getVisibleToolPathNames(states), ['Isolation', 'Umriss'], 'only visible toolpaths with visible objects');
    t.deepEqual(getVisibleToolPathNames([{ name: 'X', visible: true }]), [], 'missing visibleModelIDs counts as none');
    t.end();
});
