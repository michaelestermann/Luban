export type AnchorX = 'left' | 'center' | 'right';
export type AnchorY = 'top' | 'middle' | 'bottom';

export interface Anchor {
    x: AnchorX;
    y: AnchorY;
}

export const ANCHOR_XS: AnchorX[] = ['left', 'center', 'right'];
export const ANCHOR_YS: AnchorY[] = ['top', 'middle', 'bottom'];

export const DEFAULT_ANCHOR: Anchor = { x: 'left', y: 'bottom' };

/**
 * Offset of the anchor from the selection centre, in logical (Y up) units.
 */
export function anchorOffset(anchor: Anchor, size: { width: number; height: number }): { dx: number; dy: number } {
    let dx = 0;
    let dy = 0;
    if (anchor.x === 'left') dx = -size.width / 2;
    else if (anchor.x === 'right') dx = size.width / 2;
    if (anchor.y === 'bottom') dy = -size.height / 2;
    else if (anchor.y === 'top') dy = size.height / 2;
    return { dx, dy };
}

const X_LABEL = { left: 'left', center: 'centre', right: 'right' };
const Y_LABEL = { top: 'Top', middle: 'Middle', bottom: 'Bottom' };

export function anchorName(anchor: Anchor): string {
    if (anchor.x === 'center' && anchor.y === 'middle') {
        return 'Centre';
    }
    return `${Y_LABEL[anchor.y]} ${X_LABEL[anchor.x]}`;
}
