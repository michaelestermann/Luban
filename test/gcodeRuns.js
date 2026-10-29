import test from 'tape';
import {
    buildGcodeFileName,
    isSameTool,
    sanitizeFileNamePart,
    splitToolPathsByTool
} from '../src/shared/lib/gcode-runs';

const tp = (id, toolParams) => ({ id, toolParams });
const V = { definitionId: 'tool.V', toolDiameter: 0.2, toolAngle: 30, toolShaftDiameter: 4 };
const D = { definitionId: 'tool.D', toolDiameter: 1, toolAngle: 180, toolShaftDiameter: 4 };
const ids = (runs) => runs.map(run => run.map(t => t.id));

test('split: A,A,B,A', (t) => {
    const runs = splitToolPathsByTool([tp('a1', V), tp('a2', V), tp('b', D), tp('a3', V)]);
    t.deepEqual(ids(runs), [['a1', 'a2'], ['b'], ['a3']]);
    t.end();
});

test('split: edited angle', (t) => {
    t.equal(splitToolPathsByTool([tp('a', V), tp('b', { ...V, toolAngle: 20 })]).length, 2, 'two runs');
    t.notOk(isSameTool(tp('a', V), tp('b', { ...V, toolAngle: 20 })), 'not the same tool');
    t.end();
});

test('split: single tool, empty, missing toolParams', (t) => {
    t.deepEqual(ids(splitToolPathsByTool([tp('a', V), tp('b', V)])), [['a', 'b']], 'single tool');
    t.deepEqual(splitToolPathsByTool([]), [], 'empty');
    t.deepEqual(ids(splitToolPathsByTool([tp('x'), tp('y')])), [['x', 'y']], 'missing toolParams compare equal');
    t.end();
});

test('name: basic', (t) => {
    t.equal(
        buildGcodeFileName({ project: 'Layout', index: 2, toolName: 'Flat End Mill 1mm', toolPathNames: ['Löcher', 'Bohrungen groß'], suffix: '.cnc' }),
        'Layout_2_Flat-End-Mill-1mm_Loecher+Bohrungen-gross.cnc'
    );
    t.end();
});

test('name: forbidden chars', (t) => {
    t.equal(sanitizeFileNamePart('a/b:c*?"<>|d e'), 'abcd-e');
    t.end();
});

test('name: long toolpaths', (t) => {
    const names = Array.from({ length: 10 }, (_, i) => `toolpath-name-${String(i).padStart(6, '0')}`);
    const name = buildGcodeFileName({ project: 'P', index: 1, toolName: 'T', toolPathNames: names, suffix: '.cnc' });
    t.ok(name.startsWith('P_1_T_'), 'project, number and tool kept');
    t.ok(name.slice('P_1_T_'.length, -'.cnc'.length).length <= 60, 'toolpath part at most 60 chars');
    t.ok(name.endsWith('.cnc'), 'suffix kept');
    t.end();
});
