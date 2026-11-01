import { test } from 'tape';
import {
    cleanProjectName,
    projectFileName,
    clampRectangleSize,
    clampCylinderSize,
    newProjectSize,
    rememberedSizeKey,
    lockingBlockWorkpieceSize,
    newProjectPages,
    machineSupportsRotary,
    PROJECT_NAME_MAX_LENGTH,
} from '../src/app/flux/project/new-project';
import {
    addDocument,
    createTabsState,
    documentDisplayName,
    parseSession,
    serializeSession,
} from '../src/app/flux/project/tabs-model';

const A400 = { x: 400, y: 400, z: 400 };

test('cleanProjectName: trims, collapses white space, caps the length', (t) => {
    t.equal(cleanProjectName('  Desk   top \t plate '), 'Desk top plate');
    t.equal(cleanProjectName(''), '');
    t.equal(cleanProjectName(undefined), '');
    t.equal(cleanProjectName(42), '');
    t.equal(cleanProjectName('x'.repeat(300)).length, PROJECT_NAME_MAX_LENGTH);
    t.end();
});

test('projectFileName: the name with the mode extension, safe for every file system', (t) => {
    t.equal(projectFileName('Desk plate', 'cnc'), 'Desk plate.snapcnc');
    t.equal(projectFileName('Sign', 'laser'), 'Sign.snaplzr');
    t.equal(projectFileName('Vase', 'printing'), 'Vase.snap3dp');
    t.equal(projectFileName('Sign.snaplzr', 'laser'), 'Sign.snaplzr', 'extension not added twice');
    t.equal(projectFileName('Sign.SNAPLZR', 'laser'), 'Sign.snaplzr', 'extension case-insensitive');
    t.equal(projectFileName('a/b:c*d?"e<f>g|h\\i', 'cnc'), 'a-b-c-d--e-f-g-h-i.snapcnc');
    t.equal(projectFileName('Box v2. ', 'cnc'), 'Box v2.snapcnc', 'trailing dots and spaces go');
    t.equal(projectFileName('Größe Ä', 'cnc'), 'Größe Ä.snapcnc', 'umlauts are kept');
    t.equal(projectFileName('con', 'cnc'), 'con-project.snapcnc', 'reserved Windows names');
    t.equal(projectFileName('   ', 'cnc'), null);
    t.equal(projectFileName('...', 'cnc'), null);
    t.equal(projectFileName('/', 'cnc'), null);
    t.equal(projectFileName(null, 'cnc'), null);
    t.end();
});

test('clampRectangleSize / clampCylinderSize: within the Job Setup minimum and the machine', (t) => {
    const fallback = { x: 400, y: 400, z: 10 };
    t.deepEqual(clampRectangleSize({ x: 120.04, y: 80, z: 18 }, A400, fallback), { x: 120, y: 80, z: 18 });
    t.deepEqual(clampRectangleSize({ x: 1, y: 5, z: 0 }, A400, fallback), { x: 2, y: 10, z: 0.1 });
    t.deepEqual(clampRectangleSize({ x: 900, y: 401, z: 999 }, A400, fallback), { x: 400, y: 400, z: 400 });
    t.deepEqual(clampRectangleSize({ x: NaN, y: 'a', z: undefined }, A400, fallback), fallback, 'no numbers → fallback');
    t.deepEqual(clampRectangleSize(null, A400, fallback), fallback);
    t.deepEqual(clampCylinderSize({ diameter: 60, length: 150 }, A400), { diameter: 60, length: 150 });
    t.deepEqual(clampCylinderSize({ diameter: 0, length: 900 }, A400), { diameter: 2, length: 400 });
    t.deepEqual(clampCylinderSize(undefined, A400), { diameter: 40, length: 75 });
    t.end();
});

test('newProjectSize: last used size of the mode and shape, else the 4.16 defaults', (t) => {
    t.deepEqual(newProjectSize('laser', false, A400), { x: 400, y: 400, z: 400 }, 'laser 3-axis: the work area');
    t.deepEqual(newProjectSize('cnc', false, A400), { x: 400, y: 400, z: 10 }, 'cnc 3-axis: the work area, 10 mm thick');
    t.deepEqual(newProjectSize('laser', true, A400), { diameter: 40, length: 75 }, '4-axis: 40 × 75');
    t.deepEqual(newProjectSize('cnc', false, A400, { x: 150, y: 100, z: 18 }), { x: 150, y: 100, z: 18 });
    t.deepEqual(newProjectSize('cnc', false, { x: 320, y: 350, z: 330 }, { x: 400, y: 100, z: 18 }), { x: 320, y: 100, z: 18 },
        'a remembered size larger than the machine is clamped');
    t.deepEqual(newProjectSize('cnc', true, A400, { diameter: 50, length: 120 }), { diameter: 50, length: 120 });
    t.deepEqual(newProjectSize('cnc', true, A400, 'garbage'), { diameter: 40, length: 75 });
    t.end();
});

test('rememberedSizeKey: per mode and shape', (t) => {
    t.equal(rememberedSizeKey('cnc', false), 'newProject.cnc.rectangle');
    t.equal(rememberedSizeKey('laser', true), 'newProject.laser.cylinder');
    t.end();
});

test('lockingBlockWorkpieceSize: Artisan locking block positions A and B', (t) => {
    t.deepEqual(lockingBlockWorkpieceSize('A'), { x: 375, y: 395 });
    t.deepEqual(lockingBlockWorkpieceSize('B'), { x: 290, y: 305 });
    t.end();
});

test('newProjectPages: the left column of step 2', (t) => {
    t.deepEqual(newProjectPages('laser', true), ['blank', 'blank-4axis', 'open', 'cases', 'recent']);
    t.deepEqual(newProjectPages('cnc', false), ['blank', 'open', 'cases', 'recent']);
    t.deepEqual(newProjectPages('printing', true), ['blank', 'open', 'cases', 'recent'], 'printing has no 4-axis');
    t.end();
});

test('machineSupportsRotary: all but the Snapmaker Original', (t) => {
    t.equal(machineSupportsRotary('Snapmaker 2.0 A400'), true);
    t.equal(machineSupportsRotary('A350'), true);
    t.equal(machineSupportsRotary('Original'), false);
    t.equal(machineSupportsRotary('Original Long Z-axis'), false);
    t.equal(machineSupportsRotary(null), true);
    t.end();
});

const doc = (patch) => ({
    id: 'd1',
    headType: 'cnc',
    openedFile: null,
    untitledIndex: 2,
    unSaved: false,
    loaded: true,
    source: 'live',
    isRotate: false,
    machineSeries: null,
    machineToolHead: null,
    status: 'design',
    lastActiveAt: 0,
    ...patch,
});

test('documentDisplayName: an untitled document with a project name shows that name', (t) => {
    t.equal(documentDisplayName(doc({ projectName: 'Desk plate' }), 'Untitled'), 'Desk plate');
    t.equal(documentDisplayName(doc({ projectName: '' }), 'Untitled'), 'Untitled 2');
    t.equal(documentDisplayName(doc({ projectName: 'Desk plate', openedFile: { name: 'desk.snapcnc', path: 'C:/desk.snapcnc' } }), 'Untitled'),
        'desk.snapcnc', 'a saved document shows its file name');
    t.end();
});

test('session: the project name of an untitled document is stored and restored', (t) => {
    const s = addDocument(createTabsState(), doc({ projectName: 'Desk plate' }));
    const m = parseSession(serializeSession(s));
    t.equal(m.documents[0].projectName, 'Desk plate');
    const without = parseSession(serializeSession(addDocument(createTabsState(), doc({}))));
    t.equal(without.documents[0].projectName, undefined, 'no name, no key');
    const raw = JSON.parse(serializeSession(s));
    raw.documents[0].projectName = 42;
    t.equal(parseSession(raw).documents[0].projectName, undefined, 'a name that is no string is dropped');
    t.end();
});
