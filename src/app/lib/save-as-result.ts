/**
 * `UniApi.File.saveAs` reports through a callback: ('electron' | 'web', filePath, file) when the file was
 * written, ('cancel') when the dialog was cancelled and ('error') when writing failed. This wraps it into a
 * promise that always settles, so a cancelled Save As during close or quit can abort them.
 */
export interface SaveAsResult {
    saved: boolean;
    type: string;
    filePath: string;
    file: { name: string; path: string } | null;
}

type SaveAsCallback = (type: string, filePath?: string, file?: { name: string; path: string }) => void;

export async function saveAsPromise(start: (callback: SaveAsCallback) => void): Promise<SaveAsResult> {
    return new Promise<SaveAsResult>((resolve) => {
        const callback: SaveAsCallback = (type, filePath = '', file = null) => {
            resolve({ saved: type !== 'cancel' && type !== 'error', type, filePath, file });
        };
        try {
            start(callback);
        } catch (e) {
            callback('error');
        }
    });
}
