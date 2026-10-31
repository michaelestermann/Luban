/**
 * State of the helper switches of the tool rail (Dimensions; Snap later), kept per user in the
 * editor settings. Default: all off.
 */
import { useEffect, useState } from 'react';

import { editorStore } from '../../../store/local-storage';

export interface DimensionsSettings {
    on: boolean;
    // 'selection': chains of the selection (editable); 'all': chains of every object (read-only)
    scope: 'selection' | 'all';
    edges: boolean;
    between: boolean;
}

export interface HelperSwitches {
    dimensions: DimensionsSettings;
}

export type HelperName = keyof HelperSwitches;

const STORE_KEY = 'helperSwitches';

export const DEFAULT_HELPERS: HelperSwitches = {
    dimensions: { on: false, scope: 'selection', edges: true, between: true },
};

function load(): HelperSwitches {
    let stored: Partial<HelperSwitches> = {};
    try {
        stored = editorStore.get(STORE_KEY, {}) || {};
    } catch (e) {
        stored = {};
    }
    return {
        dimensions: { ...DEFAULT_HELPERS.dimensions, ...(stored.dimensions || {}) },
    };
}

let current: HelperSwitches | null = null;
const listeners = new Set<(s: HelperSwitches) => void>();

export function getHelpers(): HelperSwitches {
    if (!current) {
        current = load();
    }
    return current;
}

export function updateHelper<K extends HelperName>(name: K, patch: Partial<HelperSwitches[K]>) {
    const helpers = getHelpers();
    current = { ...helpers, [name]: { ...helpers[name], ...patch } };
    try {
        editorStore.set(STORE_KEY, current);
    } catch (e) {
        // not stored: the switch still works for this session
    }
    listeners.forEach(listener => listener(current));
}

export function toggleHelper(name: HelperName) {
    updateHelper(name, { on: !getHelpers()[name].on });
}

export function useHelpers(): HelperSwitches {
    const [helpers, setHelpers] = useState(getHelpers);
    useEffect(() => {
        listeners.add(setHelpers);
        setHelpers(getHelpers());
        return () => {
            listeners.delete(setHelpers);
        };
    }, []);
    return helpers;
}
