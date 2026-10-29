import test from 'tape';
import { describeGcodeFiles, projectBaseName } from '../src/app/toolpaths/gcode-file-state';

const toolPaths = [
    { id: 't1', name: 'Iso', toolParams: { definitionName: 'V-Bit' } },
    { id: 't2', name: 'Iso 2', toolParams: { definitionName: 'V-Bit' } },
    { id: 't3', name: 'Löcher', toolParams: { definitionName: 'Drill 1mm' } }
];

test('describe files: names, tools and toolpaths per file', (t) => {
    const files = describeGcodeFiles(
        [{ toolPathIds: ['t1', 't2'], estimatedTime: 30 }, { toolPathIds: ['t3'], estimatedTime: 12 }],
        toolPaths,
        'Layout',
        '.cnc'
    );
    t.deepEqual(files.map(f => f.renderGcodeFileName), ['Layout_1_V-Bit_Iso+Iso-2.cnc', 'Layout_2_Drill-1mm_Loecher.cnc']);
    t.deepEqual(files.map(f => f.toolName), ['V-Bit', 'Drill 1mm']);
    t.deepEqual(files.map(f => f.toolPathNames), [['Iso', 'Iso 2'], ['Löcher']]);
    t.deepEqual(files.map(f => f.index), [1, 2]);
    t.end();
});

test('describe files: missing tool name falls back to CUT', (t) => {
    const [file] = describeGcodeFiles([{ toolPathIds: ['x'] }], [{ id: 'x', name: 'Path' }], 'P', '.cnc');
    t.equal(file.renderGcodeFileName, 'P_1_CUT_Path.cnc');
    t.end();
});

test('project base name: opened file wins, else first model name without image extension', (t) => {
    t.equal(projectBaseName({ name: 'PCB.snapcnc' }, 'board.svg'), 'PCB');
    t.equal(projectBaseName(null, 'board.svg'), 'board');
    t.equal(projectBaseName(undefined, undefined), 'Luban');
    t.end();
});
