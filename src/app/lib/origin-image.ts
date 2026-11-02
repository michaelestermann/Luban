const PICTURED = ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'];

/**
 * The Job Setup picture of a 3-axis origin point. Only the corners and the centre have their own picture;
 * the mid-edge points of an object origin (e.g. 'center-left') show the plain workpiece.
 */
export function originImage(reference: string | null | undefined): string {
    const name = reference && PICTURED.includes(reference) ? `working-origin-3-${reference}` : 'working-origin-3';
    return `/resources/images/cnc-laser/${name}.png`;
}
