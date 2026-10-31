import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { PAGE_EDITOR } from '../../../constants';
import { ShortcutHandlerPriority, ShortcutManager } from '../../../lib/shortcut';
import { parsePath } from '../path-edit/path-geometry';
import { boxSnapPoints, formatMeasure, measureInfo, nearestSnap, Point, SnapPoint } from './measure-math';
import styles from './measure-overlay.styl';

const PINK = '#be185d';
// snapping reach in screen pixels
const SNAP_PX = 8;

type Matrix = DOMMatrix | SVGMatrix;

interface MeasureOverlayProps {
    headType: string;
    mode: string;
    // point editing runs (select mode with an element)
    editing: boolean;
    isActive: boolean;
    getScreenCTM: () => Matrix | null;
    getSvgContainer: () => SVGSVGElement | null;
    setMode: (mode: string) => void;
}

interface MeasureState {
    start: Point | null;
    end: Point | null;
    fixed: boolean;
    snap: SnapPoint | null;
}

const EMPTY: MeasureState = { start: null, end: null, fixed: false, snap: null };

const apply = (m: Matrix, p: Point): Point => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });

// snap points of all visible objects in canvas coordinates
function collectSnapPoints(models, ctm: Matrix): SnapPoint[] {
    const inverse = ctm.inverse();
    const points: SnapPoint[] = [];
    const flat = models.reduce((all, m) => all.concat(m.children || [m]), []);
    for (const model of flat) {
        const elem = model.elem as SVGGraphicsElement;
        if (!elem || model.visible === false || !elem.isConnected) {
            continue;
        }
        const r = elem.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) {
            continue;
        }
        const a = apply(inverse, { x: r.left, y: r.top });
        const b = apply(inverse, { x: r.right, y: r.bottom });
        points.push(...boxSnapPoints({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }));
        if (elem.tagName.toLowerCase() === 'path') {
            // end points of the path, from element to canvas coordinates
            const toCanvas = inverse.multiply(elem.getScreenCTM());
            try {
                for (const sub of parsePath(elem.getAttribute('d') || '')) {
                    for (const n of sub.nodes) {
                        points.push({ ...apply(toCanvas, n), kind: 'end' });
                    }
                }
            } catch (e) {
                // unparsable path: its box points are enough
            }
        }
    }
    return points;
}

/**
 * Measure tool: click two points, the distance with Δx, Δy and angle is shown on the canvas.
 * Snaps to end points of paths, centres and box corners / mid points. Nothing is added to the project.
 */
const MeasureOverlay: React.FC<MeasureOverlayProps> = ({ headType, mode, editing, isActive, getScreenCTM, getSvgContainer, setMode }) => {
    const page = useSelector(state => state[headType]?.page);
    const modelGroup = useSelector(state => state[headType]?.modelGroup);
    const active = mode === 'measure' && isActive && page === PAGE_EDITOR;
    const [measure, setMeasure] = useState<MeasureState>(EMPTY);
    const [ctmKey, setCtmKey] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);
    const snapRef = useRef<{ key: string; points: SnapPoint[] }>({ key: '', points: [] });
    const modeRef = useRef({ mode, editing, isActive, page, setMode });
    modeRef.current = { mode, editing, isActive, page, setMode };

    // key M enters the tool, Esc leaves it
    useEffect(() => {
        const handler = {
            title: 'Measure',
            priority: ShortcutHandlerPriority.Widget,
            isActive: () => modeRef.current.isActive && modeRef.current.page === PAGE_EDITOR,
            shortcuts: {
                'MEASURE-TOOL': {
                    keys: ['m'],
                    callback: () => {
                        const m = modeRef.current.mode;
                        if (!modeRef.current.editing && (m === 'select' || m === 'measure' || m === 'rect' || m === 'ellipse')) {
                            modeRef.current.setMode(m === 'measure' ? 'select' : 'measure');
                        }
                    }
                },
            }
        };
        ShortcutManager.register(handler);
        return () => ShortcutManager.unregister(handler);
    }, []);

    useEffect(() => {
        if (!active) {
            setMeasure(EMPTY);
            return undefined;
        }
        const handler = {
            title: 'MeasureMode',
            priority: ShortcutHandlerPriority.Widget,
            isActive: () => true,
            shortcuts: {
                'MEASURE-ESC': {
                    keys: ['esc'],
                    callback: () => modeRef.current.setMode('select')
                },
            }
        };
        ShortcutManager.register(handler);

        const container = getSvgContainer();
        const pick = (event: MouseEvent): { point: Point; snap: SnapPoint | null } | null => {
            const ctm = getScreenCTM();
            if (!ctm) {
                return null;
            }
            const key = `${ctm.a},${ctm.e},${ctm.f},${modelGroup?.getModels?.().length}`;
            if (snapRef.current.key !== key) {
                snapRef.current = { key, points: collectSnapPoints(modelGroup?.getModels?.() || [], ctm) };
            }
            const point = apply(ctm.inverse(), { x: event.clientX, y: event.clientY });
            const snap = nearestSnap(snapRef.current.points, point, SNAP_PX / Math.abs(ctm.a || 1));
            return { point: snap ? { x: snap.x, y: snap.y } : point, snap };
        };
        const onMouseDown = (event: MouseEvent) => {
            if (event.button !== 0 || event.ctrlKey || event.metaKey) {
                return;
            }
            const p = pick(event);
            if (!p) {
                return;
            }
            setMeasure(prev => (!prev.start || prev.fixed
                ? { start: p.point, end: p.point, fixed: false, snap: p.snap }
                : { ...prev, end: p.point, fixed: true, snap: p.snap }));
        };
        const onMouseMove = (event: MouseEvent) => {
            const p = pick(event);
            if (!p) {
                return;
            }
            setMeasure(prev => (prev.start && !prev.fixed ? { ...prev, end: p.point, snap: p.snap } : { ...prev, snap: p.snap }));
        };
        container?.addEventListener('mousedown', onMouseDown);
        container?.addEventListener('mousemove', onMouseMove);

        // follow zoom and pan
        let frame = 0;
        const follow = () => {
            const ctm = getScreenCTM();
            if (ctm) {
                const key = `${ctm.a},${ctm.d},${ctm.e},${ctm.f}`;
                setCtmKey(prev => (prev === key ? prev : key));
            }
            frame = requestAnimationFrame(follow);
        };
        follow();
        return () => {
            ShortcutManager.unregister(handler);
            container?.removeEventListener('mousedown', onMouseDown);
            container?.removeEventListener('mousemove', onMouseMove);
            cancelAnimationFrame(frame);
            snapRef.current = { key: '', points: [] };
        };
    }, [active, getScreenCTM, getSvgContainer, modelGroup]);

    const ctm = active ? getScreenCTM() : null;
    const root = rootRef.current?.getBoundingClientRect();
    if (!active || !ctm || !root || !ctmKey) {
        return <div ref={rootRef} className={styles.overlay} />;
    }
    const toScreen = (p: Point) => {
        const s = apply(ctm, p);
        return { x: s.x - root.left, y: s.y - root.top };
    };
    const { start, end, snap } = measure;
    const a = start ? toScreen(start) : null;
    const b = end ? toScreen(end) : null;
    const s = snap ? toScreen(snap) : null;
    const text = start && end ? formatMeasure(measureInfo(start, end)) : null;
    // label beside the middle of the line, inside the view
    const labelW = 150;
    const labelH = 40;
    let labelX = 0;
    let labelY = 0;
    if (a && b) {
        labelX = Math.max(4, Math.min((a.x + b.x) / 2 - labelW / 2, root.width - labelW - 4));
        labelY = Math.max(4, Math.min((a.y + b.y) / 2 - labelH - 12, root.height - labelH - 4));
    }

    return (
        <div ref={rootRef} className={styles.overlay}>
            <svg className={styles.graphics} width={root.width} height={root.height} aria-hidden="true">
                {s && <rect x={s.x - 5} y={s.y - 5} width={10} height={10} fill="none" stroke={PINK} strokeWidth={1.6} transform={`rotate(45 ${s.x} ${s.y})`} />}
                {a && b && (
                    <g stroke={PINK} strokeWidth={1.6}>
                        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                        <circle cx={a.x} cy={a.y} r={4.5} fill="#ffffff" />
                        <circle cx={b.x} cy={b.y} r={4.5} fill="#ffffff" />
                    </g>
                )}
                {text && (a.x !== b.x || a.y !== b.y) && (
                    <g>
                        <rect x={labelX} y={labelY} width={labelW} height={labelH} rx={8} fill="#1f2430" />
                        <text x={labelX + labelW / 2} y={labelY + 17} textAnchor="middle" fontSize={13} fontWeight={700} fill="#ffffff">{text.distance}</text>
                        <text x={labelX + labelW / 2} y={labelY + 32} textAnchor="middle" fontSize={10} fill="#c7cbd4">{text.details}</text>
                    </g>
                )}
            </svg>
        </div>
    );
};

export default MeasureOverlay;
