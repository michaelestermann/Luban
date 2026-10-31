import { test } from 'tape';
import {
    HOME_TAB,
    WORKSPACE_TAB,
    createTabsState,
    addDocument,
    activateTab,
    removeDocument,
    nextTabAfterClose,
    updateDocument,
    findDocumentByPath,
    nextUntitledIndex,
    groupDocumentsByMode,
    tabIdForPath,
    pathForTab,
    documentDisplayName,
    serializeSession,
    parseSession,
    planRestore,
    pickDocumentToUnload,
    filterRecentByMode,
    projectHeadTypeOf,
    collectUnsavedDocuments,
    planLegacyMigration,
    restoreEntryPoint,
    unloadedMeta,
} from '../src/app/flux/project/tabs-model';

const doc = (id, headType = 'laser', extra = {}) => ({
    id,
    headType,
    openedFile: null,
    untitledIndex: 0,
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

const withDocs = (...docs) => docs.reduce((s, d) => addDocument(s, d), createTabsState());

test('createTabsState starts on home with no documents', (t) => {
    const s = createTabsState();
    t.deepEqual(s.order, []);
    t.deepEqual(s.documents, {});
    t.equal(s.activeTabId, HOME_TAB);
    t.deepEqual(s.activeDocByHead, {});
    t.equal(s.workspaceNewCount, 0);
    t.end();
});

test('addDocument appends; activateTab sets activeDocByHead and lastActiveAt', (t) => {
    let s = withDocs(doc('a'), doc('b'));
    t.deepEqual(s.order, ['a', 'b'], 'appended in order');
    t.equal(s.activeTabId, HOME_TAB, 'adding does not activate');
    s = activateTab(s, 'b', 1234);
    t.equal(s.activeDocByHead.laser, 'b');
    t.equal(s.activeTabId, 'b');
    t.equal(s.documents.b.lastActiveAt, 1234);
    t.equal(s.documents.a.lastActiveAt, 0, 'other doc untouched');
    const s2 = activateTab(s, HOME_TAB, 99);
    t.equal(s2.activeTabId, HOME_TAB);
    t.equal(s2.activeDocByHead.laser, 'b', 'home keeps the live doc of each mode');
    t.equal(activateTab(s, 'nope', 1), s, 'unknown tab is ignored');
    t.end();
});

test('addDocument with an existing id replaces the meta and keeps the order', (t) => {
    let s = withDocs(doc('a'), doc('b'));
    s = addDocument(s, doc('a', 'laser', { unSaved: true }));
    t.deepEqual(s.order, ['a', 'b']);
    t.equal(s.documents.a.unSaved, true);
    t.end();
});

test('closing the active tab activates the right neighbour, else the left, else home', (t) => {
    let s = withDocs(doc('a'), doc('b'), doc('c'));
    s = activateTab(s, 'b', 1);
    t.equal(nextTabAfterClose(s, 'b'), 'c', 'right neighbour');
    s = activateTab(s, 'c', 2);
    t.equal(nextTabAfterClose(s, 'c'), 'b', 'left neighbour');
    let single = withDocs(doc('a'));
    single = activateTab(single, 'a', 1);
    t.equal(nextTabAfterClose(single, 'a'), HOME_TAB, 'home');
    const removed = removeDocument(activateTab(withDocs(doc('a'), doc('b'), doc('c')), 'b', 1), 'b');
    t.deepEqual(removed.order, ['a', 'c']);
    t.equal(removed.activeTabId, 'c', 'removeDocument activates the next tab');
    t.equal(removed.documents.b, undefined);
    t.end();
});

test('closing an inactive tab keeps the active tab', (t) => {
    let s = withDocs(doc('a'), doc('b'), doc('c'));
    s = activateTab(s, 'a', 1);
    t.equal(nextTabAfterClose(s, 'c'), 'a');
    const r = removeDocument(s, 'c');
    t.equal(r.activeTabId, 'a');
    const w = removeDocument(activateTab(s, WORKSPACE_TAB, 2), 'a');
    t.equal(w.activeTabId, WORKSPACE_TAB, 'workspace stays active');
    t.end();
});

test('removeDocument clears activeDocByHead when it pointed to the closed doc', (t) => {
    let s = withDocs(doc('a'), doc('b'), doc('p', 'printing'));
    s = activateTab(s, 'p', 1);
    s = activateTab(s, 'a', 2);
    s = activateTab(s, 'b', 3);
    s = activateTab(s, HOME_TAB, 4);
    const r = removeDocument(s, 'b');
    t.equal(r.activeDocByHead.laser, undefined, 'cleared');
    t.ok(!('laser' in r.activeDocByHead), 'key deleted');
    t.equal(r.activeDocByHead.printing, 'p', 'other head untouched');
    const r2 = removeDocument(s, 'a');
    t.equal(r2.activeDocByHead.laser, 'b', 'not pointing → kept');
    t.equal(removeDocument(s, 'zzz'), s, 'unknown id is a no-op');
    t.end();
});

test('activating the next doc after close sets activeDocByHead of its head', (t) => {
    let s = withDocs(doc('a'), doc('b'));
    s = activateTab(s, 'b', 1);
    const r = removeDocument(s, 'b');
    t.equal(r.activeTabId, 'a');
    t.equal(r.activeDocByHead.laser, 'a');
    t.end();
});

test('updateDocument patches one document', (t) => {
    const s = withDocs(doc('a'), doc('b'));
    const r = updateDocument(s, 'a', { unSaved: true, status: 'gcode-ready' });
    t.equal(r.documents.a.unSaved, true);
    t.equal(r.documents.a.status, 'gcode-ready');
    t.equal(r.documents.a.id, 'a', 'id kept');
    t.equal(r.documents.b, s.documents.b, 'other doc same reference');
    t.equal(updateDocument(s, 'nope', { unSaved: true }), s, 'unknown id is a no-op');
    t.equal(updateDocument(r, 'a', { id: 'x' }).documents.a.id, 'a', 'id cannot change');
    t.end();
});

test('findDocumentByPath ignores case and slash direction', (t) => {
    const s = withDocs(
        doc('a', 'cnc', { openedFile: { name: 'PCB.snapcnc', path: 'C:\\X\\PCB.snapcnc' } }),
        doc('b', 'laser'),
    );
    t.equal(findDocumentByPath(s, 'c:/x/pcb.snapcnc').id, 'a');
    t.equal(findDocumentByPath(s, 'C:\\X\\.\\sub\\..\\PCB.snapcnc').id, 'a', 'normalized');
    t.equal(findDocumentByPath(s, 'c:/x/other.snapcnc'), null);
    t.equal(findDocumentByPath(s, ''), null);
    t.equal(findDocumentByPath(s, null), null);
    t.end();
});

test('nextUntitledIndex fills the lowest gap per head type', (t) => {
    const s = withDocs(
        doc('a', 'laser', { untitledIndex: 1 }),
        doc('b', 'laser', { untitledIndex: 3 }),
        doc('c', 'laser', { untitledIndex: 2, openedFile: { name: 'x.snaplzr', path: '/x.snaplzr' } }),
    );
    t.equal(nextUntitledIndex(s, 'laser'), 2, 'saved doc does not take an untitled slot');
    t.equal(nextUntitledIndex(s, 'cnc'), 1);
    t.equal(nextUntitledIndex(createTabsState(), 'printing'), 1);
    t.end();
});

test('groupDocumentsByMode orders printing, laser, cnc and drops empty groups', (t) => {
    const s = withDocs(doc('c1', 'cnc'), doc('l1', 'laser'), doc('c2', 'cnc'), doc('p1', 'printing'));
    const g = groupDocumentsByMode(s);
    t.deepEqual(g.map((x) => x.headType), ['printing', 'laser', 'cnc']);
    t.deepEqual(g[2].documents.map((d) => d.id), ['c1', 'c2']);
    const g2 = groupDocumentsByMode(withDocs(doc('c1', 'cnc')));
    t.deepEqual(g2.map((x) => x.headType), ['cnc']);
    t.deepEqual(groupDocumentsByMode(createTabsState()), []);
    t.end();
});

test('tabIdForPath maps /, /workspace and editor routes', (t) => {
    let s = withDocs(doc('a', 'laser'));
    s = activateTab(s, 'a', 1);
    t.equal(tabIdForPath(s, '/'), HOME_TAB);
    t.equal(tabIdForPath(s, ''), HOME_TAB);
    t.equal(tabIdForPath(s, '/workspace'), WORKSPACE_TAB);
    t.equal(tabIdForPath(s, '/laser'), 'a');
    t.equal(tabIdForPath(s, '/cnc'), null, 'no cnc doc');
    t.equal(tabIdForPath(s, '/settings'), null);
    t.equal(pathForTab(s, HOME_TAB), '/');
    t.equal(pathForTab(s, WORKSPACE_TAB), '/workspace');
    t.equal(pathForTab(s, 'a'), '/laser');
    t.equal(pathForTab(s, 'nope'), '/');
    t.end();
});

test('activating workspace resets workspaceNewCount', (t) => {
    let s = createTabsState();
    s = { ...s, workspaceNewCount: 3 };
    s = activateTab(s, WORKSPACE_TAB, 1);
    t.equal(s.workspaceNewCount, 0);
    t.equal(s.activeTabId, WORKSPACE_TAB);
    t.end();
});

test('documentDisplayName uses the file name, else "<label> n"', (t) => {
    t.equal(documentDisplayName(doc('a', 'cnc', { openedFile: { name: 'PCB.snapcnc', path: '/PCB.snapcnc' } }), 'Untitled'), 'PCB.snapcnc');
    t.equal(documentDisplayName(doc('a', 'cnc', { untitledIndex: 2 }), 'Untitled'), 'Untitled 2');
    t.end();
});

test('session round trip', (t) => {
    let s = withDocs(
        doc('a', 'cnc', { openedFile: { name: 'PCB.snapcnc', path: 'C:/PCB.snapcnc' }, machineSeries: 'A350', machineToolHead: { cncToolhead: 'x' } }),
        doc('b', 'laser', { untitledIndex: 1, unSaved: true, isRotate: true }),
    );
    s = activateTab(s, 'b', 5);
    const m = parseSession(JSON.parse(serializeSession(s)));
    t.equal(m.version, 1);
    t.deepEqual(m.order, ['a', 'b']);
    t.equal(m.activeTabId, 'b');
    t.deepEqual(m.documents[0], {
        id: 'a',
        headType: 'cnc',
        openedFile: { name: 'PCB.snapcnc', path: 'C:/PCB.snapcnc' },
        untitledIndex: 0,
        unSaved: false,
        isRotate: false,
        machineSeries: 'A350',
        machineToolHead: { cncToolhead: 'x' },
    });
    t.equal(m.documents[1].unSaved, true);
    t.equal(m.documents[1].isRotate, true);
    t.ok(parseSession(serializeSession(s)), 'accepts the JSON string too');
    t.end();
});

test('parseSession returns null for garbage, null, version 2', (t) => {
    t.equal(parseSession(null), null);
    t.equal(parseSession(undefined), null);
    t.equal(parseSession('not json {'), null);
    t.equal(parseSession(42), null);
    t.equal(parseSession({ version: 2, order: [], activeTabId: 'home', documents: [] }), null);
    t.equal(parseSession({ version: 1, order: 'x', activeTabId: 'home', documents: [] }), null);
    t.end();
});

test('parseSession drops documents with unknown headType', (t) => {
    const m = parseSession({
        version: 1,
        order: ['a', 'b', 'c'],
        activeTabId: 'b',
        documents: [
            { id: 'a', headType: 'cnc', openedFile: null, untitledIndex: 1, unSaved: true, isRotate: false, machineSeries: null, machineToolHead: null },
            { id: 'b', headType: '3dp', openedFile: null, untitledIndex: 1 },
            { headType: 'laser' },
        ],
    });
    t.deepEqual(m.documents.map((d) => d.id), ['a']);
    t.deepEqual(m.order, ['a'], 'order keeps only known docs');
    t.equal(m.activeTabId, HOME_TAB, 'active doc dropped → home');
    t.end();
});

test('planRestore drops documents without file or env', (t) => {
    const m = {
        version: 1,
        order: ['u', 's', 'n', 'x'],
        activeTabId: 'n',
        documents: [
            { id: 'u', headType: 'laser', openedFile: null, untitledIndex: 1, unSaved: true, isRotate: false, machineSeries: null, machineToolHead: null },
            { id: 's', headType: 'cnc', openedFile: { name: 's.snapcnc', path: '/f/s.snapcnc' }, untitledIndex: 0, unSaved: false, isRotate: false, machineSeries: null, machineToolHead: null },
            { id: 'n', headType: 'cnc', openedFile: { name: 'gone.snapcnc', path: '/f/gone.snapcnc' }, untitledIndex: 0, unSaved: false, isRotate: false, machineSeries: null, machineToolHead: null },
            { id: 'x', headType: 'cnc', openedFile: { name: 's2.snapcnc', path: '/f/s2.snapcnc' }, untitledIndex: 0, unSaved: true, isRotate: false, machineSeries: null, machineToolHead: null },
        ],
    };
    const r = planRestore(m, ['u', 'x'], (p) => p === '/f/s.snapcnc');
    t.deepEqual(r.state.order, ['u', 's', 'x']);
    t.equal(r.state.documents.u.source, 'env');
    t.equal(r.state.documents.s.source, 'file');
    t.equal(r.state.documents.x.source, 'env', 'unsaved with env wins over a missing file');
    t.deepEqual(r.dropped.map((d) => d.id), ['n']);
    t.deepEqual(r.autosaved.map((d) => d.id), ['u', 'x']);
    t.ok(Object.values(r.state.documents).every((d) => d.loaded === false), 'nothing loaded');
    t.equal(r.state.activeTabId, HOME_TAB, 'dropped active → home');

    const r2 = planRestore({ ...m, activeTabId: 's' }, ['u'], () => true);
    t.equal(r2.state.activeTabId, 's');
    t.equal(r2.state.activeDocByHead.cnc, 's', 'active doc is live for its head');
    t.equal(r2.state.documents.x.source, 'file', 'unsaved without env falls back to the file');
    t.equal(planRestore({ ...m, activeTabId: WORKSPACE_TAB }, [], () => true).state.activeTabId, WORKSPACE_TAB);
    t.end();
});

test('pickDocumentToUnload returns the least recently used non-live loaded doc, null below threshold', (t) => {
    const s = withDocs(
        doc('a', 'laser', { lastActiveAt: 10 }),
        doc('b', 'laser', { lastActiveAt: 5 }),
        doc('c', 'laser', { lastActiveAt: 1, loaded: false }),
        doc('d', 'cnc', { lastActiveAt: 2 }),
    );
    t.equal(pickDocumentToUnload(s, ['d'], 0.9), 'b');
    t.equal(pickDocumentToUnload(s, [], 0.9), 'd');
    t.equal(pickDocumentToUnload(s, ['a', 'b', 'd'], 0.9), null, 'only live or unloaded left');
    t.equal(pickDocumentToUnload(s, [], 0.5), null, 'below default threshold');
    t.equal(pickDocumentToUnload(s, ['d'], 0.5, 0.4), 'b', 'custom threshold');
    t.end();
});

test('pathForTab and tabIdForPath are inverse for home, workspace and live docs', (t) => {
    let s = withDocs(doc('a', 'cnc'), doc('b', 'laser'), doc('c', 'cnc'));
    s = activateTab(s, 'a', 1);
    s = activateTab(s, 'b', 2);
    for (const tabId of [HOME_TAB, WORKSPACE_TAB, 'a', 'b']) {
        t.equal(tabIdForPath(s, pathForTab(s, tabId)), tabId, `${tabId} round trip`);
    }
    for (const p of ['/', '/workspace', '/cnc', '/laser']) {
        t.equal(pathForTab(s, tabIdForPath(s, p)), p, `${p} round trip`);
    }
    // a parked doc maps to its head route, which shows the live doc of that head
    t.equal(pathForTab(s, 'c'), '/cnc', 'parked doc → head route');
    t.equal(tabIdForPath(s, '/cnc'), 'a', 'head route → live doc');
    t.equal(tabIdForPath(s, '/printing'), null, 'no live printing doc');
    t.end();
});

test('filterRecentByMode keeps only the extension of the mode and marks open files', (t) => {
    let s = withDocs(doc('a', 'cnc', { openedFile: { name: 'pcb-a.snapcnc', path: 'C:/Fx/pcb-a.snapcnc' } }));
    s = activateTab(s, 'a', 1);
    const recent = [
        { name: 'pcb-a.snapcnc', path: 'c:\\fx\\PCB-A.snapcnc' },
        { name: 'ruler.snaplzr', path: 'C:/Fx/ruler.snaplzr' },
        { name: 'Board.SNAPCNC', path: 'C:/Fx/Board.SNAPCNC' },
        { name: 'p1.snap3dp', path: 'C:/Fx/p1.snap3dp' },
        { name: 'job.gcode', path: 'C:/Fx/job.gcode' },
        null,
        { name: 'pcb-a.snapcnc', path: 'C:/Fx/pcb-a.snapcnc' },
    ];
    const cnc = filterRecentByMode(recent, 'cnc', s);
    t.deepEqual(cnc, [
        { name: 'pcb-a.snapcnc', path: 'c:\\fx\\PCB-A.snapcnc', isOpen: true },
        { name: 'Board.SNAPCNC', path: 'C:/Fx/Board.SNAPCNC', isOpen: false },
    ], 'cnc only, case-insensitive extension, open file marked, duplicate path dropped');
    t.deepEqual(filterRecentByMode(recent, 'laser', s).map((r) => r.name), ['ruler.snaplzr'], 'laser');
    t.deepEqual(filterRecentByMode(recent, 'printing', s).map((r) => r.name), ['p1.snap3dp'], 'printing');
    t.deepEqual(filterRecentByMode(undefined, 'cnc', s), [], 'no recent list');
    t.end();
});

test('projectHeadTypeOf maps project extensions to modes', (t) => {
    t.equal(projectHeadTypeOf('a.SNAPLZR'), 'laser');
    t.equal(projectHeadTypeOf('C:/x/b.snapcnc'), 'cnc');
    t.equal(projectHeadTypeOf('c.snap3dp'), 'printing');
    t.equal(projectHeadTypeOf('d.gcode'), null);
    t.equal(projectHeadTypeOf(''), null);
    t.end();
});

test('closing the last project tab leaves only home and workspace', (t) => {
    let s = withDocs(doc('a', 'cnc'));
    s = activateTab(s, 'a', 1);
    s = removeDocument(s, 'a');
    t.deepEqual(s.order, [], 'no project tabs');
    t.deepEqual(s.documents, {}, 'no documents');
    t.equal(s.activeTabId, HOME_TAB, 'home is active');
    t.deepEqual(s.activeDocByHead, {}, 'no live document');
    t.equal(pathForTab(s, s.activeTabId), '/', 'home route');
    t.end();
});

test('collectUnsavedDocuments uses the live flag for live docs and the meta for parked docs, grouped by mode', (t) => {
    let s = withDocs(
        doc('c1', 'cnc', { unSaved: false }),
        doc('l1', 'laser', { unSaved: true }),
        doc('c2', 'cnc', { unSaved: true }),
        doc('p1', 'printing', { unSaved: false }),
        doc('l2', 'laser', { unSaved: false }),
    );
    s = activateTab(s, 'c1', 1); // live cnc: meta says saved, live flag says unsaved
    s = activateTab(s, 'l1', 2); // live laser: meta says unsaved, live flag says saved
    s = activateTab(s, 'p1', 3);
    const out = collectUnsavedDocuments(s, { cnc: true, laser: false });
    t.deepEqual(out.map((d) => d.id), ['c1', 'c2'], 'laser live flag false wins over meta; printing has no live flag → meta');
    const out2 = collectUnsavedDocuments(s, { cnc: false, laser: true, printing: true });
    t.deepEqual(out2.map((d) => d.id), ['p1', 'l1', 'c2'], 'grouped printing, laser, cnc; parked c2 keeps its meta');
    t.deepEqual(collectUnsavedDocuments(createTabsState(), { cnc: true }), [], 'no documents');
    t.equal(out2[0].unSaved, true, 'returned meta carries the effective flag');
    t.end();
});

const sessionDoc = (id, headType, openedFile, unSaved, untitledIndex = 0) => ({
    id, headType, openedFile, untitledIndex, unSaved, isRotate: false, machineSeries: null, machineToolHead: null,
});

test('planRestore restores a moved or deleted file from its autosave, marked unsaved', (t) => {
    const m = {
        version: 1,
        order: ['g', 'h'],
        activeTabId: 'g',
        documents: [
            sessionDoc('g', 'cnc', { name: 'gone.snapcnc', path: '/f/gone.snapcnc' }, false),
            sessionDoc('h', 'cnc', { name: 'gone2.snapcnc', path: '/f/gone2.snapcnc' }, false),
        ],
    };
    const r = planRestore(m, ['g'], () => false);
    t.deepEqual(r.state.order, ['g'], 'with env it comes back, without it is dropped');
    t.equal(r.state.documents.g.source, 'env');
    t.equal(r.state.documents.g.unSaved, true, 'the file is gone: the tab is unsaved');
    t.deepEqual(r.state.documents.g.openedFile, { name: 'gone.snapcnc', path: '/f/gone.snapcnc' }, 'Save writes the file again');
    t.deepEqual(r.missingFile.map((d) => d.id), ['g']);
    t.deepEqual(r.dropped.map((d) => d.id), ['h']);
    t.equal(r.state.activeTabId, 'g');
    t.end();
});

test('planRestore skips clean untitled tabs without autosave silently, drops unsaved ones', (t) => {
    const m = {
        version: 1,
        order: ['e', 'u', 'w'],
        activeTabId: 'e',
        documents: [
            sessionDoc('e', 'laser', null, false, 1),
            sessionDoc('u', 'laser', null, true, 2),
            sessionDoc('w', 'laser', null, false, 3),
        ],
    };
    const r = planRestore(m, ['w'], () => true);
    t.deepEqual(r.state.order, ['w'], 'an untitled tab with an autosave comes back');
    t.equal(r.state.documents.w.source, 'env');
    t.deepEqual(r.skipped.map((d) => d.id), ['e'], 'empty untitled tab: nothing to restore, no toast');
    t.deepEqual(r.dropped.map((d) => d.id), ['u'], 'unsaved untitled tab whose autosave is gone');
    t.equal(r.state.activeTabId, HOME_TAB);
    t.end();
});

test('planRestore keeps the tab order and the active tab', (t) => {
    const m = {
        version: 1,
        order: ['c', 'a', 'b'],
        activeTabId: 'a',
        documents: [
            sessionDoc('a', 'cnc', { name: 'a.snapcnc', path: '/f/a.snapcnc' }, false),
            sessionDoc('b', 'laser', { name: 'b.snaplzr', path: '/f/b.snaplzr' }, true),
            sessionDoc('c', 'cnc', { name: 'c.snapcnc', path: '/f/c.snapcnc' }, true),
        ],
    };
    const r = planRestore(parseSession(m), ['b', 'c'], () => true);
    t.deepEqual(r.state.order, ['c', 'a', 'b']);
    t.equal(r.state.activeTabId, 'a');
    t.deepEqual(r.autosaved.map((d) => d.id), ['c', 'b']);
    t.end();
});

test('planRestore migrates legacy envs when there is no manifest (planLegacyMigration)', (t) => {
    let n = 0;
    const s = planLegacyMigration(['cnc', 'laser', 'cnc', 'bogus'], () => `id${++n}`);
    t.deepEqual(s.order, ['id1', 'id2'], 'one doc per head type, unknown heads ignored');
    t.equal(s.documents.id1.headType, 'cnc');
    t.equal(s.documents.id1.source, 'legacy-env');
    t.equal(s.documents.id1.unSaved, true);
    t.equal(s.documents.id1.loaded, false);
    t.equal(s.documents.id1.openedFile, null);
    t.equal(s.documents.id1.untitledIndex, 1);
    t.equal(s.documents.id2.untitledIndex, 1, 'numbered per head type');
    t.equal(s.activeTabId, 'id1', 'the first migrated doc is shown');
    t.equal(s.activeDocByHead.cnc, 'id1');
    t.equal(planLegacyMigration([], () => 'x').order.length, 0);
    t.equal(planLegacyMigration([], () => 'x').activeTabId, HOME_TAB);
    t.end();
});

test('restoreEntryPoint starts on Home with no live doc and names the tab to activate', (t) => {
    const s = activateTab(withDocs(doc('a', 'cnc', { loaded: false }), doc('b', 'laser', { loaded: false })), 'b', 0);
    const r = restoreEntryPoint(s);
    t.equal(r.state.activeTabId, HOME_TAB);
    t.deepEqual(r.state.activeDocByHead, {}, 'nothing is live before it is loaded');
    t.deepEqual(r.state.order, ['a', 'b']);
    t.equal(r.activate, 'b');
    t.equal(restoreEntryPoint(activateTab(s, WORKSPACE_TAB, 0)).activate, WORKSPACE_TAB);
    t.equal(restoreEntryPoint(createTabsState()).activate, HOME_TAB);
    t.end();
});

test('unloadedMeta: unsaved or untitled docs come back from the env, saved files from the file', (t) => {
    const file = { name: 'a.snapcnc', path: '/f/a.snapcnc' };
    t.deepEqual(unloadedMeta(doc('a', 'cnc', { openedFile: file }), false), { loaded: false, source: 'file', unSaved: false });
    t.deepEqual(unloadedMeta(doc('a', 'cnc', { openedFile: file }), true), { loaded: false, source: 'env', unSaved: true });
    t.deepEqual(unloadedMeta(doc('u', 'laser'), false), { loaded: false, source: 'env', unSaved: false });
    t.end();
});

test('serializeSession stores the unsaved flag as a boolean', (t) => {
    const s = withDocs(doc('a', 'cnc', { unSaved: [{}] }), doc('b', 'cnc', { unSaved: undefined }));
    const m = JSON.parse(serializeSession(s));
    t.deepEqual(m.documents.map((d) => d.unSaved), [true, false]);
    t.end();
});
