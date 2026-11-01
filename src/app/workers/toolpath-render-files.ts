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

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Render the toolpath files of one toolpath (all files at once). Emits a `data`
 * message per rendered file and always ends with exactly one `succeed` or `err`
 * message: a file that fails to load or render must never leave the caller waiting.
 */
export const renderToolPathFiles = async (taskResult: ToolpathRendererData, convert: ConvertFile, emit: (message: RenderMessage) => void): Promise<void> => {
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

    const results = await Promise.allSettled(taskResult.filenames.slice(0, total).map(async (filename, index) => {
        const renderResult = await convert(filename, (progress) => {
            emit({ status: 'progress', headType, value: { progress: (index + progress) / total } });
        });
        emit({ status: 'data', headType, value: { taskResult, index, renderResult } });
    }));

    const failure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failure) {
        emit({ status: 'err', headType, value: errorText(failure.reason) });
    } else {
        emit({ status: 'succeed', headType, value: { taskResult } });
    }
};
