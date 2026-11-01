/**
 * After all toolpath renders of a "generate toolpaths" run have ended: did the run
 * reach the G-code step? Anything else must end the progress as failed, never leave it
 * waiting (nothing else will move it on).
 *
 * @param rendered  one entry per started render: true = rendered
 * @param ready     all visible toolpaths are generated (G-code generation was triggered)
 */
export const renderRunFailed = (rendered: boolean[], ready: boolean): boolean => {
    if (rendered.length === 0) {
        // no toolpath of the result is known any more (or none had files)
        return true;
    }
    if (rendered.some(ok => !ok)) {
        return true;
    }
    return !ready;
};
