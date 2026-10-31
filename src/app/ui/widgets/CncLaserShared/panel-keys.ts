/**
 * Esc / Enter of the Offset and Array values act only while their panel is the active mode: open, in
 * the select mode and no path is point edited (then Measure and point editing get these keys).
 */
export function panelKeysActive(open: boolean, canvasMode: string | undefined, editing: boolean): boolean {
    return open && canvasMode === 'select' && !editing;
}
