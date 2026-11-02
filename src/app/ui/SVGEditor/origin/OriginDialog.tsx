import i18next from 'i18next';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';

import { ObjectReference, OriginOffset } from '../../../constants/coordinate';
import { originActions, OriginDialogState as OpenDialog, t } from '../../../flux/editor/actions-origin';
import { pushModal } from '../../../lib/modal-keyboard';
import { BoxLike, referenceAnchor, referencePoint, unionBox } from '../../../lib/object-origin';
import { isOutsideWorkpiece, workpieceModelBox, workpieceOrigin } from '../../../lib/work-origin';
import { localizedAnchorName } from '../../widgets/CncLaserShared/FramePicker';
import OriginPointPicker from '../../widgets/CncLaserShared/OriginPointPicker';
import { buildOriginTargetInput, ModelGroupLike } from './origin-input';
import {
    DialogContext,
    DialogReferenceRow,
    dialogPreviewOrigin,
    dialogReferences,
    dialogStateFromTarget,
    dialogToOrigin,
    initialDialogState,
    OriginDialogState,
    PreviewZoom,
} from './origin-dialog-model';
import { ArrowKey, stepReference } from './origin-keyboard';
import { formatOriginNumber } from './origin-labels';
import OriginPreview from './OriginPreview';
import styles from './origin.styl';

const K = 'key-CncLaser/Origin-';

type ProjectStateLike = { project?: Record<string, { openedFile?: { name?: string } }> };
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/** The dialog context from the editor state: model boxes, selection, groups, workpiece, names. */
function buildDialogContext(editor): DialogContext | null {
    const base = editor?.toolPathGroup?.getOriginContext?.();
    if (!base) {
        return null;
    }
    const modelGroup = editor.modelGroup as ModelGroupLike;
    const factor = editor.coordinateMode?.setting?.sizeMultiplyFactor;
    const input = buildOriginTargetInput(modelGroup, editor.coordinateSize, factor, false);
    const visible = input.objects.filter(o => o.visible && o.box);
    const names = new Map<string, string>();
    input.objects.forEach(o => names.set(o.modelID, o.name));
    input.groups.forEach(g => names.set(g.groupID, g.name));
    let selection: DialogContext['selection'] = null;
    if (input.selection) {
        const { modelIDs, groupID } = input.selection;
        let name: string | null = null;
        if (groupID) {
            name = names.get(groupID) || null;
        } else if (modelIDs.length === 1) {
            name = names.get(modelIDs[0]) || null;
        }
        selection = { modelIDs, groupID, name };
    }
    return {
        ...base,
        workpieceBox: factor ? workpieceModelBox(editor.coordinateSize, factor) : base.workpieceBox,
        selection,
        groups: input.groups.map(g => ({ groupID: g.groupID, name: g.name, memberIDs: g.memberIDs })),
        objectCount: visible.length,
        objectBoxes: () => visible.map(o => o.box),
        coordinateModeValue: editor.coordinateMode?.value,
        getName: (id: string) => names.get(id) || null,
        t,
    };
}

const formatOffset = (v: number): string => (Math.round(v * 10) / 10).toFixed(1);

const parseMm = (text: string): number | null => {
    const v = Number(String(text).trim().replace(',', '.').replace('−', '-'));
    return text.trim() !== '' && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null;
};

interface BodyProps {
    headType: 'laser' | 'cnc';
    dialog: OpenDialog;
}

const OriginDialogBody: React.FC<BodyProps> = ({ headType, dialog }) => {
    const dispatch = useDispatch();
    const store = useStore();
    const rootRef = useRef<HTMLDivElement>(null);
    const offsetXRef = useRef<HTMLInputElement>(null);
    const pickerRef = useRef<HTMLDivElement>(null);
    const rowsRef = useRef<HTMLDivElement>(null);
    // the editor objects change (move, resize): the context is built again
    const renderingTimestamp = useSelector(state => state[headType]?.renderingTimestamp);
    const origin = useSelector(state => state[headType]?.origin);
    const fileName: string | null = useSelector((state: ProjectStateLike) => state.project?.[headType]?.openedFile?.name || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const ctx = useMemo(() => buildDialogContext(store.getState()[headType]), [store, headType, renderingTimestamp]);

    const [form, setForm] = useState<OriginDialogState>(() => {
        const draft = dialog.draft as unknown as OriginDialogState | null;
        if (draft && dialog.picked && ctx) {
            return dialogStateFromTarget(draft, dialog.picked, ctx);
        }
        return draft || initialDialogState(origin, ctx);
    });
    const [offsetText, setOffsetText] = useState(() => ({ x: formatOffset(form.offset.x), y: formatOffset(form.offset.y) }));
    const [zoom, setZoom] = useState<PreviewZoom>('reference');

    const rows: DialogReferenceRow[] = useMemo(() => (ctx ? dialogReferences(origin, ctx) : []), [ctx, origin]);
    // after a pick the chosen bound row may not be one of the rows of the current origin: add it
    const sameBound = (row: DialogReferenceRow, f: OriginDialogState): boolean => row.kind === 'bound'
        && (row.groupID || null) === (f.groupID || null)
        && (row.modelIDs || []).slice().sort().join() === (f.referenceIDs || []).slice().sort().join();
    const shownRows = useMemo(() => {
        if (form.reference !== 'bound' || rows.some(r => sameBound(r, form))) {
            return rows;
        }
        const ids = form.referenceIDs || [];
        let label = ids.length === 1 ? ctx?.getName?.(ids[0]) || '' : t(`${K}{{count}} objects`, { count: ids.length });
        if (form.groupID) {
            label = t(`${K}Group “{{name}}”`, { name: ctx?.getName?.(form.groupID) || '' });
        }
        const box = ctx ? unionBox(ids.map(ctx.getBox)) : null;
        const extra: DialogReferenceRow = {
            kind: 'bound',
            label,
            size: box ? { w: Math.round((box.max.x - box.min.x) * 10) / 10, h: Math.round((box.max.y - box.min.y) * 10) / 10 } : null,
            disabled: false,
            current: false,
            modelIDs: ids,
            ...(form.groupID ? { groupID: form.groupID } : {}),
        };
        const all = rows.findIndex(r => r.kind === 'all');
        return [...rows.slice(0, all), extra, ...rows.slice(all)];
    }, [rows, form, ctx]); // eslint-disable-line react-hooks/exhaustive-deps

    const next = useMemo(() => (ctx ? dialogToOrigin(form, ctx) : null), [form, ctx]);
    const preview = useMemo(() => (ctx ? dialogPreviewOrigin(form, ctx) : null), [form, ctx]);

    // the canvas shows the dialog's origin as ghost axes (never history)
    useEffect(() => {
        if (next) {
            dispatch(originActions.setOriginPreview(headType, next));
        }
    }, [next, dispatch, headType]);

    const apply = useCallback(() => {
        if (!next) {
            return;
        }
        dispatch(originActions.closeOriginDialog(headType));
        dispatch(originActions.applyOrigin(headType, next, { source: 'dialog' }));
    }, [dispatch, headType, next]);
    const cancel = useCallback(() => dispatch(originActions.closeOriginDialog(headType)), [dispatch, headType]);
    const applyRef = useRef(apply);
    applyRef.current = apply;
    const cancelRef = useRef(cancel);
    cancelRef.current = cancel;

    // Enter applies, Esc cancels; no key reaches the canvas behind the dialog
    useEffect(() => pushModal({
        element: () => rootRef.current,
        confirm: () => applyRef.current(),
        cancel: () => cancelRef.current(),
    }), []);

    // focus: the offset field (double-click on the marker), the point picker or the reference list
    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            if (dialog.focus === 'offset' && offsetXRef.current) {
                offsetXRef.current.focus();
                offsetXRef.current.select();
            } else if (dialog.focus === 'reference') {
                rowsRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
            } else {
                pickerRef.current?.querySelector<HTMLElement>('[aria-checked="true"], [tabindex="0"]')?.focus();
            }
        });
        return () => cancelAnimationFrame(frame);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const setPoint = useCallback((point: ObjectReference) => setForm(f => ({ ...f, point })), []);
    const chooseRow = useCallback((row: DialogReferenceRow) => {
        if (row.disabled) {
            return;
        }
        setForm((f) => {
            // the workpiece never follows; leaving it for objects follows them again
            const follow = row.kind !== 'workpiece' && (f.reference === 'workpiece' || f.follow);
            // an offset belongs to its kind of reference: on the workpiece it is a position (free origin), on objects
            // a shift from their point; between the two kinds it starts at 0
            const crossing = (row.kind === 'workpiece') !== (f.reference === 'workpiece');
            const offset = crossing ? { x: 0, y: 0 } : f.offset;
            if (crossing) {
                setOffsetText({ x: formatOffset(0), y: formatOffset(0) });
            }
            const state: OriginDialogState = { reference: row.kind, point: f.point, offset, follow };
            if (row.kind === 'bound') {
                state.referenceIDs = (row.modelIDs || []).slice();
                if (row.groupID) {
                    state.groupID = row.groupID;
                }
            }
            return state;
        });
    }, []);
    const setOffset = (axis: 'x' | 'y', text: string) => {
        setOffsetText(o => ({ ...o, [axis]: text }));
        const v = parseMm(text);
        if (v !== null) {
            setForm(f => ({ ...f, offset: { ...f.offset, [axis]: v } as OriginOffset }));
        }
    };
    const reset = () => {
        if (!ctx) {
            return;
        }
        const state = initialDialogState(workpieceOrigin(ctx.coordinateModeValue), ctx);
        setForm(state);
        setOffsetText({ x: formatOffset(0), y: formatOffset(0) });
    };
    const pickOnCanvas = () => {
        dispatch(originActions.startDialogPick(headType, form as unknown as Record<string, unknown>));
    };

    if (!ctx || !preview) {
        return null;
    }
    const zero = preview.zero;
    const outside = isOutsideWorkpiece(zero, ctx.workpieceBox);
    const reference: BoxLike | null = preview.reference;
    const referenceOutside = form.reference !== 'workpiece' && !!reference && !!ctx.workpieceBox && (
        isOutsideWorkpiece(reference.min, ctx.workpieceBox) || isOutsideWorkpiece(reference.max, ctx.workpieceBox));
    const anchor = referenceAnchor(form.point);
    const ex = preview.extent;
    const jobBox = unionBox(ctx.allBoxes()) || unionBox(ctx.objectBoxes ? ctx.objectBoxes() : []);
    const width = String(i18next.language || '').startsWith('de') ? 880 : 820;

    return (
        <div className={styles['dialog-backdrop']} role="presentation">
            <div
                ref={rootRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="origin-dialog-title"
                className={styles.dialog}
                style={{ width }}
                data-origin-dialog
                data-dialog="origin"
            >
                <div className={styles['dialog-head']}>
                    <span className={styles['dialog-icon']} aria-hidden="true">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
                        </svg>
                    </span>
                    <h2 id="origin-dialog-title">{t(`${K}Set work origin`)}</h2>
                    {fileName && <span className={styles.muted}>{fileName}</span>}
                    <button type="button" className={styles['dialog-close']} aria-label={t(`${K}Close`)} title={t(`${K}Close`)} onClick={cancel} data-origin-close>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                </div>
                <div className={styles['dialog-body']}>
                    <div className={styles['dialog-left']}>
                        <OriginPreview
                            workpiece={ctx.workpieceBox}
                            objects={ctx.objectBoxes ? ctx.objectBoxes() : []}
                            reference={reference}
                            point={reference ? referencePoint(reference, form.point) : null}
                            zero={zero}
                            extent={ex}
                            job={jobBox}
                            zoom={zoom}
                            onZoom={setZoom}
                            t={t}
                        />
                        <div className={styles.legend}>
                            <span><span className={styles['legend-dot']} />{t(`${K}Work origin`)}</span>
                            <span><span className={styles['legend-frame']} />{t(`${K}Reference frame`)}</span>
                            <span><b className={styles['x-axis']}>X</b> <b className={styles['y-axis']}>Y</b> +</span>
                        </div>
                        <div className={styles['info-card']}>
                            <span className={styles.muted}>{t(`${K}Origin on the workpiece`)}</span>
                            <b data-origin-on-workpiece>{zero ? `X ${formatOriginNumber(zero.x)} · Y ${formatOriginNumber(zero.y)} mm` : '—'}</b>
                            <span className={styles.muted}>{t(`${K}Job extent from origin`)}</span>
                            <b data-origin-extent>
                                {ex
                                    ? `X ${formatOriginNumber(ex.minX)} … ${formatOriginNumber(ex.maxX)} · Y ${formatOriginNumber(ex.minY)} … ${formatOriginNumber(ex.maxY)} mm`
                                    : '—'}
                            </b>
                        </div>
                        {(outside || referenceOutside) && (
                            <div className={styles.warn} role="status" data-origin-warning>
                                {outside && <span>{t(`${K}Origin outside the workpiece`)}</span>}
                                {referenceOutside && <span>{t(`${K}Part of the selection lies outside the workpiece`)}</span>}
                            </div>
                        )}
                    </div>
                    <div className={styles['dialog-right']}>
                        <span className={styles.lbl} id="origin-dialog-reference">{t(`${K}Reference`)}</span>
                        <div ref={rowsRef} role="radiogroup" aria-labelledby="origin-dialog-reference" className={styles.rows}>
                            {shownRows.map((row) => {
                                const on = form.reference === row.kind && (row.kind !== 'bound' || sameBound(row, form));
                                return (
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={on}
                                        key={`${row.kind}-${row.groupID || (row.modelIDs || []).join(',')}`}
                                        className={`${styles.radio} ${on ? styles.on : ''} ${row.disabled ? styles.off : ''}`}
                                        disabled={row.disabled}
                                        tabIndex={on ? 0 : -1}
                                        data-origin-ref-row={row.kind}
                                        data-current={row.current || undefined}
                                        onClick={() => chooseRow(row)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                                                event.preventDefault();
                                                const usable = shownRows.filter(r => !r.disabled);
                                                const index = usable.indexOf(row);
                                                const target = usable[(index + (event.key === 'ArrowDown' ? 1 : usable.length - 1)) % usable.length];
                                                chooseRow(target);
                                                const buttons = Array.from(rowsRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || []);
                                                buttons[usable.indexOf(target)]?.focus();
                                            }
                                        }}
                                    >
                                        <span className={styles.rd} />
                                        <span className={styles['row-label']}>{row.label}</span>
                                        {row.current && <span className={styles.tag}>{t(`${K}current`)}</span>}
                                        <span className={styles['row-size']}>
                                            {row.disabled && row.kind === 'selection' && t(`${K}Nothing selected`)}
                                            {!row.disabled && row.size && `${formatOriginNumber(row.size.w)} × ${formatOriginNumber(row.size.h)} mm`}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        <span className={styles.lbl}>{t(`${K}Origin point`)}</span>
                        <div className={styles['point-row']}>
                            <div
                                ref={pickerRef}
                                role="presentation"
                                className={styles['point-picker']}
                                onKeyDown={(event) => {
                                    if (ARROWS.includes(event.key)) {
                                        event.preventDefault();
                                        const point = stepReference(form.point, event.key as ArrowKey);
                                        setPoint(point);
                                        requestAnimationFrame(() => pickerRef.current?.querySelector<HTMLElement>(`[data-origin-reference="${point}"]`)?.focus());
                                    }
                                }}
                            >
                                <OriginPointPicker value={form.point} onPick={setPoint} width={96} height={64} />
                            </div>
                            <div className={styles['point-side']}>
                                <b data-origin-point-name>{anchor ? localizedAnchorName(anchor) : form.point}</b>
                                <span className={styles.muted}>{t(`${K}Arrow keys move the point`)}</span>
                                <button type="button" className={styles.sm} onClick={pickOnCanvas} data-origin-pick-canvas>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d92d20" strokeWidth="2" aria-hidden="true">
                                        <circle cx="12" cy="12" r="3" />
                                        <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
                                    </svg>
                                    {t(`${K}Pick on the canvas`)}
                                </button>
                            </div>
                        </div>
                        <span className={styles.lbl}>{t(`${K}Offset`)}</span>
                        <div className={styles['offset-row']}>
                            {(['x', 'y'] as const).map((axis, i) => (
                                <label key={axis} className={styles.fld}>
                                    <span>{axis.toUpperCase()}</span>
                                    <input
                                        ref={i === 0 ? offsetXRef : undefined}
                                        type="text"
                                        inputMode="decimal"
                                        value={offsetText[axis]}
                                        aria-label={`${t(`${K}Offset`)} ${axis.toUpperCase()}`}
                                        data-origin-offset={axis}
                                        onChange={event => setOffset(axis, event.target.value)}
                                        // a click into the field selects the number: typing replaces it
                                        onFocus={event => event.target.select()}
                                        onBlur={() => setOffsetText(o => ({ ...o, [axis]: formatOffset(form.offset[axis]) }))}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                event.preventDefault();
                                                applyRef.current();
                                            }
                                        }}
                                    />
                                    <em>mm</em>
                                </label>
                            ))}
                        </div>
                        <label className={`${styles.check} ${form.reference === 'workpiece' ? styles.off : ''}`}>
                            <input
                                type="checkbox"
                                checked={form.reference !== 'workpiece' && form.follow}
                                disabled={form.reference === 'workpiece'}
                                data-origin-follow
                                onChange={event => setForm(f => ({ ...f, follow: event.target.checked }))}
                            />
                            {t(`${K}Follow the objects when they move`)}
                        </label>
                    </div>
                </div>
                <div className={styles['dialog-foot']}>
                    <button type="button" className={styles.link} onClick={reset} data-origin-reset>{t(`${K}Reset to workpiece origin`)}</button>
                    <span className={`${styles.muted} ${styles['foot-hint']}`}>{t(`${K}Enter applies · Esc cancels`)}</span>
                    <button type="button" className={styles.sec} onClick={cancel} data-origin-cancel>{t(`${K}Cancel`)}</button>
                    <button type="button" className={styles.pri} onClick={apply} data-modal-default data-origin-apply>{t(`${K}Apply`)}</button>
                </div>
            </div>
        </div>
    );
};

/**
 * "Set work origin" (dialog A of Kombination A+B, the detail path): reference, point, offset, follow, with a
 * live mini preview and the ghost marker on the canvas. Apply is one undo step; Cancel / Esc / × leave none.
 */
const OriginDialog: React.FC<{ headType: 'laser' | 'cnc'; isActive: boolean }> = ({ headType, isActive }) => {
    const dialog: OpenDialog | null = useSelector(state => state[headType]?.originDialog || null);
    const page = useSelector(state => state[headType]?.page);
    const dispatch = useDispatch();
    // leaving the Design step closes it
    useEffect(() => {
        if (dialog && (!isActive || page !== 'editor')) {
            dispatch(originActions.closeOriginDialog(headType));
        }
    }, [dialog, isActive, page, dispatch, headType]);
    if (!dialog || dialog.picking || !isActive || page !== 'editor') {
        return null;
    }
    return <OriginDialogBody headType={headType} dialog={dialog} />;
};

export default OriginDialog;
