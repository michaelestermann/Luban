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
    initialPanelCollapsed,
    projectPanelGroups,
    lastEditorHead,
    normalizeMachineSeries,
    needsMachineSwitch,
    isDocumentForOtherMachine,
    machineSwitchToolHead,
    recentProjects,
    filterDocumentsByQuery,
    scrollOffsetToReveal,
    droppedFilesToOpen,
    tabKeyAction,
    sessionPersistAllowed,
    keepFailedDocument,
    machineActionOnOpen,
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
    const s = planLegacyMigration([
        { headType: 'cnc', id: 'id1' }, { headType: 'laser', id: 'id2' }, { headType: 'cnc', id: 'id3' }, { headType: 'bogus', id: 'id4' },
    ]);
    t.deepEqual(s.order, ['id1', 'id2'], 'one doc per head type, unknown heads ignored');
    t.equal(s.documents.id1.headType, 'cnc');
    t.equal(s.documents.id1.source, 'env', 'the 4.16 auto-save was copied into env/docs/<id>');
    t.equal(s.documents.id1.unSaved, true);
    t.equal(s.documents.id1.loaded, false);
    t.equal(s.documents.id1.openedFile, null);
    t.equal(s.documents.id1.untitledIndex, 1);
    t.equal(s.documents.id2.untitledIndex, 1, 'numbered per head type');
    t.equal(s.activeTabId, 'id1', 'the first migrated doc is shown');
    t.equal(s.activeDocByHead.cnc, 'id1');
    t.equal(planLegacyMigration([]).order.length, 0);
    t.equal(planLegacyMigration([]).activeTabId, HOME_TAB);
    t.end();
});

test('a migrated 4.16 tab that was never opened survives the next starts (final review I-3)', (t) => {
    const first = planLegacyMigration([{ headType: 'laser', id: 'l1' }, { headType: 'cnc', id: 'c1' }]);
    // first 4.17 session: only the laser tab is opened; the session is stored with both tabs
    const stored = serializeSession(updateDocument(first, 'l1', { loaded: true, source: 'live' }));
    // env/docs/l1 and env/docs/c1 exist (the server copied them at migration)
    const second = planRestore(parseSession(stored), ['l1', 'c1'], () => false);
    t.deepEqual(second.state.order, ['l1', 'c1'], 'both tabs come back');
    t.deepEqual(second.dropped, [], 'nothing is dropped');
    t.equal(second.state.documents.c1.source, 'env', 'the CNC tab loads from its own auto-save');
    t.equal(second.state.documents.c1.unSaved, true);
    const third = planRestore(parseSession(serializeSession(second.state)), ['l1', 'c1'], () => false);
    t.deepEqual(third.state.order, ['l1', 'c1'], 'and again on the start after that');
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

test('initialPanelCollapsed: stored value wins; collapsed below 1280', (t) => {
    t.equal(initialPanelCollapsed(true, 1920), true, 'stored collapsed');
    t.equal(initialPanelCollapsed(false, 1000), false, 'stored expanded');
    t.equal(initialPanelCollapsed(undefined, 1440), false, 'wide window: expanded');
    t.equal(initialPanelCollapsed(undefined, 1280), false, '1280 is not narrower than 1280');
    t.equal(initialPanelCollapsed(undefined, 1279), true, 'narrow window: collapsed');
    t.equal(initialPanelCollapsed(null, 1200), true, 'null counts as not stored');
    t.equal(initialPanelCollapsed('true', 1920), true, 'stored string from the store');
    t.equal(initialPanelCollapsed('false', 1000), false);
    t.end();
});

test('projectPanelGroups: modes in order, live docs take the live status, parked docs their meta', (t) => {
    let s = withDocs(
        doc('c1', 'cnc', { status: 'design' }),
        doc('l1', 'laser', { status: 'gcode-ready' }),
        doc('c2', 'cnc', { status: 'gcode-ready' }),
        doc('p1', 'printing', { status: 'design' }),
    );
    s = activateTab(activateTab(s, 'c1', 1), 'p1', 2);
    const groups = projectPanelGroups(s, { cnc: 'gcode-ready', printing: 'sliced', laser: 'design' });
    t.deepEqual(groups.map((g) => g.headType), ['printing', 'laser', 'cnc'], 'printing, laser, cnc');
    t.deepEqual(groups[2].documents.map((d) => d.meta.id), ['c1', 'c2'], 'tab order inside a mode');
    t.equal(groups[2].documents[0].status, 'gcode-ready', 'live cnc doc: live status');
    t.equal(groups[2].documents[1].status, 'gcode-ready', 'parked cnc doc: meta status');
    t.equal(groups[0].documents[0].status, 'sliced', 'live printing doc: live status');
    t.equal(groups[1].documents[0].status, 'gcode-ready', 'laser doc is not live (never activated): meta status');
    t.equal(groups[0].documents[0].active, true, 'the active tab is marked');
    t.equal(groups[2].documents[0].active, false);
    t.deepEqual(projectPanelGroups(createTabsState(), {}), [], 'no docs: no groups');
    const noLive = projectPanelGroups(s, {});
    t.equal(noLive[2].documents[0].status, 'design', 'without a live status the meta status is used');
    t.end();
});

test('lastEditorHead: the active doc, else the most recently active doc, else null', (t) => {
    let s = withDocs(doc('c1', 'cnc'), doc('l1', 'laser'));
    t.equal(lastEditorHead(s), null, 'nothing activated yet');
    s = activateTab(s, 'l1', 5);
    s = activateTab(s, 'c1', 9);
    t.equal(lastEditorHead(s), 'cnc', 'active doc');
    s = activateTab(s, HOME_TAB, 10);
    t.equal(lastEditorHead(s), 'cnc', 'Home: last active doc');
    s = activateTab(s, 'l1', 11);
    s = activateTab(s, WORKSPACE_TAB, 12);
    t.equal(lastEditorHead(s), 'laser', 'Workspace: last active doc');
    t.end();
});

test('normalizeMachineSeries maps the legacy series names of old project files', (t) => {
    t.equal(normalizeMachineSeries('A150'), 'Snapmaker 2.0 A150');
    t.equal(normalizeMachineSeries('A250'), 'Snapmaker 2.0 A250');
    t.equal(normalizeMachineSeries('A350'), 'Snapmaker 2.0 A350');
    t.equal(normalizeMachineSeries('A400'), 'A400', 'identifiers stay');
    t.equal(normalizeMachineSeries('Snapmaker J1'), 'Snapmaker J1');
    t.equal(normalizeMachineSeries(''), null);
    t.equal(normalizeMachineSeries(undefined), null);
    t.equal(normalizeMachineSeries(42), null);
    t.end();
});

test('needsMachineSwitch: same machine -> false; other series -> true; other toolhead for the mode -> true; no machineInfo -> false', (t) => {
    const toolHead = { printingToolhead: 'dualExtruderToolheadForArtisan', laserToolhead: '40W Laser Module', cncToolhead: 'levelTwoCNCToolheadForSM2' };
    const current = { series: 'A400', toolHead };
    t.equal(needsMachineSwitch(current, { series: 'A400', toolHead: { ...toolHead } }, 'cnc'), false, 'same machine');
    t.equal(needsMachineSwitch(current, { series: 'Snapmaker J1', toolHead: { printingToolhead: 'Snapmaker J1 IDEX Tool Head' } }, 'printing'), true, 'other series');
    t.equal(needsMachineSwitch(current, { series: 'A400', toolHead: { ...toolHead, laserToolhead: '20W Laser Module' } }, 'laser'), true, 'other toolhead of the mode');
    t.equal(needsMachineSwitch(current, { series: 'A400', toolHead: { ...toolHead, laserToolhead: '20W Laser Module' } }, 'cnc'), false, 'other toolhead of another mode');
    t.equal(needsMachineSwitch(current, null, 'cnc'), false, 'no machineInfo');
    t.equal(needsMachineSwitch(current, {}, 'cnc'), false, 'no series');
    t.equal(needsMachineSwitch(current, { series: 'A400' }, 'cnc'), false, 'no toolhead: series decides');
    t.equal(needsMachineSwitch(current, { series: 'A400', toolHead: { cncToolhead: '' } }, 'cnc'), false, 'empty toolhead is unknown');
    t.equal(
        needsMachineSwitch({ series: 'Snapmaker 2.0 A350', toolHead }, { series: 'A350', toolHead }, 'cnc'),
        false,
        'legacy series name of the same machine',
    );
    t.end();
});

test('isDocumentForOtherMachine uses the machine stored in the tab meta', (t) => {
    const current = { series: 'A400', toolHead: { printingToolhead: 'p', laserToolhead: 'l40', cncToolhead: 'c2' } };
    t.equal(isDocumentForOtherMachine(doc('a', 'laser', { machineSeries: 'A400', machineToolHead: { laserToolhead: 'l40' } }), current), false);
    t.equal(isDocumentForOtherMachine(doc('a', 'laser', { machineSeries: 'A400', machineToolHead: { laserToolhead: 'l20' } }), current), true);
    t.equal(isDocumentForOtherMachine(doc('a', 'laser', { machineSeries: 'Snapmaker 2.0 A350', machineToolHead: null }), current), true);
    t.equal(isDocumentForOtherMachine(doc('a', 'laser'), current), false, 'unknown machine: no bar');
    t.equal(isDocumentForOtherMachine(null, current), false);
    t.end();
});

test('machineSwitchToolHead: the project toolhead for its mode, the current one for the others, only toolheads of the new machine', (t) => {
    const available = {
        printing: ['p-single', 'p-dual'],
        laser: ['l10', 'l20'],
        cnc: ['c-std', 'c-hi'],
    };
    const current = { printingToolhead: 'p-artisan', laserToolhead: 'l20', cncToolhead: 'c-hi' };
    const project = { printingToolhead: 'p-dual', laserToolhead: 'l10', cncToolhead: 'c-std' };
    t.deepEqual(machineSwitchToolHead(current, project, 'cnc', available), {
        printingToolhead: 'p-dual', // the current one is not on the new machine: the project one
        laserToolhead: 'l20', // the current one fits
        cncToolhead: 'c-std', // the mode of the project: the project one
    });
    t.deepEqual(machineSwitchToolHead(current, { cncToolhead: 'c-unknown' }, 'cnc', available), {
        printingToolhead: 'p-single', // neither fits: the first toolhead of the machine
        laserToolhead: 'l20',
        cncToolhead: 'c-hi', // the project one does not exist: the current one
    });
    t.deepEqual(machineSwitchToolHead(current, null, 'laser', { printing: ['x'] }), {
        printingToolhead: 'x',
        laserToolhead: 'l20', // no list for the mode: kept
        cncToolhead: 'c-hi',
    });
    t.end();
});

test('recentProjects: all modes, newest first, no duplicates, open files marked, limited', (t) => {
    const s = withDocs(doc('a', 'cnc', { openedFile: { name: 'PCB.snapcnc', path: 'D:/p/PCB.snapcnc' } }));
    const recent = [
        { name: 'old.snaplzr', path: 'D:/p/old.snaplzr' },
        { name: 'PCB.snapcnc', path: 'd:\\p\\pcb.snapcnc' },
        { name: 'part.stl', path: 'D:/p/part.stl' },
        { name: 'vase.snap3dp', path: 'D:/p/vase.snap3dp' },
        { name: 'PCB.snapcnc', path: 'D:/p/PCB.snapcnc' },
        null,
    ];
    const list = recentProjects(recent, s);
    t.deepEqual(list.map((r) => r.name), ['PCB.snapcnc', 'vase.snap3dp', 'old.snaplzr'], 'newest first, deduplicated, projects only');
    t.deepEqual(list.map((r) => r.headType), ['cnc', 'printing', 'laser']);
    t.deepEqual(list.map((r) => r.isOpen), [true, false, false]);
    t.equal(recentProjects(recent, s, 2).length, 2, 'limit');
    t.deepEqual(recentProjects(null, s), []);
    t.end();
});

test('filterDocumentsByQuery matches case-insensitively and keeps groups', (t) => {
    const s = withDocs(
        doc('c1', 'cnc', { openedFile: { name: 'PCB-a.snapcnc', path: 'D:/x/PCB-a.snapcnc' } }),
        doc('l1', 'laser', { openedFile: { name: 'ruler.snaplzr', path: 'D:/x/ruler.snaplzr' } }),
        doc('c2', 'cnc', { openedFile: { name: 'pcb-b.snapcnc', path: 'D:/x/pcb-b.snapcnc' } }),
        doc('p1', 'printing', { untitledIndex: 2 }),
    );
    const all = filterDocumentsByQuery(s, '', 'Untitled');
    t.deepEqual(all.map(g => g.headType), ['printing', 'laser', 'cnc'], 'empty query: all groups in mode order');
    t.deepEqual(all[2].documents.map(d => d.id), ['c1', 'c2'], 'tab order inside a mode');
    const pcb = filterDocumentsByQuery(s, '  PcB ', 'Untitled');
    t.deepEqual(pcb.map(g => g.headType), ['cnc'], 'only the cnc group');
    t.deepEqual(pcb[0].documents.map(d => d.id), ['c1', 'c2'], 'both pcb files, case-insensitive, trimmed');
    t.deepEqual(filterDocumentsByQuery(s, 'untitled 2', 'Untitled').map(g => g.documents[0].id), ['p1'], 'untitled docs match their label');
    t.deepEqual(filterDocumentsByQuery(s, 'nothing', 'Untitled'), [], 'no match: no groups');
    t.end();
});

test('scrollOffsetToReveal scrolls a hidden tab just into view', (t) => {
    t.equal(scrollOffsetToReveal(0, 500, 100, 120), 0, 'visible: unchanged');
    t.equal(scrollOffsetToReveal(0, 500, 600, 120), 220, 'right of the view: its right edge at the view edge');
    t.equal(scrollOffsetToReveal(300, 500, 100, 120), 100, 'left of the view: its left edge at the view edge');
    t.equal(scrollOffsetToReveal(300, 100, 350, 120), 350, 'wider than the view: left edge wins');
    t.end();
});

test('droppedFilesToOpen: project files always, G-code only outside the Workspace', (t) => {
    const names = ['a.snapcnc', 'B.SNAPLZR', 'pic.png', 'job.gcode', 'x.nc', 'p.snap3dp', 'm.stl', 'y.cnc'];
    t.deepEqual(droppedFilesToOpen(names, 'home'), [0, 1, 3, 4, 5, 7], 'home: projects and G-code');
    t.deepEqual(droppedFilesToOpen(names, WORKSPACE_TAB), [0, 1, 5], 'workspace: its drop zone takes the G-code');
    t.deepEqual(droppedFilesToOpen(['pic.png'], 'doc-1'), [], 'images stay with the page');
    t.end();
});

test('tabKeyAction: Delete / Backspace on a focused tab never close it (final review I-2)', (t) => {
    t.equal(tabKeyAction('Delete'), null, 'Delete is left to the editor');
    t.equal(tabKeyAction('Backspace'), null, 'Backspace is left to the editor');
    t.equal(tabKeyAction('Enter'), 'activate', 'Enter activates');
    t.equal(tabKeyAction(' '), 'activate', 'Space activates');
    t.equal(tabKeyAction('a'), null, 'other keys do nothing');
    t.end();
});

test('sessionPersistAllowed: a start that could not read the auto-save list never stores the session (final review I-6)', (t) => {
    t.equal(sessionPersistAllowed('restored'), true, 'restored (or nothing to restore): stored on every change');
    t.equal(sessionPersistAllowed('kept-open'), true, 'documents were open already: their session is stored');
    t.equal(sessionPersistAllowed('unreadable'), false, 'auto-save list unreadable: the stored session is kept as it is');
    t.equal(sessionPersistAllowed('failed'), false, 'restore threw: the stored session is kept as it is');
    t.end();
});

test('keepFailedDocument: a failed load keeps the tab and its auto-save (final review I-4)', (t) => {
    // "Untitled 2" was restored from its auto-save; loading it made it live, then the load threw
    const original = doc('u2', 'cnc', { untitledIndex: 2, unSaved: true, loaded: false, source: 'env' });
    let s = withDocs(doc('a', 'cnc'), original);
    s = updateDocument(activateTab(s, 'u2', 5), 'u2', { loaded: true, source: 'live' });
    s = activateTab(s, 'a', 6);
    s = keepFailedDocument(s, 'u2', original);
    t.deepEqual(s.order, ['a', 'u2'], 'the tab stays');
    t.equal(s.documents.u2.loaded, false, 'not loaded: a click loads it again');
    t.equal(s.documents.u2.loadFailed, true, 'marked as failed');
    t.equal(s.documents.u2.source, 'env', 'loads from its auto-save again');
    t.equal(s.documents.u2.unSaved, true, 'still unsaved');
    t.equal(s.activeDocByHead.cnc, 'a', 'the other document is live');
    // still active and live (no other tab could be shown): it is detached and Home is shown
    let only = updateDocument(activateTab(withDocs(original), 'u2', 1), 'u2', { loaded: true, source: 'live' });
    only = keepFailedDocument(only, 'u2', original);
    t.equal(only.activeTabId, HOME_TAB, 'Home is shown');
    t.equal(only.activeDocByHead.cnc, undefined, 'no live document of the mode');
    // the session keeps it, and the next start finds its auto-save
    const next = planRestore(parseSession(serializeSession(s)), ['u2'], () => false);
    t.deepEqual(next.state.order, ['a', 'u2'].filter((id) => next.state.documents[id]), 'kept in the session');
    t.ok(next.state.documents.u2, 'restored from its auto-save on the next start');
    t.equal(next.state.documents.u2.loadFailed, undefined, 'the failure mark is not stored');
    // the live project meta was emptied (and synced into the tab) before: the file name comes back
    const file = { name: 'p1.snap3dp', path: 'C:/x/p1.snap3dp' };
    const withFile = doc('p1', 'printing', { openedFile: file, unSaved: true, loaded: false, source: 'env' });
    let synced = updateDocument(activateTab(withDocs(withFile), 'p1', 1), 'p1', { loaded: true, source: 'live', openedFile: null, untitledIndex: 1 });
    synced = keepFailedDocument(synced, 'p1', withFile);
    t.deepEqual(synced.documents.p1.openedFile, file, 'its file name is kept');
    t.equal(synced.documents.p1.untitledIndex, 0, 'no untitled number');
    // a later successful load clears the mark
    t.equal(updateDocument(s, 'u2', { loaded: true, source: 'live', loadFailed: false }).documents.u2.loadFailed, false);
    t.end();
});

test('machineActionOnOpen: never switch the machine while one is connected (final review I-7)', (t) => {
    const current = { series: 'A350', toolHead: { cncToolhead: 'standardCNCToolheadForSM2' } };
    const artisan = { series: 'A400', toolHead: { cncToolhead: 'levelTwoCNCToolheadForSM2' } };
    t.equal(machineActionOnOpen(current, artisan, 'cnc', { connected: false, known: true }), 'switch', 'not connected: switch (spec)');
    t.equal(machineActionOnOpen(current, artisan, 'cnc', { connected: true, known: true }), 'mismatch', 'connected: keep the machine, show the mismatch bar');
    t.equal(machineActionOnOpen(current, artisan, 'cnc', { connected: false, known: false }), 'none', 'unknown machine: nothing');
    t.equal(machineActionOnOpen(current, { series: 'A350', toolHead: current.toolHead }, 'cnc', { connected: true, known: true }), 'none', 'same machine: nothing');
    t.equal(machineActionOnOpen(current, null, 'cnc', { connected: true, known: true }), 'none', 'no machine in the project: nothing');
    t.end();
});
