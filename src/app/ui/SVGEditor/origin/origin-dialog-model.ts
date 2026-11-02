/**
 * The work origin dialog (Kombination A+B, detail path) as pure data: its reference rows, the state it opens
 * with, the origin a state stands for, the preview (reference frame, zero, job extent) and the preview fit.
 * Model coordinates (mm, y up). The UI (OriginDialog / OriginPreview) only renders these.
 */
import { ObjectReference, Origin, OriginOffset, OriginType } from '../../../constants/coordinate';
import { BoxLike, boundModelIds, createObjectOrigin, Point, unionBox } from '../../../lib/object-origin';
import {
    boundGroupId,
    createFreeOrigin,
    createGroupOrigin,
    createWorkpieceFrameOrigin,
    extentFromOrigin,
    freezeOrigin,
    isWorkpieceFrameOrigin,
    OriginContext,
    originOffset,
    originShift,
    resolveReferenceBox,
    withOffset,
} from '../../../lib/work-origin';
import type { OriginTarget } from '../snap/origin-targets';
import type { Translate } from './origin-labels';

export type DialogReferenceKind = 'workpiece' | 'selection' | 'all' | 'group' | 'bound';

export interface DialogReferenceRow {
    kind: DialogReferenceKind;
    label: string;
    size: { w: number; h: number } | null;
    disabled: boolean;
    current: boolean;
    modelIDs?: string[];
    groupID?: string;
}

export interface OriginDialogState {
    reference: DialogReferenceKind;
    point: ObjectReference;
    offset: OriginOffset;
    follow: boolean;
    /** 'bound': the objects (or the members of groupID) the origin is bound to */
    referenceIDs?: string[];
    groupID?: string;
}

export interface DialogContext extends OriginContext {
    /** the visible selection; groupID when it is one group */
    selection: { modelIDs: string[]; groupID: string | null; name: string | null } | null;
    groups: { groupID: string; name: string; memberIDs: string[] }[];
    /** visible objects */
    objectCount: number;
    coordinateModeValue: string;
    getName?: (id: string) => string | null;
    /** boxes of all visible objects ("All objects" row, job extent before any operation); default allBoxes */
    objectBoxes?: () => BoxLike[];
    t: Translate;
}

const K = 'key-CncLaser/Origin-';

const sizeOf = (b: BoxLike | null): { w: number; h: number } | null => (b ? {
    w: Math.round((b.max.x - b.min.x) * 10) / 10,
    h: Math.round((b.max.y - b.min.y) * 10) / 10,
} : null);

const sameIds = (a: string[], b: string[]): boolean => a.length === b.length && a.slice().sort().join('\u0000') === b.slice().sort().join('\u0000');

const objectBoxes = (ctx: DialogContext): BoxLike[] => (ctx.objectBoxes ? ctx.objectBoxes() : ctx.allBoxes());

function groupName(ctx: DialogContext, groupID: string): string {
    return ctx.groups.find(g => g.groupID === groupID)?.name || ctx.getName?.(groupID) || '';
}

function idsLabel(ids: string[], ctx: DialogContext): string {
    if (ids.length === 1) {
        return ctx.getName?.(ids[0]) || ctx.t(`${K}Selection`);
    }
    return ctx.t(`${K}{{count}} objects`, { count: ids.length });
}

/** The row of the selection: one group, one object or several. */
function selectionRow(ctx: DialogContext): DialogReferenceRow {
    const s = ctx.selection;
    if (!s || !s.modelIDs.length) {
        return { kind: 'selection', label: ctx.t(`${K}Selection`), size: null, disabled: true, current: false };
    }
    const box = unionBox(s.modelIDs.map(ctx.getBox));
    if (s.groupID) {
        return {
            kind: 'group',
            label: ctx.t(`${K}Group “{{name}}”`, { name: groupName(ctx, s.groupID) || s.name || '' }),
            size: sizeOf(box),
            disabled: false,
            current: false,
            modelIDs: s.modelIDs.slice(),
            groupID: s.groupID,
        };
    }
    const label = s.modelIDs.length === 1
        ? ctx.t(`${K}Selection · {{name}}`, { name: s.name || ctx.getName?.(s.modelIDs[0]) || '' })
        : ctx.t(`${K}Selection · {{count}} objects`, { count: s.modelIDs.length });
    return { kind: 'selection', label, size: sizeOf(box), disabled: false, current: false, modelIDs: s.modelIDs.slice() };
}

/** Whether an object origin is bound to exactly this row (group or ids). */
function boundTo(origin: Origin, row: DialogReferenceRow): boolean {
    if (origin?.type !== OriginType.Object || isWorkpieceFrameOrigin(origin)) {
        return false;
    }
    const groupID = boundGroupId(origin);
    if (row.groupID || groupID) {
        return !!row.groupID && row.groupID === groupID;
    }
    const ids = boundModelIds(origin);
    return ids.length > 0 && !!row.modelIDs && sameIds(ids, row.modelIDs);
}

/** Rows of the reference list: Workpiece, the selection (or its group), the current binding if elsewhere, All objects. */
export function dialogReferences(origin: Origin, ctx: DialogContext): DialogReferenceRow[] {
    const workpiece: DialogReferenceRow = {
        kind: 'workpiece',
        label: ctx.t(`${K}Workpiece`),
        size: sizeOf(ctx.workpieceBox),
        disabled: false,
        current: !origin || origin.type !== OriginType.Object || isWorkpieceFrameOrigin(origin),
    };
    const selection = selectionRow(ctx);
    selection.current = boundTo(origin, selection);
    const rows: DialogReferenceRow[] = [workpiece, selection];
    const isObject = origin?.type === OriginType.Object && !isWorkpieceFrameOrigin(origin);
    const groupID = isObject ? boundGroupId(origin) : null;
    const ids = isObject ? boundModelIds(origin) : [];
    if ((groupID || ids.length) && !selection.current) {
        const groupStillThere = groupID ? ctx.getGroupMemberIds(groupID) : null;
        const members = groupStillThere && groupStillThere.length ? groupStillThere : ids;
        rows.push({
            kind: 'bound',
            label: groupID ? ctx.t(`${K}Group “{{name}}”`, { name: groupName(ctx, groupID) }) : idsLabel(ids, ctx),
            size: sizeOf(resolveReferenceBox(origin, ctx)),
            disabled: false,
            current: true,
            modelIDs: members.slice(),
            ...(groupID ? { groupID } : {}),
        });
    }
    rows.push({
        kind: 'all',
        label: ctx.t(`${K}All objects ({{count}})`, { count: ctx.objectCount }),
        size: sizeOf(unionBox(objectBoxes(ctx))),
        disabled: ctx.objectCount === 0,
        current: isObject && !groupID && !ids.length,
    });
    return rows;
}

/** The dialog state of the current origin (its row, point, offset; follow = it moves with objects). */
export function initialDialogState(origin: Origin, ctx: DialogContext): OriginDialogState {
    const offset = originOffset(origin);
    if (!origin || origin.type !== OriginType.Object || isWorkpieceFrameOrigin(origin)) {
        const point = (origin && origin.type !== OriginType.CNCLockingBlock ? origin.reference : ctx.coordinateModeValue) as ObjectReference;
        return { reference: 'workpiece', point, offset, follow: false };
    }
    const rows = dialogReferences(origin, ctx);
    const current = rows.find(r => r.current && r.kind !== 'workpiece');
    const state: OriginDialogState = { reference: current ? current.kind : 'all', point: origin.reference as ObjectReference, offset, follow: true };
    if (current?.kind === 'bound') {
        state.referenceIDs = current.modelIDs.slice();
        if (current.groupID) {
            state.groupID = current.groupID;
        }
    }
    return state;
}

/** The origin bound as the state says, before follow / offset. */
function boundOrigin(state: OriginDialogState, ctx: DialogContext): Origin {
    const { point } = state;
    switch (state.reference) {
        case 'workpiece':
            return point === ctx.coordinateModeValue ? createFreeOrigin(ctx.coordinateModeValue, { x: 0, y: 0 }) : createWorkpieceFrameOrigin(point);
        case 'selection':
            return createObjectOrigin(point, ctx.selection?.modelIDs || []);
        case 'group': {
            const s = ctx.selection;
            return s?.groupID ? createGroupOrigin(point, s.groupID, s.modelIDs) : createObjectOrigin(point, s?.modelIDs || []);
        }
        case 'bound':
            return state.groupID
                ? createGroupOrigin(point, state.groupID, state.referenceIDs || [])
                : createObjectOrigin(point, state.referenceIDs || []);
        case 'all':
        default:
            return { type: OriginType.Object, reference: point, referenceMetadata: {} };
    }
}

/**
 * The origin the dialog applies: the reference point plus offset; "follow" off on an object reference stores
 * the resulting point as a free (workpiece) origin that no longer moves with the objects.
 */
export function dialogToOrigin(state: OriginDialogState, ctx: DialogContext): Origin {
    const bound = boundOrigin(state, ctx);
    if (state.reference === 'workpiece' && bound.type === OriginType.Workpiece) {
        return createFreeOrigin(ctx.coordinateModeValue, state.offset);
    }
    const withOff = withOffset(bound, state.offset);
    if (!state.follow && state.reference !== 'workpiece') {
        const shift = originShift(withOff, ctx);
        if (shift) {
            return freezeOrigin(withOff, shift, ctx.coordinateModeValue);
        }
    }
    return withOff;
}

/** What the preview draws for a state: the reference frame, the zero (model mm) and the job extent from it. */
export function dialogPreviewOrigin(state: OriginDialogState, ctx: DialogContext): {
    reference: BoxLike | null; zero: Point | null; extent: ReturnType<typeof extentFromOrigin>;
} {
    const bound = boundOrigin(state, ctx);
    const reference = state.reference === 'workpiece' ? unionBox([ctx.workpieceBox]) : resolveReferenceBox(bound, ctx);
    const zero = originShift(dialogToOrigin(state, ctx), ctx) || { x: 0, y: 0 };
    const job = unionBox(ctx.allBoxes()) || unionBox(objectBoxes(ctx));
    return { reference, zero, extent: extentFromOrigin(job, zero) };
}

/** Scale and translation that fit the boxes into the view (model y up → preview y down), centred. */
export function previewFit(boxes: BoxLike[], view: { w: number; h: number }, margin: number): { scale: number; tx: number; ty: number } {
    const b = unionBox(boxes);
    if (!b) {
        return { scale: 1, tx: view.w / 2, ty: view.h / 2 };
    }
    const w = Math.max(b.max.x - b.min.x, 1e-6);
    const h = Math.max(b.max.y - b.min.y, 1e-6);
    const scale = Math.min((view.w - 2 * margin) / w, (view.h - 2 * margin) / h);
    const cx = (b.min.x + b.max.x) / 2;
    const cy = (b.min.y + b.max.y) / 2;
    return { scale, tx: view.w / 2 - cx * scale, ty: view.h / 2 + cy * scale };
}

export type PreviewZoom = 'workpiece' | 'reference';

/** The boxes the preview fits: the workpiece (or the reference frame), widened to keep an outside zero in view. */
export function previewBoxes(zoom: PreviewZoom, p: { workpiece: BoxLike | null; reference: BoxLike | null; zero: Point | null }): BoxLike[] {
    const first = zoom === 'workpiece' ? p.workpiece : p.reference;
    const base = first || p.workpiece || p.reference;
    const boxes = base ? [base] : [];
    if (p.zero) {
        boxes.push({ min: { ...p.zero }, max: { ...p.zero } });
    }
    return boxes;
}

/**
 * "Pick on the canvas" from the dialog: the picked point becomes the dialog's reference and point (the
 * offset stays unless the pick changes between the workpiece and objects). A point of the selection (or its
 * group) is the selection row, another object or group a
 * bound row, a workpiece point the workpiece row.
 */
export function dialogStateFromTarget(state: OriginDialogState, target: OriginTarget, ctx: DialogContext): OriginDialogState {
    const src = target.source;
    // the offset stays within its kind of reference (workpiece: a position, objects: a shift);
    // across the two kinds it starts at 0
    const crossing = (src.kind === 'workpiece') !== (state.reference === 'workpiece');
    const base = { point: target.reference, offset: crossing ? { x: 0, y: 0 } : { ...state.offset } };
    if (src.kind === 'workpiece') {
        return { reference: 'workpiece', ...base, follow: false };
    }
    const follow = state.reference === 'workpiece' ? true : state.follow;
    const s = ctx.selection;
    let ids: string[];
    let groupID: string | null = null;
    if (src.kind === 'selection') {
        ids = src.modelIDs.slice();
    } else if (src.kind === 'group') {
        ids = src.memberIDs.slice();
        groupID = src.groupID;
    } else {
        ids = [src.modelID];
    }
    if (s && s.modelIDs.length && ((groupID && s.groupID === groupID) || (!groupID && !s.groupID && sameIds(ids, s.modelIDs)))) {
        return { reference: s.groupID ? 'group' : 'selection', ...base, follow };
    }
    return { reference: 'bound', ...base, follow, referenceIDs: ids, ...(groupID ? { groupID } : {}) };
}
