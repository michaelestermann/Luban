/**
 * "Machine switched to …" notice of the tab shell (Luban 4.17 tabs, design D).
 *
 * A thunk that switched the machine calls `showMachineNotice` with the machine before the switch; the
 * `MachineNotice` component subscribes, shows the notice with Undo and dismisses it. A switch that reloads
 * the window (machine settings) keeps the notice in the session storage until the next start
 * (`stashMachineNotice` / `takeStashedMachineNotice`). No React or redux here.
 */

export interface MachineNoticeMachine {
    series: string;
    toolHead: Record<string, string>;
}

export interface MachineNoticeInfo {
    id: number;
    /** series of the machine switched to */
    series: string;
    /** the machine before the switch (Undo) */
    previous: MachineNoticeMachine;
}

type Listener = (notice: MachineNoticeInfo | null) => void;

const STASH_KEY = 'luban.tabs.machineNotice';

const listeners = new Set<Listener>();
let current: MachineNoticeInfo | null = null;
let nextId = 1;

function notify(): void {
    for (const listener of Array.from(listeners)) {
        listener(current);
    }
}

export function showMachineNotice(series: string, previous: MachineNoticeMachine): MachineNoticeInfo {
    current = { id: nextId++, series, previous: { series: previous.series, toolHead: { ...previous.toolHead } } };
    notify();
    return current;
}

export function dismissMachineNotice(id?: number): void {
    if (!current || (id !== undefined && current.id !== id)) {
        return;
    }
    current = null;
    notify();
}

export function currentMachineNotice(): MachineNoticeInfo | null {
    return current;
}

export function subscribeMachineNotice(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function sessionStore(): Storage | null {
    try {
        return typeof window !== 'undefined' ? window.sessionStorage : null;
    } catch (e) {
        return null;
    }
}

/** Keeps a notice for the next start of the renderer (a machine switch that reloads the window). */
export function stashMachineNotice(series: string, previous: MachineNoticeMachine): void {
    try {
        sessionStore()?.setItem(STASH_KEY, JSON.stringify({ series, previous }));
    } catch (e) {
        // the notice is optional
    }
}

/** The stashed notice (removed from the storage), null when there is none or it cannot be read. */
export function takeStashedMachineNotice(): { series: string; previous: MachineNoticeMachine } | null {
    const store = sessionStore();
    if (!store) {
        return null;
    }
    try {
        const raw = store.getItem(STASH_KEY);
        store.removeItem(STASH_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (typeof parsed?.series !== 'string' || typeof parsed?.previous?.series !== 'string' || typeof parsed?.previous?.toolHead !== 'object') {
            return null;
        }
        return { series: parsed.series, previous: { series: parsed.previous.series, toolHead: { ...parsed.previous.toolHead } } };
    } catch (e) {
        return null;
    }
}
