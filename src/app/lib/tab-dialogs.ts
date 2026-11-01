/**
 * Request / answer bridge between the tab thunks and the in-app dialogs of the tab shell (Luban 4.17 tabs).
 *
 * A thunk awaits `requestSaveChanges` / `requestQuitSelection`; `DialogHost` subscribes, renders the current
 * request and calls its `respond`. One request is shown at a time, further requests wait in a queue.
 * No React or redux here.
 */

export type SaveChangesAnswer = 'save' | 'discard' | 'cancel';

/** Why the save prompt is shown: closing a tab discards the changes, quitting keeps them as autosave. */
export type SaveChangesContext = 'close' | 'quit';

export interface QuitDocument {
    id: string;
    name: string;
    headType: string;
    path?: string | null;
}

export interface QuitAnswer {
    action: 'save' | 'discard' | 'cancel';
    ids: string[];
}

/** A busy document: stop its calculation and go on, or wait. */
export type BusyStopAnswer = 'stop' | 'wait';

/** What the user wanted to do when the busy guard refused it. */
export type BusyStopContext = 'close' | 'quit';

export type DialogRequest =
    | { id: number; kind: 'save-changes'; name: string; context: SaveChangesContext; respond: (answer: SaveChangesAnswer) => void }
    | { id: number; kind: 'quit-selection'; docs: QuitDocument[]; respond: (answer: QuitAnswer) => void }
    | { id: number; kind: 'busy-stop'; names: string[]; context: BusyStopContext; respond: (answer: BusyStopAnswer) => void };

type Listener = (request: DialogRequest | null) => void;

const queue: DialogRequest[] = [];
const listeners = new Set<Listener>();
let nextId = 1;

function notify(): void {
    const current = queue[0] ?? null;
    for (const listener of Array.from(listeners)) {
        listener(current);
    }
}

async function enqueue<A>(build: (id: number, respond: (answer: A) => void) => DialogRequest): Promise<A> {
    return new Promise<A>((resolve) => {
        const id = nextId++;
        let answered = false;
        const respond = (answer: A) => {
            if (answered) {
                return;
            }
            answered = true;
            const index = queue.findIndex((r) => r.id === id);
            if (index >= 0) {
                queue.splice(index, 1);
            }
            resolve(answer);
            notify();
        };
        queue.push(build(id, respond));
        if (queue.length === 1) {
            notify();
        }
    });
}

/** The request shown now, or null. */
export function currentDialogRequest(): DialogRequest | null {
    return queue[0] ?? null;
}

/** The listener is called at once with the current request and on every change. Returns unsubscribe. */
export function subscribeDialogRequests(listener: Listener): () => void {
    listeners.add(listener);
    listener(currentDialogRequest());
    return () => {
        listeners.delete(listener);
    };
}

/** "Save changes to {{name}}?" with Save / Don't save / Cancel. `context` picks the body text (close or quit). */
export async function requestSaveChanges(name: string, context: SaveChangesContext = 'close'): Promise<SaveChangesAnswer> {
    return enqueue<SaveChangesAnswer>((id, respond) => ({ id, kind: 'save-changes', name, context, respond }));
}

/** The quit list: the documents to save (all checked at first), "Save selected and quit" / "Don’t save any" / "Cancel". */
export async function requestQuitSelection(docs: QuitDocument[]): Promise<QuitAnswer> {
    return enqueue<QuitAnswer>((id, respond) => ({ id, kind: 'quit-selection', docs: docs.map((d) => ({ ...d })), respond }));
}

/** "{{name}} is still busy." with "Stop and close" (or "Stop and quit") / "Wait". */
export async function requestBusyStop(names: string[], context: BusyStopContext): Promise<BusyStopAnswer> {
    return enqueue<BusyStopAnswer>((id, respond) => ({ id, kind: 'busy-stop', names: [...names], context, respond }));
}
