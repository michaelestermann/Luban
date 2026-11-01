/**
 * Work origin model (Luban 4.17 "Kombination A+B"): one `Origin` for the canvas marker, the dialog, the
 * tool paths and the G-code. An object origin is bound to objects (`modelIDs`), a group frame (`groupID`
 * plus its member ids as fallback) or a point of the workpiece frame (`workpiece`); every origin may carry
 * an `offset` (mm) applied after its reference point. Pure functions, model coordinates (mm, y up).
 */
import { ObjectReference, Origin, OriginOffset, OriginReferenceMetadata, OriginType } from '../constants/coordinate';
import { BoxLike, Point, boundModelIds, isObjectReference, objectReferenceBox, referencePoint, unionBox } from './object-origin';

export type OriginContext = {
    getBox: (modelID: string) => BoxLike | null;
    /** null: the group is gone */
    getGroupMemberIds: (groupID: string) => string[] | null;
    allBoxes: () => BoxLike[];
    /** model coordinates */
    workpieceBox: BoxLike | null;
};

const ZERO: OriginOffset = { x: 0, y: 0 };

function finiteOffset(raw: unknown): OriginOffset | null {
    const o = raw as { x?: unknown; y?: unknown } | null | undefined;
    if (!o || typeof o !== 'object' || typeof o.x !== 'number' || typeof o.y !== 'number' || !Number.isFinite(o.x) || !Number.isFinite(o.y)) {
        return null;
    }
    return { x: o.x, y: o.y };
}

const isZero = (o: OriginOffset | null): boolean => !o || (o.x === 0 && o.y === 0);

/** The offset of an origin, {0,0} when it has none (or an invalid one). */
export function originOffset(origin: Origin | null | undefined): OriginOffset {
    return finiteOffset(origin?.referenceMetadata?.offset) || { ...ZERO };
}

/** A new origin with this offset; a zero or null offset removes the key. The input is not changed. */
export function withOffset(origin: Origin, offset: OriginOffset | null): Origin {
    const metadata: OriginReferenceMetadata = { ...(origin.referenceMetadata || {}) };
    delete metadata.offset;
    if (offset && !isZero(offset)) {
        metadata.offset = { x: offset.x, y: offset.y };
    }
    return { ...origin, referenceMetadata: metadata };
}

/** An origin on the frame of a group; the member ids are stored too (ungroup, undo, 4.16). */
export function createGroupOrigin(reference: ObjectReference | string, groupID: string, memberIDs: string[]): Origin {
    return {
        type: OriginType.Object,
        reference: reference as ObjectReference,
        referenceMetadata: { groupID, modelIDs: memberIDs.slice() },
    };
}

/** An origin on one of the 9 points of the workpiece frame (not the zero of the coordinate mode). */
export function createWorkpieceFrameOrigin(reference: ObjectReference | string): Origin {
    return { type: OriginType.Object, reference: reference as ObjectReference, referenceMetadata: { workpiece: true } };
}

/** The workpiece origin of the coordinate mode. */
export function workpieceOrigin(coordinateModeValue: string): Origin {
    return { type: OriginType.Workpiece, reference: coordinateModeValue as ObjectReference, referenceMetadata: {} };
}

/** A free origin: the workpiece origin of the coordinate mode moved by an offset (does not follow objects). */
export function createFreeOrigin(coordinateModeValue: string, offset: OriginOffset): Origin {
    return withOffset(workpieceOrigin(coordinateModeValue), offset);
}

export function boundGroupId(origin: Origin | null | undefined): string | null {
    const id = origin?.type === OriginType.Object ? origin.referenceMetadata?.groupID : null;
    return typeof id === 'string' && id ? id : null;
}

export function isWorkpieceFrameOrigin(origin: Origin | null | undefined): boolean {
    return origin?.type === OriginType.Object && origin.referenceMetadata?.workpiece === true;
}

/**
 * The box the reference point of an object origin is taken from: the workpiece frame, the live members
 * of a group (else its stored ids), the bound objects, or (unbound) all boxes. Null for other origins.
 */
export function resolveReferenceBox(origin: Origin | null | undefined, ctx: OriginContext): BoxLike | null {
    if (!origin || origin.type !== OriginType.Object) {
        return null;
    }
    if (isWorkpieceFrameOrigin(origin)) {
        return ctx.workpieceBox ? unionBox([ctx.workpieceBox]) : null;
    }
    const groupID = boundGroupId(origin);
    if (groupID) {
        const members = ctx.getGroupMemberIds(groupID);
        const ids = members && members.length ? members : boundModelIds(origin);
        return ids.length ? unionBox(ids.map(ctx.getBox)) : null;
    }
    return objectReferenceBox(origin, ctx.getBox, ctx.allBoxes);
}

/**
 * The G-code zero in model coordinates: reference point + offset for object origins (null when the bound
 * objects are gone, the offset goes with them), the offset for workpiece origins (null when zero), null
 * for the CNC locking block. Null means the canvas zero of the coordinate mode.
 */
export function originShift(origin: Origin | null | undefined, ctx: OriginContext): Point | null {
    if (!origin) {
        return null;
    }
    const offset = originOffset(origin);
    if (origin.type === OriginType.Object) {
        const point = referencePoint(resolveReferenceBox(origin, ctx), origin.reference);
        return point ? { x: point.x + offset.x, y: point.y + offset.y } : null;
    }
    if (origin.type === OriginType.Workpiece) {
        return isZero(offset) ? null : offset;
    }
    return null;
}

/** The workpiece in model coordinates (the coordinate mode places it with `sizeMultiplyFactor`). */
export function workpieceModelBox(coordinateSize: { x: number; y: number }, factor: { x: number; y: number }): BoxLike | null {
    if (!coordinateSize || !factor || !(coordinateSize.x > 0) || !(coordinateSize.y > 0)) {
        return null;
    }
    const cx = (coordinateSize.x / 2) * factor.x;
    const cy = (coordinateSize.y / 2) * factor.y;
    // + 0 turns -0 into 0
    return {
        min: { x: cx - coordinateSize.x / 2 + 0, y: cy - coordinateSize.y / 2 + 0 },
        max: { x: cx + coordinateSize.x / 2 + 0, y: cy + coordinateSize.y / 2 + 0 },
    };
}

const WORKPIECE_REFERENCES = ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'front-center', 'front-top'];

/**
 * An origin read from a project (or the machine store): unknown types and references give `fallback`;
 * metadata keeps only valid `modelIDs`, `groupID`, `workpiece` and a non-zero finite `offset`. A 4.16
 * origin passes unchanged.
 */
export function normalizeOrigin(raw: unknown, fallback: Origin): Origin {
    const o = raw as { type?: unknown; reference?: unknown; referenceMetadata?: Record<string, unknown> } | null;
    if (!o || typeof o !== 'object' || typeof o.reference !== 'string') {
        return fallback;
    }
    const { type, reference } = o;
    if (type === OriginType.Object) {
        if (!isObjectReference(reference)) {
            return fallback;
        }
    } else if (type === OriginType.Workpiece || type === OriginType.CNCLockingBlock) {
        if (!WORKPIECE_REFERENCES.includes(reference) && !isObjectReference(reference)) {
            return fallback;
        }
    } else {
        return fallback;
    }
    const meta = (o.referenceMetadata && typeof o.referenceMetadata === 'object' ? o.referenceMetadata : {}) as Record<string, unknown>;
    const metadata: OriginReferenceMetadata = {};
    if (Array.isArray(meta.modelIDs)) {
        metadata.modelIDs = (meta.modelIDs as unknown[]).filter((id): id is string => typeof id === 'string');
    }
    if (typeof meta.groupID === 'string' && meta.groupID) {
        metadata.groupID = meta.groupID;
    }
    if (meta.workpiece === true) {
        metadata.workpiece = true;
    }
    const offset = finiteOffset(meta.offset);
    if (offset && !isZero(offset)) {
        metadata.offset = offset;
    }
    return { type: type as OriginType, reference: reference as ObjectReference, referenceMetadata: metadata };
}

const sortedIds = (origin: Origin): string => boundModelIds(origin).slice().sort().join('\u0000');

/** Same origin: type, reference, binding (ids in any order), workpiece flag and offset. */
export function sameOrigin(a: Origin | null | undefined, b: Origin | null | undefined): boolean {
    if (!a || !b) {
        return !a && !b;
    }
    const oa = originOffset(a);
    const ob = originOffset(b);
    return a.type === b.type
        && a.reference === b.reference
        && boundGroupId(a) === boundGroupId(b)
        && isWorkpieceFrameOrigin(a) === isWorkpieceFrameOrigin(b)
        && sortedIds(a) === sortedIds(b)
        && oa.x === ob.x && oa.y === ob.y;
}

/** A drop (or pick) on a frame point: the target without offset, and the offset that was removed. */
export function originAfterDrop(before: Origin | null | undefined, target: Origin): { origin: Origin; removedOffset: OriginOffset | null } {
    const removed = before ? originOffset(before) : null;
    return { origin: withOffset(target, null), removedOffset: isZero(removed) ? null : removed };
}

/** The origin after `groupID` was ungrouped: bound to its former members (offset kept); null when not on that group. */
export function rebindOnUngroup(origin: Origin, groupID: string, memberIDs: string[]): Origin | null {
    if (boundGroupId(origin) !== groupID) {
        return null;
    }
    const metadata: OriginReferenceMetadata = { ...origin.referenceMetadata, modelIDs: memberIDs.slice() };
    delete metadata.groupID;
    return { ...origin, referenceMetadata: metadata };
}

/** Whether a point lies outside the workpiece (the edges are inside). */
export function isOutsideWorkpiece(point: Point | null, workpieceBox: BoxLike | null): boolean {
    if (!point || !workpieceBox) {
        return false;
    }
    const eps = 1e-6;
    return point.x < workpieceBox.min.x - eps || point.x > workpieceBox.max.x + eps
        || point.y < workpieceBox.min.y - eps || point.y > workpieceBox.max.y + eps;
}

/** The job box relative to the origin (G-code extents). */
export function extentFromOrigin(jobBox: BoxLike | null, zero: Point): { minX: number; maxX: number; minY: number; maxY: number } | null {
    if (!jobBox || !zero) {
        return null;
    }
    return {
        minX: jobBox.min.x - zero.x,
        maxX: jobBox.max.x - zero.x,
        minY: jobBox.min.y - zero.y,
        maxY: jobBox.max.y - zero.y,
    };
}
