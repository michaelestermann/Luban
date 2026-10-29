type TFileResult = { gcodeFile: Record<string, unknown>, filePath: string, toolPathIds?: string[] };

/**
 * G-code task result with the header of every generated file parsed.
 * `gcodeFile` stays the first file, as before multi-tool CNC jobs.
 */
export const taskGcodeFiles = (
    res: TFileResult & { files?: TFileResult[] },
    parseHeader: (filePath: string) => unknown
) => {
    const files = res.files?.length ? res.files : [res];
    const gcodeFiles = files.map(file => ({
        ...file.gcodeFile,
        header: parseHeader(file.filePath),
        ...(file.toolPathIds ? { toolPathIds: file.toolPathIds } : {})
    }));
    const gcodeFile = { ...files[0].gcodeFile, header: gcodeFiles[0].header };
    return { gcodeFile, gcodeFiles };
};
