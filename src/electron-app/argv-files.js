/**
 * Files Luban opens from its command line (a double-click on a project file in Windows Explorer starts
 * Luban, or a second instance, with the file paths as arguments).
 */
export const OPENABLE_EXTENSIONS = ['.snap3dp', '.snaplzr', '.snapcnc', '.gcode', '.nc', '.cnc'];

function isOpenablePath(arg) {
    if (typeof arg !== 'string' || arg === '' || arg.startsWith('-')) {
        return false;
    }
    const lower = arg.toLowerCase();
    return OPENABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** The project and G-code paths of a command line, in order and once each (flags and the exe are ignored). */
export function projectPathsFromArgv(argv) {
    if (!Array.isArray(argv)) {
        return [];
    }
    const out = [];
    for (const arg of argv) {
        if (isOpenablePath(arg) && !out.includes(arg)) {
            out.push(arg);
        }
    }
    return out;
}

/**
 * Files that arrive before the window can open them are stored until the renderer asks (popFile).
 * `pending` may be null, one file (as 4.16 stored it) or a list; a path already pending is not added again.
 */
export function appendPendingFiles(pending, files) {
    let list = [];
    if (Array.isArray(pending)) {
        list = pending.slice();
    } else if (pending && typeof pending === 'object') {
        list = [pending];
    }
    for (const file of files || []) {
        if (file && !list.some((f) => f && f.path === file.path)) {
            list.push(file);
        }
    }
    return list;
}
