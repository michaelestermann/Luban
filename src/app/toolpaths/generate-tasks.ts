type ToolPathLike = { id: string; visible: boolean };

/**
 * Generate tasks for all visible toolpaths. Toolpaths that yield no task (no visible
 * models, already generated, or failed) are skipped.
 */
export const buildGenerateToolPathTasks = <T extends object>(
    toolPaths: ToolPathLike[],
    getTask: (toolPathId: string) => T | null,
    identifier: string | undefined
): Array<T & { identifier: string | undefined }> => {
    return toolPaths
        .filter(toolPath => toolPath.visible)
        .map(toolPath => getTask(toolPath.id))
        .filter(task => !!task)
        // TODO: This hardcode is used for backward compatibility of Snapmaker Original, remove this later.
        .map(task => ({ ...task, identifier }));
};
