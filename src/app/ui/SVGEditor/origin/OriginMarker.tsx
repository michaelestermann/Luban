import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';

import { Origin } from '../../../constants/coordinate';
import { originActions, t } from '../../../flux/editor/actions-origin';
import { Point } from '../../../lib/object-origin';
import { originAfterDrop } from '../../../lib/work-origin';
import { CURSOR_SIZE, placeLabel } from '../label-placement';
import { OriginTarget, targetOrigin } from '../snap/origin-targets';
import { OriginSnap } from '../snap/snap-session';
import { buildOriginTargetInput, ModelGroupLike } from './origin-input';
import { originMarkerShown } from './origin-marker-shown';
import { targetLabel } from './origin-labels';
import styles from './origin.styl';

type Matrix = DOMMatrix | SVGMatrix;

interface OriginMarkerProps {
    headType: 'laser' | 'cnc';
    isActive: boolean;
    getScreenCTM: () => Matrix | null;
    // machine size: the zero of the coordinate mode is at (size.x, size.y) on the canvas
    size: { x: number; y: number };
    coordinateMode: { value: string; setting?: { sizeMultiplyFactor?: { x: number; y: number } } };
    coordinateSize: { x: number; y: number };
    // drawing / point editing: shown, not draggable
    locked: boolean;
}

const ARROW_PX = 40;
const GRAB_PX = 12;
const DOT_PX = 6;
// the dot gives way to a resize handle this close (screen px)
const HANDLE_PX = 6;
// below this canvas width the hint bar shows only the key caps
const NARROW_PX = 900;

interface DragState {
    before: Origin;
    target: OriginTarget | null;
    cursor: Point;
}

/** Screen point (relative to the overlay) of a model point. */
function toOverlay(ctm: Matrix, root: DOMRect, size: { x: number; y: number }, p: Point): Point {
    const cx = p.x + size.x;
    const cy = size.y - p.y;
    return { x: ctm.a * cx + ctm.c * cy + ctm.e - root.left, y: ctm.b * cx + ctm.d * cy + ctm.f - root.top };
}

const Marker: React.FC<{ at: Point; ghost?: boolean }> = ({ at, ghost = false }) => (
    <g transform={`translate(${at.x} ${at.y})`} opacity={ghost ? 0.5 : 1}>
        <line x1={0} y1={0} x2={ARROW_PX - 6} y2={0} stroke="#d93025" strokeWidth={2} />
        <path d={`M${ARROW_PX} 0 L${ARROW_PX - 8} -4 L${ARROW_PX - 8} 4 Z`} fill="#d93025" />
        <line x1={0} y1={0} x2={0} y2={-(ARROW_PX - 6)} stroke="#1e8e3e" strokeWidth={2} />
        <path d={`M0 ${-ARROW_PX} L-4 ${-(ARROW_PX - 8)} L4 ${-(ARROW_PX - 8)} Z`} fill="#1e8e3e" />
        <circle cx={0} cy={0} r={DOT_PX / 2 + 1} fill="#d93025" stroke="#ffffff" strokeWidth={1} />
    </g>
);

/**
 * The red work origin marker of step 1 (Kombination A+B, quick path): drag it by its X/Y arrows or its dot;
 * it snaps to the 9 frame points of objects, the selection, groups and the workpiece (also with the switch
 * "Snap" off), Ctrl reaches the members of groups, Esc cancels. A drop is one undo step with a toast.
 */
const OriginMarker: React.FC<OriginMarkerProps> = ({ headType, isActive, getScreenCTM, size, coordinateMode, coordinateSize, locked }) => {
    const dispatch = useDispatch();
    const store = useStore();
    const rootRef = useRef<HTMLDivElement>(null);
    const origin: Origin = useSelector(state => state[headType]?.origin);
    const isRotate = useSelector(state => !!state[headType]?.materials?.isRotate);
    const page = useSelector(state => state[headType]?.page);
    // the marker follows zoom, pan and every model change
    useSelector(state => state[headType]?.scale);
    useSelector(state => state[headType]?.target);
    const renderingTimestamp = useSelector(state => state[headType]?.renderingTimestamp);
    const originPoint: Point | null = useSelector(
        state => state[headType]?.toolPathGroup?.getObjectOriginPoint?.(state[headType]?.origin) || null,
        (a: Point | null, b: Point | null) => (!a && !b) || (!!a && !!b && a.x === b.x && a.y === b.y),
    );
    // an origin shown without being set (pick-mode hover, dialog): its point, as ghost axes
    const previewPoint: Point | null = useSelector((state) => {
        const editor = state[headType];
        const preview: Origin | null = editor?.originPreview;
        if (!preview) {
            return null;
        }
        return editor.toolPathGroup?.getObjectOriginPoint?.(preview) || { x: 0, y: 0 };
    }, (a: Point | null, b: Point | null) => (!a && !b) || (!!a && !!b && a.x === b.x && a.y === b.y));
    const [drag, setDrag] = useState<DragState | null>(null);
    const dragRef = useRef<DragState | null>(null);
    dragRef.current = drag;
    // the resize handles of the selection change with it
    useSelector(state => state[headType]?.selectedModelArray);
    const [, forceRender] = useState(0);

    // window resize: the overlay moved
    useEffect(() => {
        const onResize = () => forceRender(n => n + 1);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const shown = isActive && originMarkerShown(page, origin?.type);
    const disabled = locked || isRotate;
    const at: Point = originPoint || { x: 0, y: 0 };

    const snapRef = useRef<OriginSnap | null>(null);
    const ctrlRef = useRef(false);

    const buildInput = useCallback((insideGroups: boolean) => {
        const state = store.getState()[headType];
        return buildOriginTargetInput(state.modelGroup as ModelGroupLike, coordinateSize, coordinateMode?.setting?.sizeMultiplyFactor, insideGroups);
    }, [store, headType, coordinateSize, coordinateMode]);

    const endDrag = useCallback(() => {
        snapRef.current?.clear();
        snapRef.current = null;
        setDrag(null);
        dispatch(originActions.setOriginPreview(headType, null));
    }, [dispatch, headType]);

    const onMouseDown = useCallback((event: React.MouseEvent) => {
        if (event.button !== 0 || disabled) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        const ctm = getScreenCTM();
        if (!ctm) {
            return;
        }
        ctrlRef.current = event.ctrlKey || event.metaKey;
        snapRef.current = OriginSnap.start({ input: buildInput(ctrlRef.current), ctm, size });
        setDrag({ before: store.getState()[headType].origin, target: null, cursor: { x: event.clientX, y: event.clientY } });
    }, [disabled, getScreenCTM, buildInput, size, store, headType]);

    useEffect(() => {
        if (!drag) {
            return undefined;
        }
        const pick = (event: MouseEvent) => {
            const snap = snapRef.current;
            if (!snap) {
                return;
            }
            const ctrl = event.ctrlKey || event.metaKey;
            if (ctrl !== ctrlRef.current) {
                ctrlRef.current = ctrl;
                snap.rebuild(buildInput(ctrl));
            }
            const target = snap.pick({ x: event.clientX, y: event.clientY });
            const previous = dragRef.current;
            // no target: the marker stays at its last snapped point
            const next = target || previous?.target || null;
            snap.show(next);
            if (next && next !== previous?.target) {
                dispatch(originActions.setOriginPreview(headType, targetOrigin(next, coordinateMode.value)));
            }
            setDrag(d => (d ? { ...d, target: next, cursor: { x: event.clientX, y: event.clientY } } : d));
        };
        const onMove = (event: MouseEvent) => pick(event);
        const onUp = (event: MouseEvent) => {
            pick(event);
            const state = dragRef.current;
            endDrag();
            if (state?.target) {
                const { origin: next, removedOffset } = originAfterDrop(state.before, targetOrigin(state.target, coordinateMode.value));
                dispatch(originActions.applyOrigin(headType, next, { source: 'drop', removedOffset, label: targetLabel(state.target, t, false) }));
            }
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                // cancel: no history, and the selection stays (the editor's Esc must not see it)
                event.preventDefault();
                event.stopImmediatePropagation();
                endDrag();
            } else if (event.key === 'Control' || event.key === 'Meta') {
                const snap = snapRef.current;
                const ctrl = event.type === 'keydown';
                if (snap && ctrl !== ctrlRef.current) {
                    ctrlRef.current = ctrl;
                    snap.rebuild(buildInput(ctrl));
                }
            }
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', onUp, true);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('keyup', onKey, true);
        return () => {
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', onUp, true);
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('keyup', onKey, true);
        };
    }, [!!drag, buildInput, coordinateMode, dispatch, endDrag, headType]); // eslint-disable-line react-hooks/exhaustive-deps

    // leaving the editor cancels a drag
    useEffect(() => {
        if (!shown && dragRef.current) {
            endDrag();
        }
    }, [shown, endDrag]);

    const ctm = shown ? getScreenCTM() : null;
    const root = rootRef.current?.getBoundingClientRect();
    if (!ctm || !root) {
        return <div ref={rootRef} className={styles.overlay} data-origin-overlay data-rendering={renderingTimestamp} />;
    }
    const p = toOverlay(ctm, root, size, at);
    // the dot gives way to a resize handle of the selection on it (the arrows still grab)
    const dotYields = Array.from(document.querySelectorAll('[data-type="resize"]')).some((grip) => {
        const r = grip.getBoundingClientRect();
        if (!r.width && !r.height) {
            return false;
        }
        return Math.hypot(r.left + r.width / 2 - root.left - p.x, r.top + r.height / 2 - root.top - p.y) <= HANDLE_PX + Math.max(r.width, r.height) / 2;
    });
    let ghost = drag?.target ? toOverlay(ctm, root, size, drag.target.point) : null;
    if (!drag && previewPoint) {
        ghost = toOverlay(ctm, root, size, previewPoint);
    }
    const tip = isRotate ? t('key-CncLaser/Origin-Only on flat workpieces') : t('key-CncLaser/Origin-Drag to move · double-click for details');
    const grabProps = {
        onMouseDown,
        'aria-disabled': disabled || undefined,
        style: { cursor: disabled ? 'not-allowed' : 'move' },
    };

    let label = null;
    if (drag?.target && ghost) {
        const text = targetLabel(drag.target, t);
        const labelSize = { width: Math.max(60, text.length * 6.8 + 16), height: 22 };
        const cursor = { x: drag.cursor.x - root.left, y: drag.cursor.y - root.top };
        const view = { x: 0, y: 0, width: root.width, height: root.height };
        const place = placeLabel({ cursor, avoid: [ghost], size: labelSize, view, cursorSize: CURSOR_SIZE });
        label = (
            <span className={styles.label} data-origin-label style={{ left: place.x, top: place.y }}>
                {text}
            </span>
        );
    }
    const narrow = root.width < NARROW_PX;

    return (
        <div ref={rootRef} className={styles.overlay} data-origin-overlay data-rendering={renderingTimestamp}>
            <svg className={styles.graphics} width={root.width} height={root.height}>
                {ghost && <Marker at={ghost} ghost />}
                <g data-origin-marker data-origin-x={at.x} data-origin-y={at.y}>
                    <Marker at={p} />
                    <rect
                        className={styles.grab}
                        data-origin-grab="x"
                        x={p.x + DOT_PX / 2}
                        y={p.y - GRAB_PX / 2}
                        width={ARROW_PX - DOT_PX / 2}
                        height={GRAB_PX}
                        {...grabProps}
                    >
                        <title>{tip}</title>
                    </rect>
                    <rect
                        className={styles.grab}
                        data-origin-grab="y"
                        x={p.x - GRAB_PX / 2}
                        y={p.y - ARROW_PX}
                        width={GRAB_PX}
                        height={ARROW_PX - DOT_PX / 2}
                        {...grabProps}
                    >
                        <title>{tip}</title>
                    </rect>
                    <circle
                        className={styles.grab}
                        data-origin-grab="dot"
                        cx={p.x}
                        cy={p.y}
                        r={DOT_PX}
                        {...grabProps}
                        style={{ ...grabProps.style, pointerEvents: dotYields ? 'none' : undefined }}
                    >
                        <title>{tip}</title>
                    </circle>
                </g>
            </svg>
            {label}
            {drag && (
                <div className={styles.hint} data-origin-hint>
                    {!narrow && <span>{t('key-CncLaser/Origin-Moving the work origin · snaps to frame points')}</span>}
                    <span className={styles.keys}>{t('key-CncLaser/Origin-Ctrl: inside groups · Esc: cancel')}</span>
                </div>
            )}
        </div>
    );
};

export default OriginMarker;
