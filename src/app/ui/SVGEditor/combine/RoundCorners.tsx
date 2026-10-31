import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';

import { actions as editorActions, roundCornerTargets } from '../../../flux/editor';
import i18n from '../../../lib/i18n';
import { RoundTarget, roundRadiusLimit, roundTargetResult } from '../path-edit/round-corners';
import overlayStyles from '../measure/measure-overlay.styl';
import styles from './round-corners.styl';

type Matrix = DOMMatrix | SVGMatrix;

export interface RoundCornersSession {
    radius: number;
    // screen point the values open at: centred below a button, or right of the cursor ('start')
    anchor: { x: number; y: number; align?: 'center' | 'start' };
}

interface RoundCornersProps {
    headType: 'laser' | 'cnc';
    isActive: boolean;
    getScreenCTM: () => Matrix | null;
}

const BLUE = '#1d4ed8';
const WIDTH = 248;
const round2 = (value: number) => Math.round(value * 100) / 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const targetKey = (targets: RoundTarget<any>[]) => targets
    .map(t => `${t.model.modelID}:${t.model.elem?.getAttribute('transform')}:${t.kind === 'path' ? t.d.length : t.corners.width}`).join('|');

/**
 * "Round corners" (selection bar, context menu, key R): the radius in a small dialog at the button or
 * the cursor, a dashed preview on the canvas. Enter applies to all rectangles and editable paths of the
 * selection (one undo step), Esc or a click elsewhere cancels.
 */
const RoundCorners: React.FC<RoundCornersProps> = ({ headType, isActive, getScreenCTM }) => {
    const dispatch = useDispatch();
    const session: RoundCornersSession | null = useSelector(state => state[headType]?.roundCornersSession);
    const modelGroup = useSelector(state => state[headType]?.modelGroup);
    const mode = useSelector(state => state[headType]?.SVGCanvasMode);
    const editing = useSelector(state => !!state[headType]?.SVGCanvasExt?.elem);
    useSelector(state => state[headType]?.renderingTimestamp);
    const [text, setText] = useState('');
    const [ctmKey, setCtmKey] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

    const open = !!session && isActive;
    const targets = open ? roundCornerTargets(modelGroup) : [];
    const key = targetKey(targets);
    const cancel = () => dispatch(editorActions.cancelRoundCorners(headType));

    // the values open with the radius selected
    useEffect(() => {
        if (open) {
            setText(String(round2(session.radius)));
            setPosition(null);
        }
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (open && position) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [open, !!position]); // eslint-disable-line react-hooks/exhaustive-deps

    // nothing left to round, another mode or point editing: close
    useEffect(() => {
        if (session && (targets.length === 0 || mode !== 'select' || editing)) {
            cancel();
        }
    }, [key, mode, editing, !!session]); // eslint-disable-line react-hooks/exhaustive-deps

    // place it below the anchor, inside the window (above it if there is no room)
    useLayoutEffect(() => {
        if (!open || !dialogRef.current) {
            return;
        }
        const height = dialogRef.current.offsetHeight;
        // next to the cursor it must not cover the shape that was clicked
        const atCursor = session.anchor.align === 'start';
        const wanted = atCursor ? session.anchor.x + 16 : session.anchor.x - WIDTH / 2;
        const left = Math.min(Math.max(8, wanted), window.innerWidth - WIDTH - 8);
        let top = session.anchor.y;
        if (top + height > window.innerHeight - 8) {
            top = Math.max(8, session.anchor.y - height - 16);
        }
        if (!position || position.left !== left || position.top !== top) {
            setPosition({ left, top });
        }
    }, [open, session?.anchor.x, session?.anchor.y, position, text]); // eslint-disable-line react-hooks/exhaustive-deps

    // Esc anywhere and a click outside cancel
    useEffect(() => {
        if (!open) {
            return undefined;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                event.preventDefault();
                cancel();
            }
        };
        const onMouseDown = (event: MouseEvent) => {
            if (!dialogRef.current?.contains(event.target as Node)) {
                cancel();
            }
        };
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('mousedown', onMouseDown, true);
        return () => {
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('mousedown', onMouseDown, true);
        };
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    // the preview follows zoom and pan
    useEffect(() => {
        if (!open) {
            return undefined;
        }
        let frame = 0;
        const follow = () => {
            const ctm = getScreenCTM();
            if (ctm) {
                const next = `${ctm.a},${ctm.d},${ctm.e},${ctm.f}`;
                setCtmKey(prev => (prev === next ? prev : next));
            }
            frame = requestAnimationFrame(follow);
        };
        follow();
        return () => cancelAnimationFrame(frame);
    }, [open, getScreenCTM]);

    if (!open) {
        return <div ref={rootRef} className={overlayStyles.overlay} />;
    }

    const value = text.trim() === '' ? NaN : Number(text.replace(',', '.'));
    const valid = Number.isFinite(value) && value >= 0;
    const radius = valid ? value : 0;
    const rects = targets.filter(t => t.kind === 'rect').map(t => (t.kind === 'rect' ? t.corners : null));
    const max = roundRadiusLimit(rects);
    const results = targets.map(target => ({ target, result: roundTargetResult(target, radius) }));
    const pathClamped = results.some(r => r.target.kind === 'path' && r.result?.clamped);

    const onChange = (next: string) => {
        setText(next);
        const n = Number(next.replace(',', '.'));
        if (next.trim() !== '' && Number.isFinite(n) && n >= 0) {
            dispatch(editorActions.updateRoundCorners(headType, n));
        }
    };
    const apply = () => {
        if (valid) {
            dispatch(editorActions.updateRoundCorners(headType, value));
            dispatch(editorActions.applyRoundCorners(headType));
        }
    };

    // dashed outlines in screen space (element coordinates through each element's screen matrix)
    const root = rootRef.current?.getBoundingClientRect();
    const previews = root && ctmKey ? results.map(({ target, result }) => {
        const ctm = (target.model.elem as SVGGraphicsElement)?.getScreenCTM?.();
        if (!result || !ctm) {
            return null;
        }
        const matrix = `matrix(${ctm.a} ${ctm.b} ${ctm.c} ${ctm.d} ${ctm.e - root.left} ${ctm.f - root.top})`;
        return (
            <path
                key={target.model.modelID}
                d={result.d}
                transform={matrix}
                fill="none"
                stroke={BLUE}
                strokeWidth={1.4}
                strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
            />
        );
    }) : null;

    const dialog = (
        <div
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            data-round-dialog="true"
            aria-label={i18n._('key-CncLaser/RoundCorners-Round corners')}
            style={{ width: WIDTH, left: position?.left ?? -9999, top: position?.top ?? -9999 }}
        >
            <div className={styles.title}>{i18n._('key-CncLaser/RoundCorners-Round corners')}</div>
            <label className={styles.field}>
                <span className={styles.label}>{i18n._('key-CncLaser/RoundCorners-Radius')}</span>
                <input
                    ref={inputRef}
                    className={styles.input}
                    type="text"
                    inputMode="decimal"
                    value={text}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            apply();
                        } else if (event.key === 'Escape') {
                            event.preventDefault();
                            cancel();
                        }
                    }}
                />
                <span className={styles.unit}>mm</span>
            </label>
            {rects.length > 0 && (
                <div className={valid && value > max + 1e-9 ? styles.warning : styles.hint}>
                    {rects.length === 1
                        ? i18n._('key-CncLaser/Corners-At most {{max}} mm (half the shorter side)', { max: round2(max) })
                        : i18n._('key-CncLaser/RoundCorners-Each rectangle gets at most half its shorter side (smallest: {{max}} mm)', { max: round2(max) })}
                </div>
            )}
            {pathClamped && (
                <div className={styles.hint}>{i18n._('key-CncLaser/RoundCorners-Corners with short sides get a smaller radius')}</div>
            )}
            {!valid && <div className={styles.warning}>{i18n._('key-CncLaser/RoundCorners-Enter a radius of 0 or more')}</div>}
            <div className={styles.buttons}>
                <button type="button" className={styles.cancel} onClick={cancel}>
                    {i18n._('key-CncLaser/RoundCorners-Cancel')}
                </button>
                <button type="button" className={styles.apply} disabled={!valid} onClick={apply}>
                    {i18n._('key-CncLaser/RoundCorners-Apply')}
                </button>
            </div>
        </div>
    );

    return (
        <div ref={rootRef} className={overlayStyles.overlay}>
            {root && (
                <svg className={overlayStyles.graphics} width={root.width} height={root.height} aria-hidden="true" data-round-preview="true">
                    {previews}
                </svg>
            )}
            {ReactDOM.createPortal(dialog, document.body)}
        </div>
    );
};

export default RoundCorners;
