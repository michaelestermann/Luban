/**
 * Showing very small objects on the 2D canvas (e.g. the 0.2 mm drill holes of a decomposed PCB file).
 * Display only: nothing here changes the size, position or tool path of an object.
 */

/**
 * An SVG image box (canvas user units, mm) with a side below this is not drawn by Chromium when the image
 * keeps its default fit (preserveAspectRatio xMidYMid meet): a 0.2 mm part showed nothing at any zoom.
 */
export const TINY_IMAGE_SIZE = 1;

/**
 * Objects smaller than this on the screen (CSS px, both sides) get an outline: their own drawing is a few
 * pixels or less (or nothing) there, and its stroke is cut off at the object frame.
 */
export const MARKER_MIN_SIZE = 4;

/** The outline is never smaller than this on the screen (CSS px), so an object is seen at every zoom. */
export const MARKER_MIN_DIAMETER = 2;

/**
 * The preserveAspectRatio for the canvas <image> of an SVG model of this size: 'none' for a tiny box (it
 * is drawn when stretched; the box has the aspect ratio of the SVG, so stretching changes nothing), null to
 * keep the default fit.
 */
export function svgImageFit(width: number, height: number): 'none' | null {
    const w = Math.abs(width);
    const h = Math.abs(height);
    if (!(w > 0) || !(h > 0)) {
        return null;
    }
    return Math.min(w, h) < TINY_IMAGE_SIZE ? 'none' : null;
}

export interface ScreenBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface SmallObjectMarker {
    // index of the box in the input
    index: number;
    // centre on the screen
    x: number;
    y: number;
    // radii of the outline: the object's own size, at least MARKER_MIN_DIAMETER across
    rx: number;
    ry: number;
}

/**
 * Outlines for the objects that are too small to be seen on the screen (both sides below `minSize`): an
 * ellipse in the box of the object, its true size but never smaller than MARKER_MIN_DIAMETER. Missing
 * boxes are skipped.
 */
export function smallObjectMarkers(boxes: Array<ScreenBox | null | undefined>, minSize = MARKER_MIN_SIZE): SmallObjectMarker[] {
    const markers: SmallObjectMarker[] = [];
    boxes.forEach((box, index) => {
        if (!box || !(Math.max(box.width, box.height) < minSize)) {
            return;
        }
        markers.push({
            index,
            x: box.x + box.width / 2,
            y: box.y + box.height / 2,
            rx: Math.max(box.width, MARKER_MIN_DIAMETER) / 2,
            ry: Math.max(box.height, MARKER_MIN_DIAMETER) / 2
        });
    });
    return markers;
}
