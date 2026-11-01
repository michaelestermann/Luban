/**
 * Defaults of the helper switches of the tool rail (Dimensions, Snap) and how stored settings
 * are merged onto them. Snap is on by default since settings version 2.
 */
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
    version?: number;
    dimensions: DimensionsSettings;
    snap: SnapSettings;
}

export const HELPERS_VERSION = 2;

export const DEFAULT_HELPERS: HelperSwitches = {
    version: HELPERS_VERSION,
    dimensions: { on: false, scope: 'selection', edges: true, between: true },
    snap: { on: true, grid: false, points: true, centers: true, edges: true, align: true, gridSize: 10 },
};

export function mergeStoredHelpers(stored: Partial<HelperSwitches>): HelperSwitches {
    const snap = { ...DEFAULT_HELPERS.snap, ...(stored.snap || {}) };
    // stored before version 2: snap "off" was only the old default, not the user's choice
    if ((stored.version || 1) < HELPERS_VERSION) {
        snap.on = DEFAULT_HELPERS.snap.on;
    }
    return {
        version: HELPERS_VERSION,
        dimensions: { ...DEFAULT_HELPERS.dimensions, ...(stored.dimensions || {}) },
        snap,
    };
}
