export type ToolpathRendererData = {
    data: object[];
    filenames: string[];
    taskId: string;
    headType: string;
};

export type RenderMessage = {
    status: 'progress' | 'data' | 'succeed' | 'err';
    headType: string;
    value: unknown;
};

type ConvertFile = (filename: string, onProgress: (progress: number) => void) => Promise<unknown>;

type RenderOptions = {
    now?: () => number;
    // minimum time between two progress messages: each one re-renders the page
    progressInterval?: number;
};

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Render the toolpath files of one toolpath (all files at once). Emits a `data`
 * message ({ index, renderResult }) per rendered file and always ends with exactly one
 * `succeed` or `err` message: a file that fails to load or render must never leave the
 * caller waiting.
 */
export const renderToolPathFiles = async (
    taskResult: ToolpathRendererData,
    convert: ConvertFile,
    emit: (message: RenderMessage) => void,
    { now = Date.now, progressInterval = 100 }: RenderOptions = {}
): Promise<void> => {
    const { headType } = taskResult;
    const total = taskResult.data ? taskResult.data.length : 0;

    if (total === 0) {
        emit({ status: 'err', headType, value: 'Data is empty' });
        return;
    }
    if (!Array.isArray(taskResult.filenames) || taskResult.filenames.length < total) {
        emit({ status: 'err', headType, value: `Missing toolpath files for ${taskResult.taskId}` });
        return;
    }

    const fileProgress = new Array(total).fill(0);
    let lastProgressAt = -Infinity;
    const onFileProgress = (index: number, progress: number) => {
        fileProgress[index] = progress;
        const time = now();
        if (time - lastProgressAt < progressInterval) {
            return;
        }
        lastProgressAt = time;
        const sum = fileProgress.reduce((a, b) => a + b, 0);
        emit({ status: 'progress', headType, value: { progress: sum / total } });
    };

    const results = await Promise.allSettled(taskResult.filenames.slice(0, total).map(async (filename, index) => {
        const renderResult = await convert(filename, (progress) => onFileProgress(index, progress));
        emit({ status: 'data', headType, value: { index, renderResult } });
    }));

    const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failure) {
        emit({ status: 'err', headType, value: errorText(failure.reason) });
    } else {
        emit({ status: 'succeed', headType, value: null });
    }
};
