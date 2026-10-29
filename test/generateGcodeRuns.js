import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'tape';
import { generateGcodeFiles, writeGcodeFile } from '../src/server/services/task-manager/workers/generateGcode';
import { taskGcodeFiles } from '../src/server/services/task-manager/utils/taskGcodeFiles';

const V = { definitionId: 'tool.V', toolDiameter: 0.2, toolAngle: 30, toolShaftDiameter: 4 };
const D = { definitionId: 'tool.D', toolDiameter: 1, toolAngle: 180, toolShaftDiameter: 4 };

const withTmpdir = async (fn) => {
    const previous = process.env.Tmpdir;
    process.env.Tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcode-runs-'));
    try {
        await fn(process.env.Tmpdir);
    } finally {
        process.env.Tmpdir = previous;
    }
};

const writeToolPathJson = (dir, name, estimatedTime, maxX) => {
    fs.writeFileSync(path.join(dir, name), JSON.stringify({
        headType: 'cnc',
        data: [{ G: 0, X: 1, Y: 1 }, { G: 1, Z: -1, F: 'plungeSpeed' }],
        estimatedTime,
        boundingBox: { min: { x: 0, y: 0, z: -1, b: 0 }, max: { x: maxX, y: 5, z: 2, b: 0 } },
        positionX: 0,
        positionY: 0,
        rotationB: 0
    }));
};

const toolPath = (id, file, toolParams, headType = 'cnc') => ({
    id,
    name: id,
    headType,
    baseName: 'p.svg',
    toolPathFiles: [file],
    gcodeConfig: { jogSpeed: 1500, workSpeed: 300, plungeSpeed: 200 },
    toolParams,
    thumbnail: 'thumb'
});

const params = { size: { x: 400, y: 400 }, toolHead: 'standardCNCToolheadForSM2', origin: 'center', series: 'A400', metadata: {} };
const header = (filePath) => fs.readFileSync(filePath, 'utf8');

test('writeGcodeFile: per-run headers', async (t) => {
    await withTmpdir(async (dir) => {
        writeToolPathJson(dir, 'a.json', 10, 10);
        writeToolPathJson(dir, 'b.json', 20, 50);
        const first = await writeGcodeFile([toolPath('a', 'a.json', V)], { ...params, headType: 'cnc', thumbnail: 'thumb' });
        const second = await writeGcodeFile([toolPath('b', 'b.json', D)], { ...params, headType: 'cnc', thumbnail: 'thumb' });
        t.ok(header(first.filePath).includes(';estimated_time(s): 10'), 'first file time');
        t.ok(header(first.filePath).includes(';max_x(mm): 10'), 'first file bounding box');
        t.ok(header(second.filePath).includes(';estimated_time(s): 20'), 'second file time');
        t.ok(header(second.filePath).includes(';max_x(mm): 50'), 'second file bounding box');
        t.ok(header(second.filePath).includes(';thumbnail: thumb'), 'thumbnail in every file');
    });
    t.end();
});

test('generateGcodeFiles: one file per CNC tool run', async (t) => {
    await withTmpdir(async (dir) => {
        ['a.json', 'b.json', 'c.json'].forEach((f, i) => writeToolPathJson(dir, f, 10 * (i + 1), 10));
        const toolPaths = [toolPath('iso1', 'a.json', V), toolPath('iso2', 'b.json', V), toolPath('holes', 'c.json', D)];
        toolPaths.slice(1).forEach(tp => { delete tp.thumbnail; });
        const { files } = await generateGcodeFiles({ ...params, toolPaths });
        t.deepEqual(files.map(f => f.toolPathIds), [['iso1', 'iso2'], ['holes']], 'runs in list order');
        t.equal(files[0].gcodeFile.estimatedTime, 30, 'first file sums its run');
        t.ok(header(files[1].filePath).includes(';thumbnail: thumb'), 'project thumbnail also in later files');
    });
    t.end();
});

test('generateGcodeFiles: laser stays one file', async (t) => {
    await withTmpdir(async (dir) => {
        ['a.json', 'b.json'].forEach(f => writeToolPathJson(dir, f, 10, 10));
        const toolPaths = [toolPath('l1', 'a.json', V, 'laser'), toolPath('l2', 'b.json', D, 'laser')];
        const { files } = await generateGcodeFiles({ ...params, toolPaths });
        t.equal(files.length, 1, 'one file');
        t.deepEqual(files[0].toolPathIds, ['l1', 'l2'], 'all toolpaths');
    });
    t.end();
});

test('taskGcodeFiles: header parsed for every file', (t) => {
    const parsed = [];
    const parse = (filePath) => { parsed.push(filePath); return { ';header_type': 'cnc', file: filePath }; };
    const res = {
        gcodeFile: { name: 'a.cnc' },
        filePath: '/tmp/a.cnc',
        files: [
            { gcodeFile: { name: 'a.cnc' }, filePath: '/tmp/a.cnc', toolPathIds: ['t1'] },
            { gcodeFile: { name: 'b.cnc' }, filePath: '/tmp/b.cnc', toolPathIds: ['t2'] }
        ]
    };
    const { gcodeFile, gcodeFiles } = taskGcodeFiles(res, parse);
    t.deepEqual(gcodeFile, { name: 'a.cnc', header: { ';header_type': 'cnc', file: '/tmp/a.cnc' } }, 'primary file as today');
    t.deepEqual(gcodeFiles.map(f => [f.name, f.header.file, f.toolPathIds]), [['a.cnc', '/tmp/a.cnc', ['t1']], ['b.cnc', '/tmp/b.cnc', ['t2']]]);
    t.deepEqual(taskGcodeFiles({ gcodeFile: { name: 'x' }, filePath: '/x' }, parse).gcodeFiles.length, 1, 'result without files list');
    t.end();
});
