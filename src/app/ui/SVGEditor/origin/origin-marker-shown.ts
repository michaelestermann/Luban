import { OriginType } from '../../../constants/coordinate';

/**
 * The draggable origin marker belongs to the Design step (page 'editor'); a CNC locking-block origin keeps
 * its picture. Wherever the marker is not shown, the canvas draws its plain origin dot instead, so the
 * origin is visible in every step.
 */
export function originMarkerShown(page: string | null | undefined, originType: OriginType | null | undefined): boolean {
    return page === 'editor' && originType !== undefined && originType !== null && originType !== OriginType.CNCLockingBlock;
}

export interface OriginEditState {
    /** the marker is dragged */
    dragging: boolean;
    /** an origin is previewed (pick-mode hover, dialog ghost) */
    previewing: boolean;
    /** pick mode (⊕ / key 0) */
    picking: boolean;
    dialogOpen: boolean;
    /** the pointer is on the marker (shows that it can be dragged) */
    hovered: boolean;
    /** drawing, measuring, point editing: the marker is only shown */
    locked?: boolean;
}

/**
 * The X / Y arrows of the marker belong to editing the origin; otherwise the marker is the plain red dot
 * (the arrows over the drawing were disturbing).
 */
export function originAxesShown(s: OriginEditState): boolean {
    if (s.locked) {
        return false;
    }
    return s.dragging || s.previewing || s.picking || s.dialogOpen || s.hovered;
}
