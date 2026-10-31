/**
 * State of the helper switches of the tool rail (Dimensions, Snap), kept per user in the
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

export interface SnapSettings {
    on: boolean;
    grid: boolean;
    // end points of paths, box corners and edge mid points
    points: boolean;
    centers: boolean;
    edges: boolean;
    align: boolean;
    // mm
    gridSize: number;
}

export interface HelperSwitches {
    dimensions: DimensionsSettings;
    snap: SnapSettings;
}

export type HelperName = keyof HelperSwitches;

const STORE_KEY = 'helperSwitches';

export const DEFAULT_HELPERS: HelperSwitches = {
    dimensions: { on: false, scope: 'selection', edges: true, between: true },
    snap: { on: false, grid: false, points: true, centers: true, edges: true, align: true, gridSize: 10 },
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
        snap: { ...DEFAULT_HELPERS.snap, ...(stored.snap || {}) },
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
