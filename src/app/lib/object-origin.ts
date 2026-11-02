/**
 * Work origin on an object (Laser/CNC): the origin is a point of the bounding box of objects,
 * one of nine (corners, edge middles, centre). Coordinates are model coordinates (mm, y up,
 * relative to the workpiece origin of the canvas).
 */
import { ObjectReference, Origin, OriginType } from '../constants/coordinate';
import { Anchor, AnchorX, AnchorY } from './anchor';

export type BoxLike = {
    min: { x: number; y: number };
    max: { x: number; y: number };
};

export type Point = { x: number; y: number };

/** The references of the 3x3 picker, top row first, left to right. */
export const OBJECT_REFERENCE_GRID: ObjectReference[][] = [
    [ObjectReference.TopLeft, ObjectReference.TopCenter, ObjectReference.TopRight],
    [ObjectReference.CenterLeft, ObjectReference.Center, ObjectReference.CenterRight],
    [ObjectReference.BottomLeft, ObjectReference.BottomCenter, ObjectReference.BottomRight],
];

// fraction of the box (x left to right, y bottom to top) per reference
const FRACTIONS: Record<string, [number, number]> = {};
OBJECT_REFERENCE_GRID.forEach((row, r) => row.forEach((reference, c) => {
    FRACTIONS[reference] = [c / 2, 1 - r / 2];
}));

function isValidBox(box: BoxLike | null | undefined): boolean {
    return !!box && Number.isFinite(box.min.x) && Number.isFinite(box.min.y)
        && Number.isFinite(box.max.x) && Number.isFinite(box.max.y)
        && box.min.x <= box.max.x && box.min.y <= box.max.y;
}

/** min <= max on both axes (a mirrored object has min > max in its SvgModel.boundingBox). */
export function normalizedBox(box: BoxLike): BoxLike {
    return {
        min: { x: Math.min(box.min.x, box.max.x), y: Math.min(box.min.y, box.max.y) },
        max: { x: Math.max(box.min.x, box.max.x), y: Math.max(box.min.y, box.max.y) },
    };
}

export function isObjectReference(reference: string): boolean {
    return Object.prototype.hasOwnProperty.call(FRACTIONS, reference);
}

/** The point of the box a reference names, null for an unknown reference or an empty box. */
export function referencePoint(box: BoxLike | null, reference: string): Point | null {
    if (!isValidBox(box) || !isObjectReference(reference)) {
        return null;
    }
    const [fx, fy] = FRACTIONS[reference];
    return {
        x: box.min.x + (box.max.x - box.min.x) * fx,
        y: box.min.y + (box.max.y - box.min.y) * fy,
    };
}

/** Box around all (non-empty) boxes, null when there is none. */
export function unionBox(boxes: (BoxLike | null)[]): BoxLike | null {
    // a mirrored object (negative scale) has min > max in its SvgModel.boundingBox
    const valid = boxes.filter(Boolean).map(normalizedBox).filter(isValidBox);
    if (!valid.length) {
        return null;
    }
    return {
        min: { x: Math.min(...valid.map(b => b.min.x)), y: Math.min(...valid.map(b => b.min.y)) },
        max: { x: Math.max(...valid.map(b => b.max.x)), y: Math.max(...valid.map(b => b.max.y)) },
    };
}

/** An object origin at a reference point, bound to the objects (by id) when there are any. */
export function createObjectOrigin(reference: ObjectReference | string, modelIDs: string[]): Origin {
    return {
        type: OriginType.Object,
        reference: reference as ObjectReference,
        referenceMetadata: modelIDs.length ? { modelIDs: modelIDs.slice() } : {},
    };
}

/** Ids of the objects an object origin is bound to (empty: not bound). */
export function boundModelIds(origin: Origin | null | undefined): string[] {
    if (!origin || origin.type !== OriginType.Object) {
        return [];
    }
    const ids = (origin.referenceMetadata as { modelIDs?: string[] } | undefined)?.modelIDs;
    return Array.isArray(ids) ? ids : [];
}

/**
 * Box the origin point of an object origin is taken from: the bound objects (the ones that still
 * exist), or when not bound the boxes `allBoxes` gives (laser semantics: all objects of the visible
 * operations). Null for other origins, or when all bound objects are gone (workpiece origin then).
 */
export function objectReferenceBox(
    origin: Origin | null | undefined,
    getBox: (modelID: string) => BoxLike | null,
    allBoxes: () => BoxLike[],
): BoxLike | null {
    if (!origin || origin.type !== OriginType.Object) {
        return null;
    }
    const ids = boundModelIds(origin);
    if (ids.length) {
        return unionBox(ids.map(getBox));
    }
    return unionBox(allBoxes());
}

/** True when the origin is bound to objects and none of them exists any more. */
export function isOriginBoundToMissingObject(origin: Origin | null | undefined, exists: (modelID: string) => boolean): boolean {
    const ids = boundModelIds(origin);
    return ids.length > 0 && !ids.some(exists);
}

/**
 * Origin for the 3D preview plate, which places the workpiece by its reference: an object origin
 * keeps the workpiece where the canvas coordinate mode puts it.
 */
export function plateOrigin(origin: Origin, coordinateModeValue: string): Origin {
    if (!origin || origin.type !== OriginType.Object || !coordinateModeValue) {
        return origin;
    }
    return {
        type: OriginType.Workpiece,
        reference: coordinateModeValue as ObjectReference,
        referenceMetadata: {},
    };
}

/**
 * The workpiece (stock of the simulation) in G-code coordinates: placed by the coordinate mode
 * (`sizeMultiplyFactor`), relative to an object origin point (model coordinates) when there is one.
 */
export function stockBoundary(
    size: { x: number; y: number },
    sizeMultiplyFactor: { x: number; y: number },
    originPoint: Point | null,
): { minX: number; maxX: number; minY: number; maxY: number } {
    const dx = (size.x / 2) * sizeMultiplyFactor.x - (originPoint ? originPoint.x : 0);
    const dy = (size.y / 2) * sizeMultiplyFactor.y - (originPoint ? originPoint.y : 0);
    return {
        minX: -size.x / 2 + dx,
        maxX: size.x / 2 + dx,
        minY: -size.y / 2 + dy,
        maxY: size.y / 2 + dy,
    };
}

const LASER_JOB_SETUP_REFERENCES: string[] = [
    ObjectReference.Center, ObjectReference.TopLeft, ObjectReference.TopRight, ObjectReference.BottomLeft, ObjectReference.BottomRight,
];

/**
 * Whether an origin is remembered as the default for new projects. An origin on certain objects
 * belongs to its project (it is saved with it), so are CNC object origins and laser ones the laser
 * job setup does not offer.
 */
export function rememberOrigin(headType: string, origin: Origin): boolean {
    if (origin.type !== OriginType.Object) {
        return true;
    }
    const metadata = origin.referenceMetadata || {};
    if (headType !== 'laser' || boundModelIds(origin).length || metadata.groupID || metadata.workpiece) {
        return false;
    }
    return LASER_JOB_SETUP_REFERENCES.includes(origin.reference);
}

const ANCHOR_XS: AnchorX[] = ['left', 'center', 'right'];
const ANCHOR_YS: AnchorY[] = ['top', 'middle', 'bottom'];

/** The reference of a picker handle (anchor). */
export function anchorReference(anchor: Anchor): ObjectReference {
    return OBJECT_REFERENCE_GRID[ANCHOR_YS.indexOf(anchor.y)][ANCHOR_XS.indexOf(anchor.x)];
}

/** The picker handle (anchor) of a reference, null when it is not an object reference. */
export function referenceAnchor(reference: string): Anchor | null {
    for (let r = 0; r < 3; r++) {
        const c = OBJECT_REFERENCE_GRID[r].indexOf(reference as ObjectReference);
        if (c !== -1) {
            return { x: ANCHOR_XS[c], y: ANCHOR_YS[r] };
        }
    }
    return null;
}
