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
