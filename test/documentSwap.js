import { test } from 'tape';
import {
    MODE_STATE_KEYS,
    PROJECT_META_KEYS,
    pickDocumentState,
    swapDocumentState,
    adoptSvgChildren,
} from '../src/app/flux/project/document-swap';
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
