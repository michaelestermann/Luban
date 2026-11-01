/**
 * Generated toolpath files and G-code stay byte-identical (content, in order) for a
 * fixed set of models: guards speed-ups of toolpath / G-code generation.
 * UPDATE_GOLDEN=1 rewrites the golden file (only for intended output changes).
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'tape';

import * as sendMessageModule from '../src/server/services/task-manager/utils/sendMessage';
import generateToolPath from '../src/server/services/task-manager/workers/generateToolPath';
import { generateGcodeFiles } from '../src/server/services/task-manager/workers/generateGcode';

const FIXTURES = path.join(__dirname, 'fixtures', 'toolpath-output');
const GOLDEN = path.join(FIXTURES, 'golden.json');

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

const model = (uploadName, positionX, positionY, width, height) => ({
    modelID: uploadName,
    visible: true,
    sourceType: 'svg',
    mode: 'vector',
    sourceWidth: width,
    sourceHeight: height,
    originalName: uploadName,
    uploadName,
    config: { 'stroke-width': '0.25', svgNodeName: 'image' },
    transformation: {
        positionX, positionY, positionZ: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1, width, height
    }
});

const CNC_CONFIG = {
    optimizePath: false,
    stepOver: 0.5,
    targetDepth: 2,
    stepDown: 1,
    safetyHeight: 1,
    stopHeight: 10,
    enableTab: true,
    tabWidth: 3,
    tabHeight: 1,
    tabSpace: 20,
    anchor: 'Center',
    jogSpeed: 1500,
    workSpeed: 200,
    plungeSpeed: 150,
    dwellTime: 5,
    toolType: 'flat',
    toolExtensionEnabled: false
};

const toolPath = (id, headType, gcodeConfig, toolParams, models) => ({
    id,
    headType,
    name: id,
    baseName: models[0].uploadName,
    type: 'vector',
    useLegacyEngine: false,
    visible: true,
    gcodeConfig,
    toolParams,
    materials: { isRotate: false, x: 400, y: 400, z: 400, diameter: 0 },
    models
});

const CNC_TOOLPATHS = [
    toolPath('drill', 'cnc', { ...CNC_CONFIG, pathType: 'drill', enableTab: false, stepDown: 0.8, targetDepth: 2 }, { toolDiameter: 0.8, toolAngle: 30, toolShaftDiameter: 3.175 }, [
        model('hole1.svg', 10, 6, 2, 2), model('hole2.svg', 20, 6, 2, 2), model('hole3.svg', 30, 6, 2, 2)
    ]),
    toolPath('outline', 'cnc', { ...CNC_CONFIG, pathType: 'path' }, { toolDiameter: 3.175, toolAngle: 30, toolShaftDiameter: 3.175 }, [
        model('outline.svg', 60, 40, 40, 30), model('triangle.svg', 120, 40, 20, 20)
    ])
];

const LASER_TOOLPATHS = [
    toolPath('laser', 'laser', {
        optimizePath: false,
        pathType: 'path',
        fillInterval: 0.25,
        jogSpeed: 3000,
        workSpeed: 140,
        plungeSpeed: 800,
        dwellTime: 5,
        fixedPowerEnabled: true,
        fixedPower: 50,
        multiPassEnabled: false,
        multiPasses: 2,
        multiPassDepth: 0.6,
        movementMode: 'greyscale-line',
        initialHeightOffset: 0,
        auxiliaryAirPump: false,
        halfDiodeMode: false,
        constantPowerMode: true
    }, {}, [model('triangle.svg', 50, 50, 20, 20), model('outline.svg', 100, 50, 40, 30)])
];

const generate = async (toolPaths, dir) => {
    const tasks = toolPaths.map(tp => ({
        taskId: tp.id,
        headType: tp.headType,
        visible: true,
        identifier: 'A350',
        data: tp.models.map(m => ({
            ...m,
            headType: tp.headType,
            transformation: { ...m.transformation },
            type: tp.type,
            useLegacyEngine: false,
            gcodeConfig: { ...tp.gcodeConfig },
            toolParams: { ...tp.toolParams },
            materials: { ...tp.materials }
        }))
    }));
    const messages = [];
    const previousSend = sendMessageModule.default;
    sendMessageModule.default = (m) => messages.push(m);
    try {
        await generateToolPath(tasks);
    } finally {
        sendMessageModule.default = previousSend;
    }
    const done = messages.find(m => m.status !== 'progress');
    if (!done || done.status !== 'complete') {
        throw new Error(`toolpath generation failed: ${JSON.stringify(done)}`);
    }
    const toolpathFiles = done.value.flatMap(r => r.filenames.map(f => sha(fs.readFileSync(path.join(dir, f), 'utf8'))));

    const { files } = await generateGcodeFiles({
        toolPaths: toolPaths.map(tp => ({ ...tp, toolPathFiles: done.value.find(r => r.taskId === tp.id).filenames, thumbnail: '' })),
        size: { x: 400, y: 400, z: 400 },
        toolHead: toolPaths[0].headType === 'cnc' ? 'standardCNCToolheadForSM2' : 'singleExtruderToolheadForSM2',
        origin: 'bottom-left',
        series: 'A350',
        metadata: {}
    });
    const gcode = files.map(f => sha(fs.readFileSync(f.filePath, 'utf8')
        // the header has the date and the version
        .replace(/^;Snapmaker Luban .*$/m, '')
        .replace(/^;\w{3} \w{3} \d+ \d+ \d+:\d+:\d+$/m, '')));
    return { toolpathFiles, gcode };
};

test('Toolpath and G-code output stays byte-identical for the fixture models', async (t) => {
    const previousTmpdir = process.env.Tmpdir;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolpath-golden-'));
    for (const f of fs.readdirSync(FIXTURES).filter(name => name.endsWith('.svg'))) {
        fs.copyFileSync(path.join(FIXTURES, f), path.join(dir, f));
    }
    process.env.Tmpdir = dir;
    try {
        const actual = {
            cnc: await generate(CNC_TOOLPATHS, dir),
            laser: await generate(LASER_TOOLPATHS, dir)
        };
        if (process.env.UPDATE_GOLDEN) {
            fs.writeFileSync(GOLDEN, `${JSON.stringify(actual, null, 4)}\n`);
            t.pass('golden file written');
        } else {
            const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
            t.deepEqual(actual.cnc.toolpathFiles, golden.cnc.toolpathFiles, 'CNC toolpath files (drill + engine)');
            t.deepEqual(actual.cnc.gcode, golden.cnc.gcode, 'CNC G-code');
            t.deepEqual(actual.laser.toolpathFiles, golden.laser.toolpathFiles, 'laser toolpath files');
            t.deepEqual(actual.laser.gcode, golden.laser.gcode, 'laser G-code');
        }
    } finally {
        process.env.Tmpdir = previousTmpdir;
    }
    t.end();
});
