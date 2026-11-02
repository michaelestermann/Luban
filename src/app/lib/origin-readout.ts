/**
 * Position & Size readout (Laser/CNC): the X / Y of the selection's anchor point measured from the work
 * origin, exactly as the G-code will have that point. Model coordinates (mm, y up); the G-code is the model
 * translated by the work origin point (`originShift` of lib/work-origin, null: the canvas zero of the
 * coordinate mode), with the same axis directions in every coordinate mode.
 */
import { Origin, OriginType } from '../constants/coordinate';
import { Anchor } from './anchor';
import { BoxLike, Point, anchorReference, boundModelIds, normalizedBox, referencePoint } from './object-origin';
import { boundGroupId, isWorkpieceFrameOrigin } from './work-origin';

/** The anchor (picker handle) point of the selection's axis-aligned frame, null without a frame. */
export function anchorPoint(frame: BoxLike | null, anchor: Anchor): Point | null {
    return frame ? referencePoint(normalizedBox(frame), anchorReference(anchor)) : null;
}

/** The anchor point relative to the work origin (`zero`, model mm; null: the canvas zero) = its G-code X / Y. */
export function originRelativePosition(frame: BoxLike | null, anchor: Anchor, zero: Point | null): Point | null {
    const point = anchorPoint(frame, anchor);
    if (!point) {
        return null;
    }
    // + 0 turns -0 into 0
    return { x: point.x - (zero ? zero.x : 0) + 0, y: point.y - (zero ? zero.y : 0) + 0 };
}

/** How far to move the selection (model mm, one axis) so that the anchor reads `typed` instead of `shown`. */
export function moveDeltaForValue(shown: number, typed: number): number {
    return typed - shown;
}

/** One decimal like the other fields, without "-0.0". */
export function formatReadout(value: number): string {
    const text = (Math.round(value * 10) / 10).toFixed(1);
    return text === '-0.0' ? '0.0' : text;
}

/**
 * Why the selection carries the work origin (moving it moves the origin too, so its X / Y from the origin
 * cannot be set):
 * - `self`: the origin is on exactly the selected objects (object, group or selection frame);
 * - `group`: on the group that contains the selection;
 * - `frame`: on a frame of several objects that contains the selection;
 * - `part`: on objects of the selection (the selection holds them and more, or overlaps them).
 * null: the X / Y can be set (workpiece, workpiece-frame and free origins, other objects).
 */
export type OriginCarry = 'self' | 'group' | 'frame' | 'part' | null;

export interface CarryContext {
    /** null: the group is gone */
    getGroupMemberIds: (groupID: string) => string[] | null;
    /** objects of the visible operations (the frame of an unbound "all objects" origin) */
    jobModelIds: () => string[];
}

/** `selected`: the leaf objects of the selection (the members of a selected group). */
export function originCarriedBySelection(origin: Origin | null | undefined, selected: string[], ctx: CarryContext): OriginCarry {
    if (!origin || origin.type !== OriginType.Object || isWorkpieceFrameOrigin(origin) || !selected.length) {
        return null;
    }
    const groupID = boundGroupId(origin);
    let reference = boundModelIds(origin);
    if (groupID) {
        const members = ctx.getGroupMemberIds(groupID);
        if (members && members.length) {
            reference = members;
        }
    }
    const bound = reference.length > 0;
    if (!bound) {
        reference = ctx.jobModelIds();
    }
    if (!reference.length) {
        return null;
    }
    const ref = new Set(reference);
    const sel = new Set(selected);
    const shared = [...sel].filter(id => ref.has(id)).length;
    const selectionHoldsAll = [...ref].every(id => sel.has(id));
    if (!bound) {
        // the frame of all objects only follows the selection when every one of them is selected
        if (!selectionHoldsAll) {
            return null;
        }
        return sel.size === ref.size ? 'self' : 'part';
    }
    if (!shared) {
        return null;
    }
    if (selectionHoldsAll && sel.size === ref.size) {
        return 'self';
    }
    if (shared === sel.size) {
        return groupID ? 'group' : 'frame';
    }
    return 'part';
}
