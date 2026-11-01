/**
 * Snap targets of the work origin: the 9 frame points of every visible object, the selection frame, group
 * frames and the workpiece, tagged with what they bind to. Boxes are model bounding boxes (the ones the
 * tool paths use), so the marker always equals the G-code zero. Pure; model coordinates (mm, y up).
 */
import { ObjectReference, Origin } from '../../../constants/coordinate';
import { BoxLike, OBJECT_REFERENCE_GRID, Point, createObjectOrigin, referencePoint } from '../../../lib/object-origin';
import { createGroupOrigin, createWorkpieceFrameOrigin, workpieceOrigin } from '../../../lib/work-origin';

/** snapping reach in screen pixels (same as the snap engine) */
export const ORIGIN_SNAP_PX = 8;

export type OriginTargetSource =
    | { kind: 'selection'; modelIDs: string[] }
    | { kind: 'object'; modelID: string; selected: boolean }
    | { kind: 'group'; groupID: string; memberIDs: string[]; selected: boolean }
    | { kind: 'workpiece' };

export interface OriginTarget {
    /** model mm, y up */
    point: Point;
    reference: ObjectReference;
    source: OriginTargetSource;
    /** ORIGIN_TARGET_RANK: lower wins on coincident points */
    rank: number;
    /** object / group name; '' for selection / workpiece (the label adds the kind) */
    name: string;
    /** single object or group, for the rotated note */
    rotationZ?: number;
}

export const ORIGIN_TARGET_RANK = { selection: 0, selectedObject: 1, group: 2, object: 3, workpiece: 4 };

export interface OriginTargetInput {
    objects: { modelID: string; name: string; box: BoxLike | null; visible: boolean; selected: boolean; groupID: string | null; rotationZ?: number }[];
    groups: { groupID: string; name: string; memberIDs: string[]; box: BoxLike | null; selected: boolean; rotationZ?: number }[];
    selection: { modelIDs: string[]; groupID: string | null; box: BoxLike | null } | null;
    workpiece: BoxLike | null;
    /** Ctrl held: the members of groups are targets too */
    insideGroups: boolean;
}

const REFERENCES: ObjectReference[] = ([] as ObjectReference[]).concat(...OBJECT_REFERENCE_GRID);

function frameTargets(box: BoxLike | null, source: OriginTargetSource, rank: number, name: string, rotationZ?: number): OriginTarget[] {
    if (!box) {
        return [];
    }
    const out: OriginTarget[] = [];
    for (const reference of REFERENCES) {
        const point = referencePoint(box, reference);
        if (point) {
            const target: OriginTarget = { point, reference, source, rank, name };
            if (rotationZ !== undefined) {
                target.rotationZ = rotationZ;
            }
            out.push(target);
        }
    }
    return out;
}

/** All targets: selection frame (2+ objects), groups, objects (members only inside groups), workpiece. */
export function buildOriginTargets(input: OriginTargetInput): OriginTarget[] {
    const targets: OriginTarget[] = [];
    const sel = input.selection;
    if (sel && !sel.groupID && sel.modelIDs.length > 1) {
        targets.push(...frameTargets(sel.box, { kind: 'selection', modelIDs: sel.modelIDs.slice() }, ORIGIN_TARGET_RANK.selection, ''));
    }
    for (const group of input.groups) {
        const rank = group.selected ? ORIGIN_TARGET_RANK.selection : ORIGIN_TARGET_RANK.group;
        const source: OriginTargetSource = { kind: 'group', groupID: group.groupID, memberIDs: group.memberIDs.slice(), selected: group.selected };
        targets.push(...frameTargets(group.box, source, rank, group.name, group.rotationZ));
    }
    for (const object of input.objects) {
        if (!object.visible || (object.groupID && !input.insideGroups)) {
            continue;
        }
        const rank = object.selected ? ORIGIN_TARGET_RANK.selectedObject : ORIGIN_TARGET_RANK.object;
        const source: OriginTargetSource = { kind: 'object', modelID: object.modelID, selected: object.selected };
        targets.push(...frameTargets(object.box, source, rank, object.name, object.rotationZ));
    }
    targets.push(...frameTargets(input.workpiece, { kind: 'workpiece' }, ORIGIN_TARGET_RANK.workpiece, ''));
    return targets;
}

/**
 * The 9 points pick mode shows: the selection frame (2+ objects), else the selected group, else the one
 * selected object.
 */
export function selectionTargets(targets: OriginTarget[]): OriginTarget[] {
    const selection = targets.filter(t => t.source.kind === 'selection');
    if (selection.length) {
        return selection;
    }
    const group = targets.filter(t => t.source.kind === 'group' && t.source.selected);
    if (group.length) {
        return group;
    }
    return targets.filter(t => t.source.kind === 'object' && t.source.selected);
}

const TIE_MM = 1e-6;

/** The nearest target within `tolerance` (mm); on coincident points the lower rank wins. */
export function pickOriginTarget(targets: OriginTarget[], p: Point, tolerance: number): OriginTarget | null {
    let best: OriginTarget | null = null;
    let bestD = Infinity;
    for (const target of targets) {
        const d = Math.hypot(target.point.x - p.x, target.point.y - p.y);
        if (d > tolerance) {
            continue;
        }
        if (!best || d < bestD - TIE_MM || (Math.abs(d - bestD) <= TIE_MM && target.rank < best.rank)) {
            best = target;
            bestD = d;
        }
    }
    return best;
}

/**
 * The origin a target sets. A workpiece point at the zero of the coordinate mode is the plain workpiece
 * origin; other workpiece points are object origins on the workpiece frame.
 */
export function targetOrigin(target: OriginTarget, coordinateModeValue: string): Origin {
    const source = target.source;
    switch (source.kind) {
        case 'object':
            return createObjectOrigin(target.reference, [source.modelID]);
        case 'selection':
            return createObjectOrigin(target.reference, source.modelIDs);
        case 'group':
            return createGroupOrigin(target.reference, source.groupID, source.memberIDs);
        case 'workpiece':
        default:
            if (Math.abs(target.point.x) < TIE_MM && Math.abs(target.point.y) < TIE_MM) {
                return workpieceOrigin(coordinateModeValue);
            }
            return createWorkpieceFrameOrigin(target.reference);
    }
}

/** Model (y up, zero of the coordinate mode) to canvas (SVG content, y down). */
export function modelToCanvas(p: Point, size: { x: number; y: number }): Point {
    return { x: p.x + size.x, y: size.y - p.y };
}

export function canvasToModel(p: Point, size: { x: number; y: number }): Point {
    return { x: p.x - size.x, y: size.y - p.y };
}

/** The snapping reach in mm at this zoom (`ctmA` = screen px per canvas unit). */
export function originTolerance(ctmA: number): number {
    return ORIGIN_SNAP_PX / Math.abs(ctmA || 1);
}
