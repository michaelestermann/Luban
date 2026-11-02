export interface BoxSelectPointer {
    mode: string;
    /** the left button is held (event.which === 1) */
    leftButton: boolean;
    /** a path is being edited (point editing) */
    editing: boolean;
    /** the selection box was started by a mousedown on the empty canvas */
    selectorVisible: boolean;
}

/**
 * Whether a pointer move updates the box selection. A drag that started outside the canvas (the origin
 * marker, the object list) also reaches the canvas with the left button held; it must not select by a
 * stale box.
 */
export function isBoxSelecting({ mode, leftButton, editing, selectorVisible }: BoxSelectPointer): boolean {
    return mode === 'select' && leftButton && !editing && selectorVisible;
}
