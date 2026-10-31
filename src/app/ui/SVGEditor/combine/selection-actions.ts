/**
 * Which shape actions fit the selection (Combine, Offset, Array). The selection bar and the context menu
 * ask on every render, so the answer is computed once per selection and render timestamp: one layer
 * order sort with an index map, and the closed state of each path is cached by its d.
 */
import { arraySelection } from './array-model';
import { combinableFrom, offsetFrom, selectedInLayerOrder, SelectionGroup } from './model-outline';

export interface SelectionActionState {
    combine: boolean;
    offset: boolean;
    array: boolean;
}

const NONE: SelectionActionState = { combine: false, offset: false, array: false };

// last answer per model group (laser and CNC have their own)
const last = new WeakMap<object, { selected: unknown[]; stamp: unknown; state: SelectionActionState }>();

/* eslint-disable @typescript-eslint/no-explicit-any */
export function selectionActionState(modelGroup: any, stamp: unknown): SelectionActionState {
    if (!modelGroup) {
        return NONE;
    }
    const selected = modelGroup.getSelectedModelArray?.() || [];
    const cached = last.get(modelGroup);
    if (cached && cached.selected === selected && cached.stamp === stamp) {
        return cached.state;
    }
    let state = NONE;
    if (selected.length > 0) {
        const ordered = selectedInLayerOrder(modelGroup as SelectionGroup);
        state = {
            combine: combinableFrom(ordered, modelGroup).length >= 2,
            offset: offsetFrom(ordered).length > 0,
            array: !!arraySelection(modelGroup),
        };
    }
    last.set(modelGroup, { selected, stamp, state });
    return state;
}
