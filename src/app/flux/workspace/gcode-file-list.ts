const MAX_GCODE_FILES = 10;

type GcodeFileEntry = { uploadName?: string; renderGcodeFileName?: string; name?: string; isRenaming?: boolean; newName?: string };

/**
 * Put a G-code file at the top of the workspace list. Entries with the same upload name
 * or the same display name are replaced, so a regenerated file never sits next to its
 * stale predecessor.
 */
export const mergeGcodeFileList = <T extends GcodeFileEntry>(existing: T[], fileInfo: T, cap = MAX_GCODE_FILES): T[] => {
    const isReplaced = (file: T) => file.uploadName === fileInfo.uploadName
        || (!!fileInfo.renderGcodeFileName && file.renderGcodeFileName === fileInfo.renderGcodeFileName);
    const added = { ...fileInfo, isRenaming: false, newName: fileInfo.name };
    return [added, ...existing.filter(file => !isReplaced(file))].slice(0, cap);
};

/**
 * Loading the files of a multi-tool job: only file 1 is previewed and becomes the active
 * file; the others only go into the list (last first, so file 1 ends on top). Previewing
 * all of them in parallel would leave whichever finished last as the active, runnable file.
 */
export const planWorkspaceLoad = <T>(files: T[]): { listOnly: T[], active: T } => ({
    listOnly: files.slice(1).reverse(),
    active: files[0]
});

/** Drop files of an earlier generation of the same job, so no stale file can be run. */
export const removeJobFiles = <T extends { jobName?: string }>(files: T[], jobName: string | undefined): T[] => {
    if (!jobName) {
        return files;
    }
    return files.filter(file => file.jobName !== jobName);
};
