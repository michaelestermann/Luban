type Point = { x?: number | string; y?: number | string };
type Range = { min?: Point; max?: Point };

export type GcodeJobFile = {
    index?: number;
    estimatedTime?: number;
    boundingBox?: Range | null;
    // header range of the file (strings from the G-code header)
    gcodeAxisWorkRange?: Range | null;
    // eslint-disable-next-line camelcase
    is_rotate?: boolean;
};

export type WorkArea = { width: number; height: number };

export type GcodeJobSummary = {
    // seconds; null when no file has a known estimated time
    totalTime: number | null;
    fileCount: number;
    toolChanges: number;
    // numbers of the files that need a tool change (and a new Z zero) before they run
    toolChangeBeforeFiles: number[];
    workArea: WorkArea | null;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

const toRect = (range: Range | null | undefined) => {
    if (!range?.min || !range?.max) {
        return null;
    }
    const rect = {
        minX: Number(range.min.x),
        minY: Number(range.min.y),
        maxX: Number(range.max.x),
        maxY: Number(range.max.y),
    };
    const finite = Object.values(rect).every(Number.isFinite);
    return finite && rect.maxX >= rect.minX && rect.maxY >= rect.minY ? rect : null;
};

/**
 * Work area (X × Y) of a job: union of the files' bounding boxes, else of their G-code
 * header ranges. Rotary jobs have no flat work area (null).
 */
export const getWorkArea = (files: GcodeJobFile[]): WorkArea | null => {
    if (files.some(file => file.is_rotate)) {
        return null;
    }
    const rects = files
        .map(file => toRect(file.boundingBox) || toRect(file.gcodeAxisWorkRange))
        .filter(Boolean);
    if (rects.length === 0) {
        return null;
    }
    const minX = Math.min(...rects.map(rect => rect.minX));
    const minY = Math.min(...rects.map(rect => rect.minY));
    const maxX = Math.max(...rects.map(rect => rect.maxX));
    const maxY = Math.max(...rects.map(rect => rect.maxY));
    return { width: round1(maxX - minX), height: round1(maxY - minY) };
};

/**
 * Job summary of the G-code step. CNC jobs with several tools have one file per tool run,
 * so every file after the first needs a tool change; laser jobs are one file.
 */
export const summarizeGcodeJob = (files: GcodeJobFile[], isCnc: boolean): GcodeJobSummary => {
    const times = files
        .filter(file => file.estimatedTime !== undefined && file.estimatedTime !== null)
        .map(file => Number(file.estimatedTime))
        .filter(Number.isFinite);
    const totalTime = times.length > 0 ? times.reduce((sum, time) => sum + time, 0) : null;
    const toolChangeBeforeFiles = isCnc
        ? files.slice(1).map((file, i) => file.index ?? i + 2)
        : [];
    return {
        totalTime: totalTime === null ? null : round1(totalTime),
        fileCount: files.length,
        toolChanges: toolChangeBeforeFiles.length,
        toolChangeBeforeFiles,
        workArea: getWorkArea(files),
    };
};

/** "4 min 10 s", "1 h 5 min", "35 s"; "–" when unknown. */
export const formatDuration = (seconds: number | undefined | null): string => {
    if (seconds === undefined || seconds === null || !Number.isFinite(Number(seconds))) {
        return '–';
    }
    const total = Math.round(Number(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours > 0) {
        return `${hours} h ${minutes} min`;
    }
    if (minutes > 0) {
        return `${minutes} min ${secs} s`;
    }
    return `${secs} s`;
};

export type ToolPathStateLike = { name: string; visible?: boolean; visibleModelIDs?: string[] };

/**
 * Names of the toolpaths that go into the G-code: visible and with visible objects.
 * Takes toolpath states (ToolPathGroup.getToolPaths()), which are plain objects without methods.
 */
export const getVisibleToolPathNames = (toolPaths: ToolPathStateLike[]): string[] => {
    return toolPaths
        .filter(toolPath => toolPath.visible && (toolPath.visibleModelIDs?.length ?? 0) > 0)
        .map(toolPath => toolPath.name);
};
