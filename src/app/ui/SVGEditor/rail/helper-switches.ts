/**
 * State of the helper switches of the tool rail (Dimensions, Snap), kept per user in the
 * editor settings. Default: Snap on, Dimensions off (helper-defaults.ts).
 */
import { useEffect, useState } from 'react';

import { editorStore } from '../../../store/local-storage';
import { HelperSwitches, mergeStoredHelpers } from './helper-defaults';

export type { DimensionsSettings, HelperSwitches, SnapSettings } from './helper-defaults';
export { DEFAULT_HELPERS } from './helper-defaults';

export type HelperName = 'dimensions' | 'snap';

const STORE_KEY = 'helperSwitches';

function load(): HelperSwitches {
    let stored: Partial<HelperSwitches> = {};
    try {
        stored = editorStore.get(STORE_KEY, {}) || {};
    } catch (e) {
        stored = {};
    }
    return mergeStoredHelpers(stored);
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
