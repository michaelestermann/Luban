/**
 * Socket events are sent 200 ms late (a workaround from Luban 4.3, no reason recorded).
 * Commits and cancels of server tasks (toolpaths, G-code, image processing, ...) are plain
 * requests answered by task events: they are sent at once, the delay was most of the wait
 * for a toolpath or G-code generation.
 */
const EMIT_DELAY = 200;

export const emitDelay = (event: string): number => {
    return /^task(Commit|Cancel):/.test(event) ? 0 : EMIT_DELAY;
};
