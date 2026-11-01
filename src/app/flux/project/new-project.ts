/**
 * New project dialog ("+" → mode → Blank project): project name and workpiece defaults (Luban 4.17 tabs).
 *
 * Pure functions only: no redux, i18n or DOM imports (tested with tape).
 */
import { EditorHeadType, PROJECT_EXTENSIONS } from './tabs-model';

/** The longest project name kept (tab title and file name). */
export const PROJECT_NAME_MAX_LENGTH = 100;

/** A project name as typed, cleaned: trimmed, inner white space collapsed, at most PROJECT_NAME_MAX_LENGTH characters. */
export function cleanProjectName(raw: unknown): string {
    if (typeof raw !== 'string') {
        return '';
    }
    return raw.replace(/\s+/g, ' ').trim().slice(0, PROJECT_NAME_MAX_LENGTH).trim();
}

// characters no file system takes in a file name (Windows is the strictest), and control characters
// eslint-disable-next-line no-control-regex
const ILLEGAL_FILE_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * The file name Save proposes for a project name: illegal characters become "-", trailing dots and spaces
 * go, the mode's extension is added (not twice). Null when nothing usable is left.
 */
export function projectFileName(name: unknown, head: EditorHeadType): string | null {
    const ext = PROJECT_EXTENSIONS[head];
    let base = cleanProjectName(name);
    if (base.toLowerCase().endsWith(ext)) {
        base = base.slice(0, -ext.length);
    }
    base = base.replace(ILLEGAL_FILE_NAME_CHARS, '-').replace(/[. ]+$/, '').trim();
    if (!base || /^[-.\s]+$/.test(base)) {
        return null;
    }
    if (RESERVED_WINDOWS_NAMES.test(base)) {
        base = `${base}-project`;
    }
    return `${base}${ext}`;
}

export interface MachineSize {
    x: number;
    y: number;
    z: number;
}

export interface RectangleSize {
    x: number;
    y: number;
    z: number;
}

export interface CylinderSize {
    diameter: number;
    length: number;
}

/** The smallest sizes Job Setup takes (mm). */
export const WORKPIECE_MIN = { x: 2, y: 10, z: 0.1, diameter: 2, length: 10 };

/** The 4.16 defaults of a new 4-axis project (editorActions.initializeWorkpiece). */
export const CYLINDER_DEFAULT: CylinderSize = { diameter: 40, length: 75 };

/** Thickness of a new CNC workpiece when none was used before (mm). */
export const DEFAULT_THICKNESS = 10;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const clamp = (v: number, min: number, max: number): number => {
    if (max > 0 && v > max) {
        return max;
    }
    return v < min ? min : v;
};

const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * A workpiece size within what the machine takes: values are rounded to 0.1 mm and clamped to
 * [WORKPIECE_MIN, machine size] (the cylinder diameter by the machine width, its length by the depth, as in
 * Job Setup). Values that are no numbers fall back to `fallback`.
 */
export function clampRectangleSize(size: Partial<RectangleSize> | null | undefined, machine: MachineSize, fallback: RectangleSize): RectangleSize {
    const s = size || {};
    return {
        x: clamp(round1(isNumber(s.x) ? s.x : fallback.x), WORKPIECE_MIN.x, machine.x),
        y: clamp(round1(isNumber(s.y) ? s.y : fallback.y), WORKPIECE_MIN.y, machine.y),
        z: clamp(round1(isNumber(s.z) ? s.z : fallback.z), WORKPIECE_MIN.z, machine.z),
    };
}

export function clampCylinderSize(
    size: Partial<CylinderSize> | null | undefined, machine: MachineSize, fallback: CylinderSize = CYLINDER_DEFAULT,
): CylinderSize {
    const s = size || {};
    return {
        diameter: clamp(round1(isNumber(s.diameter) ? s.diameter : fallback.diameter), WORKPIECE_MIN.diameter, machine.x),
        length: clamp(round1(isNumber(s.length) ? s.length : fallback.length), WORKPIECE_MIN.length, machine.y),
    };
}

/** Where the last used size of a new project is remembered (machine store key). */
export function rememberedSizeKey(head: EditorHeadType, isRotate: boolean): string {
    return `newProject.${head}.${isRotate ? 'cylinder' : 'rectangle'}`;
}

/**
 * The workpiece size a new blank project starts with: the size last used for a new project of this mode
 * and shape (if any, clamped to the machine), else the 4.16 defaults (the machine's work area for 3-axis,
 * 40 × 75 mm for 4-axis). CNC thickness: last used, else DEFAULT_THICKNESS.
 */
export function newProjectSize(head: EditorHeadType, isRotate: boolean, machine: MachineSize, remembered?: unknown): RectangleSize | CylinderSize {
    const last = remembered && typeof remembered === 'object' ? remembered as Record<string, unknown> : null;
    if (isRotate) {
        return clampCylinderSize(last as Partial<CylinderSize>, machine);
    }
    const fallback = { x: machine.x, y: machine.y, z: head === 'cnc' ? DEFAULT_THICKNESS : machine.z };
    return clampRectangleSize(last as Partial<RectangleSize>, machine, fallback);
}

/** The work area of the Artisan with the CNC locking block at position A or B (4.16 Job Setup). */
export function lockingBlockWorkpieceSize(position: string): { x: number; y: number } {
    return position === 'B' ? { x: 290, y: 305 } : { x: 375, y: 395 };
}

export type NewProjectPage = 'blank' | 'blank-4axis' | 'open' | 'cases' | 'recent';

/** The items of the left column of step 2 (4-axis only for laser and CNC on a machine with a rotary module). */
export function newProjectPages(head: EditorHeadType, supportsRotary: boolean): NewProjectPage[] {
    const pages: NewProjectPage[] = ['blank'];
    if (head !== 'printing' && supportsRotary) {
        pages.push('blank-4axis');
    }
    pages.push('open', 'cases', 'recent');
    return pages;
}

/**
 * Whether a machine can take the rotary module (4-axis projects): every machine but the Snapmaker Original
 * (and its long Z-axis variant), which never had one. No machine definition names the module yet.
 */
export function machineSupportsRotary(identifier: string | null | undefined): boolean {
    if (!identifier) {
        return true;
    }
    return !/^original/i.test(identifier);
}
