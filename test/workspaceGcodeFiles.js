import test from 'tape';
import { mergeGcodeFileList } from '../src/app/flux/workspace/gcode-file-list';

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
