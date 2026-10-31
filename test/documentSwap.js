import { test } from 'tape';
import {
    MODE_STATE_KEYS,
    PROJECT_META_KEYS,
    pickDocumentState,
    swapDocumentState,
    adoptSvgChildren,
    planActivation,
    documentStatusOf,
    routeAutosaveResult,
    isHeadBusy,
    closedDocumentReset,
} from '../src/app/flux/project/document-swap';
import { addDocument, activateTab, createTabsState } from '../src/app/flux/project/tabs-model';
import { documentStore } from '../src/app/flux/project/document-store';

const laserSlice = () => ({
    modelGroup: { name: 'mg' },
    toolPathGroup: { name: 'tpg' },
    SVGActions: { name: 'svg' },
    history: { name: 'h' },
    gcodeFile: { name: 'g.nc' },
    page: 'editor',
    materials: { isRotate: false },
    scale: 2,
    target: { x: 1 },
    contentGroup: { name: 'cg' },
    toolDefinitions: [1, 2],
    progressStatesManager: { name: 'psm' },
    initFlag: true,
    enableShortcut: true,
});

test('laser document state keeps modelGroup, toolPathGroup, SVGActions, history, gcodeFile, page, materials and drops contentGroup, toolDefinitions, progressStatesManager', (t) => {
    const slice = laserSlice();
    const d = pickDocumentState(slice, 'laser');
    for (const k of ['modelGroup', 'toolPathGroup', 'SVGActions', 'history', 'gcodeFile', 'page', 'materials', 'scale', 'target']) {
        t.ok(k in d, `keeps ${k}`);
        t.equal(d[k], slice[k], `${k} by reference`);
    }
    for (const k of ['contentGroup', 'toolDefinitions', 'progressStatesManager', 'initFlag', 'enableShortcut']) {
        t.notOk(k in d, `drops ${k}`);
    }
    t.deepEqual(MODE_STATE_KEYS.cnc, MODE_STATE_KEYS.laser, 'cnc uses the same mode keys');
    t.end();
});

test('printing document state keeps modelGroup, gcodeLineGroup, history, activePresetIds, gcodeFile and drops qualityDefinitions, materialDefinitions, progressStatesManager', (t) => {
    const slice = {
        modelGroup: {},
        gcodeLineGroup: {},
        history: {},
        activePresetIds: { left: 'q' },
        gcodeFile: null,
        qualityDefinitions: [],
        materialDefinitions: [],
        progressStatesManager: {},
        defaultDefinitions: [],
        showPrintingManager: false,
    };
    const d = pickDocumentState(slice, 'printing');
    t.deepEqual(Object.keys(d).sort(), ['activePresetIds', 'gcodeFile', 'gcodeLineGroup', 'history', 'modelGroup']);
    t.end();
});

test('swapDocumentState returns the outgoing doc and sets missing incoming keys to undefined', (t) => {
    const slice = laserSlice();
    const incoming = { modelGroup: { name: 'mg2' }, page: 'process', extraKey: 7 };
    const { outgoing, patch } = swapDocumentState(slice, incoming, 'laser');
    t.equal(outgoing.modelGroup, slice.modelGroup, 'outgoing holds the current doc');
    t.notOk('contentGroup' in outgoing, 'outgoing has no mode keys');
    t.equal(patch.modelGroup, incoming.modelGroup);
    t.equal(patch.page, 'process');
    t.ok('toolPathGroup' in patch, 'absent incoming key is in the patch');
    t.equal(patch.toolPathGroup, undefined, '... set to undefined');
    t.equal(patch.extraKey, 7, 'extra document keys of incoming are applied');
    t.notOk('contentGroup' in patch, 'mode keys are never patched');
    t.notOk('toolDefinitions' in patch);
    const { patch: p2 } = swapDocumentState(slice, { contentGroup: 1 }, 'laser');
    t.notOk('contentGroup' in p2, 'mode keys in incoming are ignored');
    t.end();
});

test('PROJECT_META_KEYS lists the project meta of a document', (t) => {
    t.deepEqual(PROJECT_META_KEYS, ['openedFile', 'unSaved', 'targetFile', 'content', 'initState', 'findLastEnvironment']);
    t.end();
});

const fakeGroup = (children = []) => {
    const g = { childNodes: [] };
    g.appendChild = (n) => {
        // like the DOM: a node has one parent
        if (n.parent) {
            const i = n.parent.childNodes.indexOf(n);
            n.parent.childNodes.splice(i, 1);
        }
        n.parent = g;
        g.childNodes.push(n);
        return n;
    };
    children.forEach((c) => g.appendChild(c));
    return g;
};

test('adoptSvgChildren moves children in order and returns the count', (t) => {
    const a = { id: 'a' };
    const b = { id: 'b' };
    const bg = { id: 'bg' };
    const from = { group: fakeGroup([a, b]), backgroundGroup: fakeGroup([bg]) };
    const to = { group: fakeGroup(), backgroundGroup: fakeGroup() };
    t.equal(adoptSvgChildren(from, to), 3);
    t.deepEqual(to.group.childNodes.map((n) => n.id), ['a', 'b']);
    t.deepEqual(to.backgroundGroup.childNodes.map((n) => n.id), ['bg']);
    t.equal(from.group.childNodes.length, 0);
    t.equal(from.backgroundGroup.childNodes.length, 0);
    t.end();
});

test('adoptSvgChildren is a no-op for null or the same group', (t) => {
    const to = { group: fakeGroup([{ id: 'x' }]), backgroundGroup: fakeGroup() };
    t.equal(adoptSvgChildren(null, to), 0);
    t.equal(adoptSvgChildren(to, to), 0);
    t.equal(to.group.childNodes.length, 1);
    t.end();
});

test('documentStore parks, takes and patches documents', (t) => {
    const p = { slice: { a: 1 }, projectMeta: { unSaved: false }, selectedModelIDs: ['m1'] };
    documentStore.park('d1', p);
    t.equal(documentStore.peek('d1'), p);
    t.deepEqual(documentStore.ids(), ['d1']);
    documentStore.patchProjectMeta('d1', { unSaved: true });
    t.equal(documentStore.peek('d1').projectMeta.unSaved, true);
    documentStore.patchProjectMeta('nope', { unSaved: true });
    t.equal(documentStore.take('d1').slice.a, 1);
    t.equal(documentStore.peek('d1'), undefined, 'take removes');
    documentStore.park('d2', p);
    documentStore.delete('d2');
    t.deepEqual(documentStore.ids(), []);
    t.end();
});

test('documentStore editor-ready promises resolve on markEditorReady, also when marked first', async (t) => {
    let resolved = false;
    const w = documentStore.whenEditorReady('e1').then(() => { resolved = true; });
    await Promise.resolve();
    t.notOk(resolved, 'pending before mark');
    documentStore.markEditorReady('e1');
    await w;
    t.ok(resolved, 'resolved after mark');
    documentStore.markEditorReady('e2');
    await documentStore.whenEditorReady('e2');
    t.pass('already-ready doc resolves at once');
    t.end();
});

test('documentStore lastAutosave waits for the tracked autosave and never rejects', async (t) => {
    let done = false;
    let finish;
    const p = new Promise((resolve) => { finish = resolve; }).then(() => { done = true; });
    documentStore.trackAutosave('a1', p);
    const last = documentStore.lastAutosave('a1');
    finish();
    await last;
    t.ok(done, 'waited');
    documentStore.trackAutosave('a2', Promise.reject(new Error('x')));
    await documentStore.lastAutosave('a2');
    t.pass('a failed autosave does not reject');
    await documentStore.lastAutosave('none');
    t.pass('unknown id resolves');
    t.end();
});

const meta = (id, headType, extra = {}) => ({
    id,
    headType,
    openedFile: null,
    untitledIndex: 1,
    unSaved: false,
    loaded: true,
    source: 'live',
    isRotate: false,
    machineSeries: null,
    machineToolHead: null,
    status: 'design',
    lastActiveAt: 0,
    ...extra,
});

// A (cnc, live), B (cnc, parked), L (laser, live), U (cnc, not loaded)
const tabsWithDocs = () => {
    let s = createTabsState();
    for (const m of [meta('A', 'cnc'), meta('B', 'cnc'), meta('L', 'laser'), meta('U', 'cnc', { loaded: false })]) {
        s = addDocument(s, m);
    }
    s = activateTab(s, 'L', 1);
    s = activateTab(s, 'A', 2);
    return s;
};

test('planActivation: live doc of another head → live (no park)', (t) => {
    const s = tabsWithDocs();
    t.deepEqual(planActivation(s, 'L', { parked: ['B'], busyHeads: [] }), { kind: 'live' });
    t.deepEqual(planActivation(s, 'A', { parked: ['B'], busyHeads: [] }), { kind: 'noop' }, 'the active tab → noop');
    t.end();
});

test('planActivation: parked doc while the slice holds another doc → swap with parkId', (t) => {
    const s = tabsWithDocs();
    t.deepEqual(planActivation(s, 'B', { parked: ['B'], busyHeads: [] }), { kind: 'swap', parkId: 'A' });
    t.end();
});

test('planActivation: unloaded doc → load', (t) => {
    const s = tabsWithDocs();
    t.deepEqual(planActivation(s, 'U', { parked: ['B'], busyHeads: [] }), { kind: 'load', parkId: 'A' });
    t.end();
});

test('planActivation blocks same-head swap while busy', (t) => {
    const s = tabsWithDocs();
    t.deepEqual(planActivation(s, 'B', { parked: ['B'], busyHeads: ['cnc'] }), { kind: 'swap', parkId: 'A', blockedBy: 'cnc' });
    t.deepEqual(planActivation(s, 'U', { parked: ['B'], busyHeads: ['cnc'] }), { kind: 'load', parkId: 'A', blockedBy: 'cnc' });
    t.end();
});

test('planActivation does not block a cross-head live switch', (t) => {
    const s = tabsWithDocs();
    t.deepEqual(planActivation(s, 'L', { parked: ['B'], busyHeads: ['cnc', 'laser'] }), { kind: 'live' });
    t.end();
});

test('planActivation: home and workspace → route', (t) => {
    const s = tabsWithDocs();
    t.deepEqual(planActivation(s, 'home', { parked: [], busyHeads: ['cnc'] }), { kind: 'route' });
    t.deepEqual(planActivation(s, 'workspace', { parked: [], busyHeads: [] }), { kind: 'route' });
    t.deepEqual(planActivation(s, 'nope', { parked: [], busyHeads: [] }), { kind: 'noop' }, 'unknown id → noop');
    t.end();
});

test('planActivation: a parked doc of a head without live doc swaps without parkId', (t) => {
    let s = createTabsState();
    s = addDocument(s, meta('P', 'printing'));
    t.deepEqual(planActivation(s, 'P', { parked: ['P'], busyHeads: [] }), { kind: 'swap' });
    t.end();
});

test('documentStatusOf: sliced / gcode-ready / design', (t) => {
    t.equal(documentStatusOf({ gcodeFile: { name: 'a.gcode' } }, 'printing'), 'sliced');
    t.equal(documentStatusOf({ gcodeFile: null }, 'printing'), 'design');
    t.equal(documentStatusOf({ gcodeFile: { name: 'a.nc' }, isChangedAfterGcodeGenerating: false }, 'cnc'), 'gcode-ready');
    t.equal(documentStatusOf({ gcodeFile: { name: 'a.nc' }, isChangedAfterGcodeGenerating: true }, 'laser'), 'design');
    t.equal(documentStatusOf({ gcodeFile: null, isChangedAfterGcodeGenerating: false }, 'laser'), 'design');
    t.equal(documentStatusOf(undefined, 'laser'), 'design');
    t.end();
});

test('autosave result is routed to the doc it started for', (t) => {
    t.equal(routeAutosaveResult('A', 'A'), 'slice', 'still live → slice');
    t.equal(routeAutosaveResult('B', 'A'), 'parked', 'swapped meanwhile → parked doc A');
    t.equal(routeAutosaveResult(undefined, undefined), 'slice', 'no registry (4.16) → slice');
    t.equal(routeAutosaveResult(undefined, 'A'), 'parked', 'doc no longer live → parked');
    t.end();
});

test('isHeadBusy: progress, G-code generation, running toolpath, project opening, pending load', (t) => {
    const idle = { inProgress: false, isGcodeGenerating: false, progressStatesManager: { inProgress: () => false }, toolPathGroup: { toolPaths: [{ status: 'success' }] } };
    const state = (cnc, opening = false) => ({ cnc, project: { general: { opening } } });
    t.equal(isHeadBusy(state(idle), 'cnc'), false, 'idle');
    t.equal(isHeadBusy(state({ ...idle, inProgress: true }), 'cnc'), true, 'inProgress');
    t.equal(isHeadBusy(state({ ...idle, isGcodeGenerating: true }), 'cnc'), true, 'G-code');
    t.equal(isHeadBusy(state({ ...idle, progressStatesManager: { inProgress: () => true } }), 'cnc'), true, 'progress manager running');
    t.equal(isHeadBusy(state({ ...idle, toolPathGroup: { toolPaths: [{ status: 'running' }] } }), 'cnc'), true, 'toolpath running');
    t.equal(isHeadBusy(state(idle, true), 'cnc'), true, 'project opening');
    t.equal(isHeadBusy(state(idle), 'cnc', ['cnc']), true, 'pending load of that head');
    t.equal(isHeadBusy(state(idle), 'cnc', ['laser']), false, 'pending load of another head');
    t.equal(isHeadBusy({ project: { general: {} } }, 'laser'), false, 'no slice');
    const printing = (stage) => ({ printing: { stage, inProgress: false, progressStatesManager: { inProgress: () => true } }, project: { general: {} } });
    t.equal(isHeadBusy(printing(24), 'printing'), false, 'printing: a stuck progress manager after a load does not count, stage "load complete"');
    t.equal(isHeadBusy(printing(27), 'printing'), true, 'printing: slicing');
    t.equal(isHeadBusy(printing(23), 'printing'), true, 'printing: loading models');
    const previewing = (progress) => ({ printing: { stage: 30, progress, inProgress: false }, project: { general: {} } });
    t.equal(isHeadBusy(previewing(0.6), 'printing'), true, 'printing: G-code preview running');
    t.equal(isHeadBusy(previewing(1), 'printing'), false, 'printing: preview done (the stage stays "previewing" after slicing)');
    t.end();
});

test('closedDocumentReset: the slice of a closed last document forgets its G-code', (t) => {
    const initial = {
        modelGroup: { name: 'initial mg' },
        toolPathGroup: {},
        SVGActions: {},
        history: {},
        gcodeFile: null,
        gcodeFiles: [],
        isChangedAfterGcodeGenerating: true,
        page: 'editor',
        scale: 1,
        materials: { isRotate: false },
    };
    const cnc = closedDocumentReset(initial, 'cnc');
    t.deepEqual(cnc.gcodeFiles, [], 'G-code files emptied');
    t.equal(cnc.gcodeFile, null, 'no G-code file');
    t.equal(cnc.page, 'editor', 'other document keys back to initial');
    t.notOk('modelGroup' in cnc || 'toolPathGroup' in cnc || 'SVGActions' in cnc || 'history' in cnc, 'live objects stay (emptied by closeProject)');
    t.notEqual(cnc.gcodeFiles, initial.gcodeFiles, 'arrays are copies');
    t.deepEqual(documentStatusOf({ ...initial, ...cnc }, 'cnc'), 'design', 'a project opened next is "Design"');
    const printing = closedDocumentReset({ stage: 0, progress: 0, gcodeFile: null, gcodeLine: null, displayedType: 'model', activePresetIds: { left: 'x' }, modelGroup: {} }, 'printing');
    t.deepEqual(printing, { stage: 0, progress: 0, gcodeFile: null, gcodeLine: null, displayedType: 'model' }, 'printing: only the slice result keys');
    t.end();
});
