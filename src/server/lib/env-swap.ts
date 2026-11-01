/**
 * Auto-save folders written so that an interruption (the app quits, the server is killed) never leaves a
 * half-written folder (Luban 4.17 tabs).
 *
 * A write goes into `<dir>.writing`; only when it is complete, the old folder is moved to `<dir>.previous`,
 * the new one takes its place and the old one is removed. `recoverEnvDir` repairs a swap that was cut off
 * between those steps (called before an auto-save is listed or read).
 */
import * as fs from 'fs-extra';

export const STAGING_SUFFIX = '.writing';
export const BACKUP_SUFFIX = '.previous';

const RENAME_TRIES = 5;

const sleep = async (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Windows refuses a rename for a moment while a virus scanner or the indexer has a file open (EPERM / EBUSY)
async function renameWithRetry(from: string, to: string): Promise<void> {
    for (let i = 1; ; i++) {
        try {
            fs.renameSync(from, to);
            return;
        } catch (e) {
            const code = (e as { code?: string }).code;
            if (i >= RENAME_TRIES || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) {
                throw e;
            }
            await sleep(100 * i);
        }
    }
}

/**
 * Repairs a replaceDir that was cut off: when `dir` is missing, the old folder (`.previous`) comes back,
 * else a complete first write (`.writing` with config.json); leftovers are removed.
 */
export function recoverEnvDir(dir: string): void {
    const staging = `${dir}${STAGING_SUFFIX}`;
    const backup = `${dir}${BACKUP_SUFFIX}`;
    if (!fs.existsSync(dir)) {
        if (fs.existsSync(backup)) {
            fs.renameSync(backup, dir);
        } else if (fs.existsSync(`${staging}/config.json`)) {
            fs.renameSync(staging, dir);
        }
    }
    if (fs.existsSync(backup)) {
        fs.removeSync(backup);
    }
    if (fs.existsSync(staging)) {
        fs.removeSync(staging);
    }
}

/**
 * Replaces `dir` by what `fill(staging)` writes. While `fill` runs (or when it fails) the old folder is
 * untouched; a failed fill leaves no staging folder behind and is passed on.
 */
export async function replaceDir(dir: string, fill: (staging: string) => unknown): Promise<void> {
    const staging = `${dir}${STAGING_SUFFIX}`;
    const backup = `${dir}${BACKUP_SUFFIX}`;
    recoverEnvDir(dir);
    fs.removeSync(staging);
    fs.ensureDirSync(staging);
    try {
        await fill(staging);
    } catch (e) {
        fs.removeSync(staging);
        throw e;
    }
    const hadOld = fs.existsSync(dir);
    if (hadOld) {
        await renameWithRetry(dir, backup);
    }
    try {
        await renameWithRetry(staging, dir);
    } catch (e) {
        // put the old folder back; the staging folder is dropped
        if (hadOld && !fs.existsSync(dir)) {
            fs.renameSync(backup, dir);
        }
        fs.removeSync(staging);
        throw e;
    }
    fs.removeSync(backup);
}

/** The base names (`<dir>` of `<dir>.writing` / `<dir>.previous`) of interrupted writes among folder names. */
export function interruptedDirNames(names: readonly string[]): string[] {
    const out = new Set<string>();
    for (const name of names) {
        for (const suffix of [STAGING_SUFFIX, BACKUP_SUFFIX]) {
            if (name.endsWith(suffix)) {
                out.add(name.slice(0, -suffix.length));
            }
        }
    }
    return [...out];
}

/**
 * Moves a 4.16 auto-save (`env/{head}`) into a document folder: copied first (atomically), and only then
 * `env/{head}` is emptied (the folder stays, as 4.16 keeps it). False when there is no auto-save there.
 */
export async function migrateEnvDir(fromDir: string, toDir: string): Promise<boolean> {
    if (!fs.existsSync(`${fromDir}/config.json`)) {
        return false;
    }
    await replaceDir(toDir, (staging) => fs.copySync(fromDir, staging));
    fs.emptyDirSync(fromDir);
    return true;
}
