/**
 * Texts of the work origin (marker label, pick mode, toasts): "Logo · bottom left  X 70.0 Y 140.0".
 * Pure: the translator `t` is passed in (i18n._ in the app), keys `key-CncLaser/Origin-…` and
 * `key-CncLaser/OriginPoint-…` (point names in lower case, they stand in the middle of a sentence).
 */
import { ObjectReference, Origin, OriginOffset, OriginType } from '../../../constants/coordinate';
import { Point, boundModelIds } from '../../../lib/object-origin';
import { boundGroupId, isWorkpieceFrameOrigin, originOffset } from '../../../lib/work-origin';
import type { OriginTarget } from '../snap/origin-targets';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export type OriginTargetKind = 'object' | 'selection' | 'group' | 'workpiece' | 'free' | 'all';

export interface OriginDescribeContext {
    /** name of an object or a group, null when unknown */
    getName: (modelID: string) => string | null;
}

const POINT_KEYS: Record<string, string> = {
    [ObjectReference.TopLeft]: 'key-CncLaser/OriginPoint-top left',
    [ObjectReference.TopCenter]: 'key-CncLaser/OriginPoint-top centre',
    [ObjectReference.TopRight]: 'key-CncLaser/OriginPoint-top right',
    [ObjectReference.CenterLeft]: 'key-CncLaser/OriginPoint-middle left',
    [ObjectReference.Center]: 'key-CncLaser/OriginPoint-centre',
    [ObjectReference.CenterRight]: 'key-CncLaser/OriginPoint-middle right',
    [ObjectReference.BottomLeft]: 'key-CncLaser/OriginPoint-bottom left',
    [ObjectReference.BottomCenter]: 'key-CncLaser/OriginPoint-bottom centre',
    [ObjectReference.BottomRight]: 'key-CncLaser/OriginPoint-bottom right',
};

/** The name of one of the 9 frame points ("bottom left"), null for other references. */
export function pointName(reference: string, t: Translate): string | null {
    const key = POINT_KEYS[reference];
    return key ? t(key) : null;
}

/** mm with one decimal, a real minus sign, never "−0.0". */
export function formatOriginNumber(mm: number): string {
    const rounded = Math.round(mm * 10) / 10;
    const value = Object.is(rounded, -0) || rounded === 0 ? 0 : rounded;
    const text = Math.abs(value).toFixed(1);
    return value < 0 ? `−${text}` : text;
}

/** What the origin is on: the object's own name, "Selection", "Group “Badge”", "Workpiece", "Free", "All objects". */
export function originTargetName(kind: OriginTargetKind, name: string | null, t: Translate): string {
    switch (kind) {
        case 'object':
            return name || t('key-CncLaser/Origin-Selection');
        case 'group':
            return t('key-CncLaser/Origin-Group “{{name}}”', { name: name || '' });
        case 'workpiece':
            return t('key-CncLaser/Origin-Workpiece');
        case 'free':
            return t('key-CncLaser/Origin-Free');
        case 'all':
            return t('key-CncLaser/Origin-All objects');
        case 'selection':
        default:
            return t('key-CncLaser/Origin-Selection');
    }
}

/** "Logo · bottom left  X 70.0 Y 140.0" (two spaces before the numbers); parts are left out when missing. */
export function originLabel(name: string, point: string | null, at: Point | null): string {
    const head = point ? `${name} · ${point}` : name;
    return at ? `${head}  X ${formatOriginNumber(at.x)} Y ${formatOriginNumber(at.y)}` : head;
}

/** "5.0 / 0.0" */
export function offsetText(offset: OriginOffset): string {
    return `${formatOriginNumber(offset.x)} / ${formatOriginNumber(offset.y)}`;
}

/** "Origin set on Logo · bottom left" (+ " · Offset 5.0 / 0.0 removed"). `outside` is worded in a later task. */
export function originSetToast(label: string, removedOffset: OriginOffset | null, outside: boolean, t: Translate): string {
    let text = t('key-CncLaser/Origin-Origin set on {{label}}', { label });
    if (removedOffset) {
        text += ` · ${t('key-CncLaser/Origin-Offset {{offset}} removed', { offset: offsetText(removedOffset) })}`;
    }
    return text;
}

/** Name, point name and label (without numbers) of an origin. */
export function describeOrigin(origin: Origin, ctx: OriginDescribeContext, t: Translate): { name: string; pointName: string | null; label: string } {
    let kind: OriginTargetKind;
    let name: string | null = null;
    const offset = originOffset(origin);
    if (origin.type === OriginType.Workpiece && (offset.x !== 0 || offset.y !== 0)) {
        kind = 'free';
    } else if (origin.type !== OriginType.Object || isWorkpieceFrameOrigin(origin)) {
        kind = 'workpiece';
    } else if (boundGroupId(origin)) {
        kind = 'group';
        name = ctx.getName(boundGroupId(origin));
    } else {
        const ids = boundModelIds(origin);
        if (!ids.length) {
            kind = 'all';
        } else if (ids.length === 1 && ctx.getName(ids[0])) {
            kind = 'object';
            name = ctx.getName(ids[0]);
        } else {
            kind = 'selection';
        }
    }
    const targetName = originTargetName(kind, name, t);
    const point = kind === 'free' ? null : pointName(origin.reference, t);
    return { name: targetName, pointName: point, label: originLabel(targetName, point, null) };
}

/** "Logo · bottom left  X 70.0 Y 140.0" for a snap target (selection, group, object, workpiece). */
export function targetLabel(target: OriginTarget, t: Translate, withNumbers = true): string {
    const kindByTarget: Record<OriginTarget['source']['kind'], OriginTargetKind> = {
        object: 'object', selection: 'selection', group: 'group', workpiece: 'workpiece',
    };
    const name = originTargetName(kindByTarget[target.source.kind], target.name || null, t);
    return originLabel(name, pointName(target.reference, t), withNumbers ? target.point : null);
}
