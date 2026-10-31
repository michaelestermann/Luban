/**
 * Auto-save environment directories.
 *
 * 4.16 keeps one environment per head type (`env/{headType}`). 4.17 tabs keep
 * one per document (`env/docs/{docId}`). The docId comes from the client, so it
 * is checked strictly to keep it from leaving the env directory.
 */

const DOC_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const ENV_DOCS_DIR = 'docs';

export function isValidDocId(id: unknown): boolean {
    return typeof id === 'string' && DOC_ID_PATTERN.test(id);
}

/** No docId (undefined/null) → `${base}/${headType}`; valid docId → `${base}/docs/${docId}`; anything else throws. */
export function resolveEnvDir(baseEnvDir: string, headType: string, docId?: unknown): string {
    if (docId === undefined || docId === null) {
        return `${baseEnvDir}/${headType}`;
    }
    if (!isValidDocId(docId)) {
        throw new Error('invalid docId');
    }
    return `${baseEnvDir}/${ENV_DOCS_DIR}/${docId}`;
}
