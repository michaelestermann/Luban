/**
 * Keyboard mode of the work origin (key 0): arrows walk the 9 points of a frame, Tab / Shift+Tab go to the
 * next / previous owner (selection, object, group, workpiece), Enter sets, Esc cancels. Pure.
 */
import { ObjectReference } from '../../../constants/coordinate';
import { OBJECT_REFERENCE_GRID } from '../../../lib/object-origin';
import { OriginTarget } from '../snap/origin-targets';
import { formatOriginNumber } from './origin-labels';

export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/** The neighbour point in the 3×3 grid; stays at the frame edge. */
export function stepReference(reference: ObjectReference | string, key: ArrowKey): ObjectReference {
    let row = OBJECT_REFERENCE_GRID.findIndex(r => r.includes(reference as ObjectReference));
    if (row === -1) {
        return ObjectReference.Center;
    }
    let col = OBJECT_REFERENCE_GRID[row].indexOf(reference as ObjectReference);
    if (key === 'ArrowUp') {
        row = Math.max(0, row - 1);
    } else if (key === 'ArrowDown') {
        row = Math.min(2, row + 1);
    } else if (key === 'ArrowLeft') {
        col = Math.max(0, col - 1);
    } else if (key === 'ArrowRight') {
        col = Math.min(2, col + 1);
    }
    return OBJECT_REFERENCE_GRID[row][col];
}

/** Tab / Shift+Tab over `count` owners, wrapping; -1 when there are none. */
export function nextTargetGroupIndex(index: number, count: number, backwards: boolean): number {
    if (count <= 0) {
        return -1;
    }
    return ((index + (backwards ? -1 : 1)) % count + count) % count;
}

const ownerKey = (target: OriginTarget): string => {
    const s = target.source;
    switch (s.kind) {
        case 'object':
            return `object:${s.modelID}`;
        case 'group':
            return `group:${s.groupID}`;
        case 'selection':
            return 'selection';
        case 'workpiece':
        default:
            return 'workpiece';
    }
};

/** The targets in groups of 9 per owner, in rank order (selection first, workpiece last). */
export function groupTargetsByOwner(targets: OriginTarget[]): OriginTarget[][] {
    const groups = new Map<string, OriginTarget[]>();
    for (const target of targets) {
        const key = ownerKey(target);
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key).push(target);
    }
    return Array.from(groups.values()).sort((a, b) => a[0].rank - b[0].rank);
}

/** Screen reader text: "Logo, top centre, X 120.0, Y 240.0" (`label` is "Logo · top centre"). */
export function announceTarget(target: OriginTarget, label: string): string {
    return `${label.split(' · ').join(', ')}, X ${formatOriginNumber(target.point.x)}, Y ${formatOriginNumber(target.point.y)}`;
}
