/**
 * Tab / document registry (Luban 4.17 tabs).
 *
 * Pure functions only: no redux, three.js or DOM imports. The redux slice
 * `state.project.tabs` holds a `TabsState`; the thunks in `actions-tabs.ts`
 * compute the next state with these helpers and dispatch `setTabsState`.
 */

export const HOME_TAB = 'home';
export const WORKSPACE_TAB = 'workspace';

export type EditorHeadType = 'printing' | 'laser' | 'cnc';
export type DocumentSource = 'live' | 'env' | 'file' | 'legacy-env';
export type DocumentStatus = 'design' | 'gcode-ready' | 'sliced';

export const EDITOR_HEAD_TYPES: readonly EditorHeadType[] = ['printing', 'laser', 'cnc'];

export interface OpenedFileRef {
    name: string;
    path: string;
}

export interface DocumentMeta {
    id: string;
    headType: EditorHeadType;
    openedFile: OpenedFileRef | null;
    untitledIndex: number;
    unSaved: boolean;
    loaded: boolean;
    source: DocumentSource;
    isRotate: boolean;
    machineSeries: string | null;
    machineToolHead: Record<string, string> | null;
    status: DocumentStatus;
    lastActiveAt: number;
}

export interface TabsState {
    order: string[];
    documents: Record<string, DocumentMeta>;
    activeTabId: string;
    activeDocByHead: Partial<Record<EditorHeadType, string>>;
    workspaceNewCount: number;
}

export type SessionDocument = Pick<DocumentMeta,
    'id' | 'headType' | 'openedFile' | 'untitledIndex' | 'unSaved' | 'isRotate' | 'machineSeries' | 'machineToolHead'>;

export interface SessionManifest {
    version: 1;
    order: string[];
    activeTabId: string;
    documents: SessionDocument[];
}

export function isEditorHeadType(value: unknown): value is EditorHeadType {
    return value === 'printing' || value === 'laser' || value === 'cnc';
}

export function createTabsState(): TabsState {
    return {
        order: [],
        documents: {},
        activeTabId: HOME_TAB,
        activeDocByHead: {},
        workspaceNewCount: 0,
    };
}

/** Appends a document (or replaces the meta of an existing id). Does not activate it. */
export function addDocument(s: TabsState, meta: DocumentMeta): TabsState {
    const exists = Object.prototype.hasOwnProperty.call(s.documents, meta.id);
    return {
        ...s,
        order: exists ? s.order : [...s.order, meta.id],
        documents: { ...s.documents, [meta.id]: meta },
    };
}

/**
 * Activates Home, Workspace or a document tab. For a document it becomes the
 * live document of its head type and gets `lastActiveAt = now`.
 * Unknown tab ids are ignored (the same state is returned).
 */
export function activateTab(s: TabsState, tabId: string, now: number): TabsState {
    if (tabId === HOME_TAB) {
        return { ...s, activeTabId: HOME_TAB };
    }
    if (tabId === WORKSPACE_TAB) {
        return { ...s, activeTabId: WORKSPACE_TAB, workspaceNewCount: 0 };
    }
    const meta = s.documents[tabId];
    if (!meta) {
        return s;
    }
    return {
        ...s,
        activeTabId: tabId,
        activeDocByHead: { ...s.activeDocByHead, [meta.headType]: tabId },
        documents: { ...s.documents, [tabId]: { ...meta, lastActiveAt: now } },
    };
}

/**
 * The tab that becomes active when `id` is closed: the right neighbour of an
 * active doc, else the left one, else Home. Closing an inactive doc keeps the
 * active tab.
 */
export function nextTabAfterClose(s: TabsState, id: string): string {
    if (s.activeTabId !== id) {
        return s.activeTabId;
    }
    const index = s.order.indexOf(id);
    if (index < 0) {
        return HOME_TAB;
    }
    if (index + 1 < s.order.length) {
        return s.order[index + 1];
    }
    if (index - 1 >= 0) {
        return s.order[index - 1];
    }
    return HOME_TAB;
}

/**
 * Removes a document. If it was active, the tab from `nextTabAfterClose`
 * becomes active (a doc then becomes the live doc of its head). The
 * `activeDocByHead` entry is deleted if it pointed to the closed doc.
 */
export function removeDocument(s: TabsState, id: string): TabsState {
    const meta = s.documents[id];
    if (!meta) {
        return s;
    }
    const nextTabId = nextTabAfterClose(s, id);
    const documents = { ...s.documents };
    delete documents[id];
    const activeDocByHead = { ...s.activeDocByHead };
    if (activeDocByHead[meta.headType] === id) {
        delete activeDocByHead[meta.headType];
    }
    const nextMeta = documents[nextTabId];
    if (nextMeta) {
        activeDocByHead[nextMeta.headType] = nextTabId;
    }
    return {
        ...s,
        order: s.order.filter((x) => x !== id),
        documents,
        activeTabId: nextTabId,
        activeDocByHead,
    };
}

export function updateDocument(s: TabsState, id: string, patch: Partial<DocumentMeta>): TabsState {
    const meta = s.documents[id];
    if (!meta) {
        return s;
    }
    return {
        ...s,
        documents: { ...s.documents, [id]: { ...meta, ...patch, id } },
    };
}

/** Lower-cased, forward slashes, `.` and `..` segments resolved. */
export function normalizeDocumentPath(p: string): string {
    const slashed = p.replace(/\\/g, '/');
    let prefix = '';
    if (slashed.startsWith('//')) {
        prefix = '//';
    } else if (slashed.startsWith('/')) {
        prefix = '/';
    }
    const out: string[] = [];
    for (const part of slashed.split('/')) {
        if (part === '' || part === '.') {
            continue;
        }
        if (part === '..' && out.length > 0 && out[out.length - 1] !== '..') {
            out.pop();
        } else {
            out.push(part);
        }
    }
    return (prefix + out.join('/')).toLowerCase();
}

export function findDocumentByPath(s: TabsState, path: string | null | undefined): DocumentMeta | null {
    if (!path) {
        return null;
    }
    const wanted = normalizeDocumentPath(path);
    for (const id of s.order) {
        const meta = s.documents[id];
        if (meta?.openedFile?.path && normalizeDocumentPath(meta.openedFile.path) === wanted) {
            return meta;
        }
    }
    return null;
}

/** Lowest free positive integer among the untitled docs of that head type. */
export function nextUntitledIndex(s: TabsState, headType: EditorHeadType): number {
    const used = new Set<number>();
    for (const id of s.order) {
        const meta = s.documents[id];
        if (meta && meta.headType === headType && !meta.openedFile && meta.untitledIndex > 0) {
            used.add(meta.untitledIndex);
        }
    }
    let i = 1;
    while (used.has(i)) {
        i++;
    }
    return i;
}

export function groupDocumentsByMode(s: TabsState): Array<{ headType: EditorHeadType; documents: DocumentMeta[] }> {
    const groups = [];
    for (const headType of EDITOR_HEAD_TYPES) {
        const documents = s.order.map((id) => s.documents[id]).filter((d) => d && d.headType === headType);
        if (documents.length > 0) {
            groups.push({ headType, documents });
        }
    }
    return groups;
}

/**
 * The documents with unsaved changes, grouped by mode (printing, laser, cnc; tab order inside a mode).
 * For the document live in a mode, `liveUnsaved[head]` (project meta of the slice) overrides the tab meta
 * when it is given.
 */
export function collectUnsavedDocuments(s: TabsState, liveUnsaved: Partial<Record<EditorHeadType, boolean>>): DocumentMeta[] {
    const out: DocumentMeta[] = [];
    for (const group of groupDocumentsByMode(s)) {
        for (const meta of group.documents) {
            const live = s.activeDocByHead[meta.headType] === meta.id && typeof liveUnsaved[meta.headType] === 'boolean';
            const unSaved = live ? !!liveUnsaved[meta.headType] : meta.unSaved;
            if (unSaved) {
                out.push(meta.unSaved === unSaved ? meta : { ...meta, unSaved });
            }
        }
    }
    return out;
}

export function tabIdForPath(s: TabsState, pathname: string): string | null {
    if (pathname === '/' || pathname === '') {
        return HOME_TAB;
    }
    if (pathname === '/workspace') {
        return WORKSPACE_TAB;
    }
    const head = pathname.replace(/^\//, '');
    if (isEditorHeadType(head)) {
        return s.activeDocByHead[head] ?? null;
    }
    return null;
}

export function pathForTab(s: TabsState, tabId: string): string {
    if (tabId === WORKSPACE_TAB) {
        return '/workspace';
    }
    const meta = s.documents[tabId];
    if (meta) {
        return `/${meta.headType}`;
    }
    return '/';
}

/** Project file extension of each mode (lower case). */
export const PROJECT_EXTENSIONS: Record<EditorHeadType, string> = {
    printing: '.snap3dp',
    laser: '.snaplzr',
    cnc: '.snapcnc',
};

/** The mode of a project file name or path by its extension (case-insensitive), null for other files. */
export function projectHeadTypeOf(nameOrPath: string | null | undefined): EditorHeadType | null {
    const lower = (nameOrPath || '').toLowerCase();
    for (const head of EDITOR_HEAD_TYPES) {
        if (lower.endsWith(PROJECT_EXTENSIONS[head])) {
            return head;
        }
    }
    return null;
}

export interface RecentFileRef {
    name: string;
    path: string;
}

/**
 * The recent files of one mode (by extension), in the given order, without duplicates (same path).
 * `isOpen` marks files that are open in a tab.
 */
export function filterRecentByMode(
    recent: Array<RecentFileRef | null | undefined> | null | undefined,
    headType: EditorHeadType,
    s: TabsState,
): Array<RecentFileRef & { isOpen: boolean }> {
    const out: Array<RecentFileRef & { isOpen: boolean }> = [];
    const seen = new Set<string>();
    for (const item of recent || []) {
        if (!item || typeof item.name !== 'string' || projectHeadTypeOf(item.name) !== headType) {
            continue;
        }
        const path = typeof item.path === 'string' ? item.path : '';
        const key = path ? normalizeDocumentPath(path) : `name:${item.name.toLowerCase()}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        out.push({ name: item.name, path, isOpen: !!findDocumentByPath(s, path) });
    }
    return out;
}

export function documentDisplayName(meta: DocumentMeta, untitledLabel: string): string {
    if (meta.openedFile?.name) {
        return meta.openedFile.name;
    }
    return `${untitledLabel} ${meta.untitledIndex}`;
}

/**
 * The documents whose display name contains `query` (case-insensitive, trimmed), grouped by mode as
 * `groupDocumentsByMode` (all documents for an empty query). Untitled documents are named
 * `${untitledLabel} ${index}`.
 */
export function filterDocumentsByQuery(
    s: TabsState,
    query: string,
    untitledLabel: string
): Array<{ headType: EditorHeadType; documents: DocumentMeta[] }> {
    const wanted = (query || '').trim().toLowerCase();
    if (!wanted) {
        return groupDocumentsByMode(s);
    }
    return groupDocumentsByMode(s)
        .map((group) => ({
            headType: group.headType,
            documents: group.documents.filter((meta) => documentDisplayName(meta, untitledLabel).toLowerCase().includes(wanted)),
        }))
        .filter((group) => group.documents.length > 0);
}

/**
 * The scroll offset of a horizontally scrolled strip that shows the tab at `tabLeft` (strip content
 * coordinates, width `tabWidth`) completely, moving as little as possible. A tab wider than the view
 * shows its left edge.
 */
export function scrollOffsetToReveal(scrollLeft: number, viewWidth: number, tabLeft: number, tabWidth: number): number {
    if (tabLeft < scrollLeft || tabWidth > viewWidth) {
        return tabLeft;
    }
    if (tabLeft + tabWidth > scrollLeft + viewWidth) {
        return tabLeft + tabWidth - viewWidth;
    }
    return scrollLeft;
}

export const GCODE_EXTENSIONS: readonly string[] = ['.gcode', '.nc', '.cnc'];

/**
 * The dropped files (indexes) that open in tabs: project files always, G-code files unless the
 * Workspace is shown (its own drop zone takes them). Other files stay with the drop zone of the page.
 */
export function droppedFilesToOpen(names: string[], activeTabId: string): number[] {
    const out: number[] = [];
    names.forEach((name, index) => {
        const lower = (name || '').toLowerCase();
        const isGcode = GCODE_EXTENSIONS.some((ext) => lower.endsWith(ext));
        if (projectHeadTypeOf(lower) || (isGcode && activeTabId !== WORKSPACE_TAB)) {
            out.push(index);
        }
    });
    return out;
}

/**
 * What a key pressed on a focused tab does: Enter / Space activate it. No key closes a tab (Delete and
 * Backspace belong to the editor: a tab keeps the focus after a click); tabs close by ×, middle click,
 * Ctrl+F4 and the menu.
 */
export function tabKeyAction(key: string): 'activate' | null {
    if (key === 'Enter' || key === ' ') {
        return 'activate';
    }
    return null;
}

function toSessionDocument(meta: DocumentMeta): SessionDocument {
    return {
        id: meta.id,
        headType: meta.headType,
        openedFile: meta.openedFile ? { name: meta.openedFile.name, path: meta.openedFile.path } : null,
        untitledIndex: meta.untitledIndex,
        unSaved: !!meta.unSaved,
        isRotate: meta.isRotate,
        machineSeries: meta.machineSeries,
        machineToolHead: meta.machineToolHead,
    };
}

export function serializeSession(s: TabsState): string {
    const manifest: SessionManifest = {
        version: 1,
        order: s.order.filter((id) => s.documents[id]),
        activeTabId: s.activeTabId,
        documents: s.order.filter((id) => s.documents[id]).map((id) => toSessionDocument(s.documents[id])),
    };
    return JSON.stringify(manifest);
}

function parseSessionDocument(raw: unknown): SessionDocument | null {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const d = raw as Record<string, unknown>;
    if (typeof d.id !== 'string' || !d.id || !isEditorHeadType(d.headType)) {
        return null;
    }
    let openedFile: OpenedFileRef | null = null;
    const f = d.openedFile as Record<string, unknown> | null | undefined;
    if (f && typeof f === 'object' && typeof f.path === 'string' && f.path) {
        openedFile = { name: typeof f.name === 'string' ? f.name : f.path, path: f.path };
    }
    const toolHead = d.machineToolHead;
    return {
        id: d.id,
        headType: d.headType,
        openedFile,
        untitledIndex: typeof d.untitledIndex === 'number' && d.untitledIndex > 0 ? Math.floor(d.untitledIndex) : 0,
        unSaved: d.unSaved === true,
        isRotate: d.isRotate === true,
        machineSeries: typeof d.machineSeries === 'string' ? d.machineSeries : null,
        machineToolHead: toolHead && typeof toolHead === 'object' && !Array.isArray(toolHead) ? { ...(toolHead as Record<string, string>) } : null,
    };
}

/** Accepts a parsed object or a JSON string. Returns null for anything that is not a version-1 manifest. */
export function parseSession(json: unknown): SessionManifest | null {
    let raw = json;
    if (typeof raw === 'string') {
        try {
            raw = JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const m = raw as Record<string, unknown>;
    if (m.version !== 1 || !Array.isArray(m.order) || !Array.isArray(m.documents)) {
        return null;
    }
    const byId: Record<string, SessionDocument> = {};
    for (const item of m.documents) {
        const d = parseSessionDocument(item);
        if (d && !byId[d.id]) {
            byId[d.id] = d;
        }
    }
    const order: string[] = [];
    for (const id of m.order) {
        if (typeof id === 'string' && byId[id] && !order.includes(id)) {
            order.push(id);
        }
    }
    // documents missing from `order` are appended in their listed order
    for (const id of Object.keys(byId)) {
        if (!order.includes(id)) {
            order.push(id);
        }
    }
    let activeTabId = typeof m.activeTabId === 'string' ? m.activeTabId : HOME_TAB;
    if (activeTabId !== HOME_TAB && activeTabId !== WORKSPACE_TAB && !byId[activeTabId]) {
        activeTabId = HOME_TAB;
    }
    return {
        version: 1,
        order,
        activeTabId,
        documents: order.map((id) => byId[id]),
    };
}

export interface RestorePlan {
    state: TabsState;
    /** documents that could not come back (their file and autosave are gone) */
    dropped: SessionDocument[];
    /** documents that come back with autosaved changes */
    autosaved: DocumentMeta[];
    /** documents whose file is gone but whose autosave is there (restored from it, unsaved) */
    missingFile: DocumentMeta[];
    /** clean untitled documents without autosave: nothing to restore, no message */
    skipped: SessionDocument[];
}

/**
 * Restore plan: unsaved docs with an env dir come back from the env, others from their file if it
 * exists. A doc whose file is gone comes back from its env (unsaved, the file name is kept so Save
 * writes it again). Clean untitled docs without env are skipped; all others are dropped. Nothing is
 * loaded yet; the tab order and the active tab of the manifest are kept.
 */
export function planRestore(m: SessionManifest, envDocIds: string[], fileExists: (path: string) => boolean): RestorePlan {
    const envIds = new Set(envDocIds);
    const dropped: SessionDocument[] = [];
    const autosaved: DocumentMeta[] = [];
    const missingFile: DocumentMeta[] = [];
    const skipped: SessionDocument[] = [];
    let state = createTabsState();
    for (const d of m.documents) {
        const hasEnv = envIds.has(d.id);
        const fileThere = !!d.openedFile && fileExists(d.openedFile.path);
        let source: DocumentSource | null = null;
        let unSaved = d.unSaved;
        let lostFile = false;
        if (hasEnv && (d.unSaved || !d.openedFile)) {
            source = 'env';
        } else if (fileThere) {
            source = 'file';
        } else if (hasEnv) {
            // the file was moved or deleted: its autosave is all there is
            source = 'env';
            unSaved = true;
            lostFile = true;
        }
        if (!source) {
            if (!d.openedFile && !d.unSaved) {
                skipped.push(d);
            } else {
                dropped.push(d);
            }
            continue;
        }
        const meta: DocumentMeta = {
            ...d,
            unSaved,
            loaded: false,
            source,
            status: 'design',
            lastActiveAt: 0,
        };
        if (lostFile) {
            missingFile.push(meta);
        } else if (source === 'env' && unSaved) {
            autosaved.push(meta);
        }
        state = addDocument(state, meta);
    }
    // only the active document becomes live; the others load lazily on activation
    if (m.activeTabId === WORKSPACE_TAB) {
        state = activateTab(state, WORKSPACE_TAB, 0);
    } else if (state.documents[m.activeTabId]) {
        state = activateTab(state, m.activeTabId, 0);
    }
    return { state, dropped, autosaved, missingFile, skipped };
}

/**
 * First start without a session manifest: every head type with a 4.16 auto-save (`env/{head}`) becomes an
 * untitled, unsaved, not yet loaded document (`source 'legacy-env'`). The first one is the active tab.
 */
export function planLegacyMigration(heads: readonly string[], newId: () => string): TabsState {
    let state = createTabsState();
    const seen = new Set<string>();
    for (const head of heads) {
        if (!isEditorHeadType(head) || seen.has(head)) {
            continue;
        }
        seen.add(head);
        state = addDocument(state, {
            id: newId(),
            headType: head,
            openedFile: null,
            untitledIndex: nextUntitledIndex(state, head),
            unSaved: true,
            loaded: false,
            source: 'legacy-env',
            isRotate: false,
            machineSeries: null,
            machineToolHead: null,
            status: 'design',
            lastActiveAt: 0,
        });
    }
    return state.order.length ? activateTab(state, state.order[0], 0) : state;
}

/**
 * The restored registry starts on Home with no live document (nothing is loaded yet); `activate` is the
 * tab to activate next (that loads it).
 */
export function restoreEntryPoint(s: TabsState): { state: TabsState; activate: string } {
    return {
        state: { ...s, activeTabId: HOME_TAB, activeDocByHead: {} },
        activate: s.activeTabId,
    };
}

/** Meta patch of a document that is unloaded: unsaved or untitled docs reload from their env, saved files from the file. */
export function unloadedMeta(meta: DocumentMeta, unSaved: boolean): Pick<DocumentMeta, 'loaded' | 'source' | 'unSaved'> {
    return {
        loaded: false,
        source: unSaved || !meta.openedFile ? 'env' : 'file',
        unSaved,
    };
}

/**
 * Under memory pressure (`usedRatio >= threshold`) the least recently used
 * loaded document that is not live is unloaded. Returns null if none qualifies.
 */
export function pickDocumentToUnload(s: TabsState, liveIds: string[], usedRatio: number, threshold = 0.75): string | null {
    if (!(usedRatio >= threshold)) {
        return null;
    }
    const live = new Set(liveIds);
    let best: DocumentMeta | null = null;
    for (const id of s.order) {
        const meta = s.documents[id];
        if (meta && meta.loaded && !live.has(id) && (!best || meta.lastActiveAt < best.lastActiveAt)) {
            best = meta;
        }
    }
    return best ? best.id : null;
}

// ---- project panel (design D) ----

/** Narrower windows (CSS px) start with the project panel collapsed when no choice is stored. */
export const PANEL_COLLAPSE_BELOW_WIDTH = 1280;

/**
 * Whether the project panel starts collapsed: a stored choice wins (the store may give it back as a
 * string), else the panel is collapsed below 1280 px window width.
 */
export function initialPanelCollapsed(stored: boolean | string | null | undefined, windowWidth: number): boolean {
    if (stored === true || stored === 'true') {
        return true;
    }
    if (stored === false || stored === 'false') {
        return false;
    }
    return windowWidth < PANEL_COLLAPSE_BELOW_WIDTH;
}

export interface PanelDocument {
    meta: DocumentMeta;
    status: DocumentStatus;
    active: boolean;
}

/**
 * The open projects for the project panel, grouped by mode (printing, laser, cnc; tab order inside a
 * mode). The live document of a mode shows `liveStatus[head]` (computed from its slice); a parked or
 * unloaded document shows the status stored when it was parked.
 */
export function projectPanelGroups(
    s: TabsState,
    liveStatus: Partial<Record<EditorHeadType, DocumentStatus>>,
): Array<{ headType: EditorHeadType; documents: PanelDocument[] }> {
    return groupDocumentsByMode(s).map((group) => ({
        headType: group.headType,
        documents: group.documents.map((meta) => {
            const live = s.activeDocByHead[meta.headType] === meta.id && !!liveStatus[meta.headType];
            return {
                meta,
                status: live ? liveStatus[meta.headType] : meta.status,
                active: s.activeTabId === meta.id,
            };
        }),
    }));
}

/** The mode of the active document, else of the most recently active one (Home, Workspace), else null. */
export function lastEditorHead(s: TabsState): EditorHeadType | null {
    const active = s.documents[s.activeTabId];
    if (active) {
        return active.headType;
    }
    let best: DocumentMeta | null = null;
    for (const id of s.order) {
        const meta = s.documents[id];
        if (meta && meta.lastActiveAt > 0 && (!best || meta.lastActiveAt > best.lastActiveAt)) {
            best = meta;
        }
    }
    return best ? best.headType : null;
}

// ---- one machine (design D): projects made for another machine ----

export interface MachineRef {
    series: string;
    toolHead: Record<string, string>;
}

export interface ProjectMachineRef {
    series?: string | null;
    toolHead?: Record<string, string> | null;
}

// series names of older project files → machine identifiers
const LEGACY_SERIES: Record<string, string> = {
    A150: 'Snapmaker 2.0 A150',
    A250: 'Snapmaker 2.0 A250',
    A350: 'Snapmaker 2.0 A350',
};

/** The machine identifier of a series stored in a project (legacy names mapped), null when there is none. */
export function normalizeMachineSeries(series: unknown): string | null {
    if (typeof series !== 'string' || !series) {
        return null;
    }
    return LEGACY_SERIES[series] ?? series;
}

const toolHeadKey = (headType: EditorHeadType) => `${headType}Toolhead`;

/**
 * Whether a project needs another machine than the current one: its series differs, or its toolhead for
 * the project's mode differs. A project without a known machine (no machineInfo, no series) never does;
 * a missing or empty toolhead only compares the series.
 */
export function needsMachineSwitch(current: MachineRef, project: ProjectMachineRef | null | undefined, headType: EditorHeadType): boolean {
    const series = normalizeMachineSeries(project?.series);
    if (!series) {
        return false;
    }
    if (series !== normalizeMachineSeries(current.series)) {
        return true;
    }
    const wanted = project?.toolHead?.[toolHeadKey(headType)];
    return !!wanted && wanted !== current.toolHead?.[toolHeadKey(headType)];
}

/** `needsMachineSwitch` for an open tab: the machine stored in its meta against the current machine. */
export function isDocumentForOtherMachine(meta: DocumentMeta | null | undefined, current: MachineRef): boolean {
    if (!meta) {
        return false;
    }
    return needsMachineSwitch(current, { series: meta.machineSeries, toolHead: meta.machineToolHead }, meta.headType);
}

/**
 * The toolheads after a switch to a project's machine: for the project's mode the project's toolhead, for
 * the other modes the current one; each only when the new machine has it (`available[head]`), else the
 * other candidate, else the machine's first toolhead of that mode. A mode without a list keeps the current one.
 */
export function machineSwitchToolHead(
    current: Record<string, string> | null | undefined,
    project: Record<string, string> | null | undefined,
    headType: EditorHeadType,
    available: Partial<Record<EditorHeadType, string[]>>,
): Record<string, string> {
    const out: Record<string, string> = { ...(current || {}) };
    for (const head of EDITOR_HEAD_TYPES) {
        const key = toolHeadKey(head);
        const fromProject = project?.[key];
        const fromCurrent = current?.[key];
        const candidates = head === headType ? [fromProject, fromCurrent] : [fromCurrent, fromProject];
        const list = available[head];
        if (!list || list.length === 0) {
            const keep = candidates.find((c) => !!c);
            if (keep) {
                out[key] = keep;
            }
            continue;
        }
        out[key] = candidates.find((c) => !!c && list.includes(c)) ?? list[0];
    }
    return out;
}

/**
 * The recent project files of all modes for the panel's Recent list: newest first (the store keeps the
 * newest entry last), without duplicates, at most `limit`; `isOpen` marks files open in a tab.
 */
export function recentProjects(
    recent: Array<RecentFileRef | null | undefined> | null | undefined,
    s: TabsState,
    limit = 10,
): Array<RecentFileRef & { headType: EditorHeadType; isOpen: boolean }> {
    const out: Array<RecentFileRef & { headType: EditorHeadType; isOpen: boolean }> = [];
    const seen = new Set<string>();
    const list = [...(recent || [])].reverse();
    for (const item of list) {
        const headType = item && typeof item.name === 'string' ? projectHeadTypeOf(item.name) : null;
        if (!headType || out.length >= limit) {
            continue;
        }
        const path = typeof item.path === 'string' ? item.path : '';
        const key = path ? normalizeDocumentPath(path) : `name:${item.name.toLowerCase()}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        out.push({ name: item.name, path, headType, isOpen: !!findDocumentByPath(s, path) });
    }
    return out;
}
