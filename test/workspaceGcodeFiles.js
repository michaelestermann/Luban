import test from 'tape';
import {
    isJobRunning, mergeGcodeFileList, planWorkspaceLoad, removeJobFiles, removeSourceFiles, tagJobSource
} from '../src/app/flux/workspace/gcode-file-list';

test('mergeGcodeFileList: replaces same display name', (t) => {
    const files = mergeGcodeFileList(
        [{ uploadName: 'u1', renderGcodeFileName: 'L_1_V.cnc' }, { uploadName: 'u0', renderGcodeFileName: 'other.cnc' }],
        { uploadName: 'u2', renderGcodeFileName: 'L_1_V.cnc' }
    );
    t.deepEqual(files.map(f => f.uploadName), ['u2', 'u0'], 'old L_1_V.cnc removed, new one first');
    t.end();
});

test('mergeGcodeFileList: replaces same uploadName', (t) => {
    const files = mergeGcodeFileList([{ uploadName: 'u1', renderGcodeFileName: 'a.cnc' }], { uploadName: 'u1', renderGcodeFileName: 'b.cnc' });
    t.deepEqual(files.map(f => f.renderGcodeFileName), ['b.cnc']);
    t.end();
});

test('mergeGcodeFileList: cap 10', (t) => {
    const existing = Array.from({ length: 12 }, (_, i) => ({ uploadName: `u${i}`, renderGcodeFileName: `f${i}.cnc` }));
    const files = mergeGcodeFileList(existing, { uploadName: 'new', renderGcodeFileName: 'new.cnc' });
    t.equal(files.length, 10, 'at most 10 files');
    t.equal(files[0].uploadName, 'new', 'new file first');
    t.end();
});

test('mergeGcodeFileList: rename fields reset on the new file', (t) => {
    const [file] = mergeGcodeFileList([], { uploadName: 'u', name: 'n.cnc', renderGcodeFileName: 'n.cnc', isRenaming: true });
    t.equal(file.isRenaming, false);
    t.equal(file.newName, 'n.cnc');
    t.end();
});

test('planWorkspaceLoad: only file 1 is previewed and becomes active, the others only go into the list', (t) => {
    const f = (n) => ({ uploadName: `u${n}` });
    const plan = planWorkspaceLoad([f(1), f(2), f(3)]);
    t.deepEqual(plan.listOnly.map(x => x.uploadName), ['u3', 'u2'], 'added last-first so file 1 ends on top');
    t.equal(plan.active.uploadName, 'u1', 'file 1 is active');
    t.deepEqual(planWorkspaceLoad([f(1)]).listOnly, [], 'single file: nothing list-only');
    t.end();
});

test('removeJobFiles: files of an earlier generation of the same job are removed', (t) => {
    const kept = removeJobFiles(
        [{ uploadName: 'a', jobName: 'PCB' }, { uploadName: 'b', jobName: 'Other' }, { uploadName: 'c' }],
        'PCB'
    );
    t.deepEqual(kept.map(x => x.uploadName), ['b', 'c'], 'old PCB_3_... gone, other jobs and imported files kept');
    t.deepEqual(removeJobFiles([{ uploadName: 'c' }], undefined).map(x => x.uploadName), ['c'], 'no job name: nothing removed');
    t.end();
});

test('planWorkspaceLoad while a job runs lists all files and activates none', (t) => {
    const f = (n) => ({ uploadName: `u${n}` });
    const plan = planWorkspaceLoad([f(1), f(2), f(3)], true);
    t.deepEqual(plan.listOnly.map(x => x.uploadName), ['u3', 'u2', 'u1'], 'all files, last first, so file 1 ends on top');
    t.equal(plan.active, null, 'nothing is previewed or activated');
    t.deepEqual(planWorkspaceLoad([f(1), f(2)], false).listOnly.map(x => x.uploadName), ['u2'], 'not running: unchanged');
    t.end();
});

test('isJobRunning: starting, running, pausing, paused and stopping', (t) => {
    ['starting', 'running', 'pausing', 'paused', 'stopping'].forEach(s => t.equal(isJobRunning(s), true, s));
    ['idle', 'unknown', 'stopped', 'finishing', undefined, null].forEach(s => t.equal(isJobRunning(s), false, String(s)));
    t.end();
});

test('removeSourceFiles drops only the older files of the same project', (t) => {
    const files = [
        { uploadName: 'a1', sourceDocId: 'A' },
        { uploadName: 'b1', sourceDocId: 'B' },
        { uploadName: 'x' },
        { uploadName: 'a2', sourceDocId: 'A' },
    ];
    t.deepEqual(removeSourceFiles(files, 'A').map(f => f.uploadName), ['b1', 'x'], 'files of A gone, B and untagged kept');
    t.deepEqual(removeSourceFiles(files, 'A', ['a2']).map(f => f.uploadName), ['b1', 'x', 'a2'], 'kept upload names stay');
    t.deepEqual(removeSourceFiles(files, undefined).map(f => f.uploadName), ['a1', 'b1', 'x', 'a2'], 'no source: nothing removed');
    t.equal(files.length, 4, 'input not mutated');
    t.end();
});

test('tagJobSource adds the source to every file without mutating the input', (t) => {
    const files = [{ uploadName: 'u1', jobName: 'PCB' }, { uploadName: 'u2' }];
    const tagged = tagJobSource(files, { sourceDocId: 'A', sourceName: 'pcb-a.snapcnc' });
    t.deepEqual(tagged, [
        { uploadName: 'u1', jobName: 'PCB', sourceDocId: 'A', sourceName: 'pcb-a.snapcnc' },
        { uploadName: 'u2', sourceDocId: 'A', sourceName: 'pcb-a.snapcnc' },
    ]);
    t.notEqual(tagged[0], files[0], 'copies');
    t.equal(files[0].sourceDocId, undefined, 'input untouched');
    t.end();
});
