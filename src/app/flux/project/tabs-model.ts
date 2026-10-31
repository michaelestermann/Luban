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

function toSessionDocument(meta: DocumentMeta): SessionDocument {
    return {
        id: meta.id,
        headType: meta.headType,
        openedFile: meta.openedFile ? { name: meta.openedFile.name, path: meta.openedFile.path } : null,
        untitledIndex: meta.untitledIndex,
        unSaved: meta.unSaved,
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

/**
 * Restore plan: unsaved docs with an env dir come back from the env, others
 * from their file if it exists; all others are dropped. Nothing is loaded yet.
 */
export function planRestore(
    m: SessionManifest,
    envDocIds: string[],
    fileExists: (path: string) => boolean,
): { state: TabsState; dropped: SessionDocument[]; autosaved: DocumentMeta[] } {
    const envIds = new Set(envDocIds);
    const dropped: SessionDocument[] = [];
    const autosaved: DocumentMeta[] = [];
    let state = createTabsState();
    for (const d of m.documents) {
        let source: DocumentSource | null = null;
        if (d.unSaved && envIds.has(d.id)) {
            source = 'env';
        } else if (d.openedFile && fileExists(d.openedFile.path)) {
            source = 'file';
        }
        if (!source) {
            dropped.push(d);
            continue;
        }
        const meta: DocumentMeta = {
            ...d,
            loaded: false,
            source,
            status: 'design',
            lastActiveAt: 0,
        };
        if (source === 'env') {
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
    return { state, dropped, autosaved };
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
