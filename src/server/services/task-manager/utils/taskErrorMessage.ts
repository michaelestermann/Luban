/**
 * Readable message from a worker failure value (Error, serialized error or string).
 */
export const taskErrorMessage = (res: unknown): string => {
    if (!res) {
        return '';
    }
    if (typeof res === 'string') {
        return res;
    }
    return String((res as { message?: string }).message ?? '');
};
