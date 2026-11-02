import { OriginType } from '../../../constants/coordinate';

/**
 * The draggable origin marker belongs to the Design step (page 'editor'); a CNC locking-block origin keeps
 * its picture. Wherever the marker is not shown, the canvas draws its plain origin dot instead, so the
 * origin is visible in every step.
 */
export function originMarkerShown(page: string | null | undefined, originType: OriginType | null | undefined): boolean {
    return page === 'editor' && originType !== undefined && originType !== null && originType !== OriginType.CNCLockingBlock;
}
