/**
 * Non-redux store of parked documents (Luban 4.17 tabs).
 *
 * A parked document is an open project that is not live in its editor slice. Its live objects
 * (modelGroup, toolPathGroup, SVGActions, history, ...) are kept here by reference, which is why
 * they stay out of redux.
 */

export interface ParkedDocument {
    slice: Record<string, unknown>;
    projectMeta: Record<string, unknown>;
    selectedModelIDs: string[];
}

interface ReadyEntry {
    ready: boolean;
    promise: Promise<void>;
    resolve: () => void;
}

class DocumentStore {
    private parked = new Map<string, ParkedDocument>();

    private ready = new Map<string, ReadyEntry>();

    private autosaves = new Map<string, Promise<unknown>>();

    private loading = new Map<string, number>();

    public park(id: string, p: ParkedDocument): void {
        this.parked.set(id, p);
    }

    /** Returns and removes the parked document. */
    public take(id: string): ParkedDocument | undefined {
        const p = this.parked.get(id);
        this.parked.delete(id);
        return p;
    }

    public peek(id: string): ParkedDocument | undefined {
        return this.parked.get(id);
    }

    public patchProjectMeta(id: string, patch: Record<string, unknown>): void {
        const p = this.parked.get(id);
        if (p) {
            p.projectMeta = { ...p.projectMeta, ...patch };
        }
    }

    public delete(id: string): void {
        this.parked.delete(id);
        this.ready.delete(id);
        this.autosaves.delete(id);
    }

    public ids(): string[] {
        return Array.from(this.parked.keys());
    }

    /** Resolves once the editor of the document has adopted its content group (`markEditorReady`). */
    public async whenEditorReady(id: string): Promise<void> {
        return this.readyEntry(id).promise;
    }

    public markEditorReady(id: string): void {
        const entry = this.readyEntry(id);
        entry.ready = true;
        entry.resolve();
    }

    /** The editor of the document went away (unmount, swap): a later `whenEditorReady` waits for the next mount. */
    public resetEditorReady(id: string): void {
        const entry = this.ready.get(id);
        if (entry && entry.ready) {
            this.ready.delete(id);
        }
    }

    public isEditorReady(id: string): boolean {
        return !!this.ready.get(id)?.ready;
    }

    public trackAutosave(id: string, p: Promise<unknown>): void {
        // lastAutosave never rejects
        this.autosaves.set(id, p.catch(() => undefined));
    }

    /** Resolves when the last tracked autosave of the document has settled. */
    public async lastAutosave(id: string): Promise<void> {
        await this.autosaves.get(id);
    }

    /** A document of `headType` is being loaded into its slice (the mode counts as busy meanwhile). */
    public setLoading(headType: string, on: boolean): void {
        const n = (this.loading.get(headType) || 0) + (on ? 1 : -1);
        if (n > 0) {
            this.loading.set(headType, n);
        } else {
            this.loading.delete(headType);
        }
    }

    public loadingHeads(): string[] {
        return Array.from(this.loading.keys());
    }

    private readyEntry(id: string): ReadyEntry {
        let entry = this.ready.get(id);
        if (!entry) {
            let resolve: () => void = () => undefined;
            const promise = new Promise<void>((r) => { resolve = r; });
            entry = { ready: false, promise, resolve };
            this.ready.set(id, entry);
        }
        return entry;
    }
}

export const documentStore = new DocumentStore();
