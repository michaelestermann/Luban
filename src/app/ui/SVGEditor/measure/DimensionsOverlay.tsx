import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { PAGE_EDITOR } from '../../../constants';
import { actions as editorActions } from '../../../flux/editor';
import i18n from '../../../lib/i18n';
import { useHelpers } from '../rail/helper-switches';
import { allObjectChains, Bounds, chainScope, dimensionChains, DimensionSegment, moveForDimension, workpieceBox } from './dimension-chains';
import { formatMm } from './geometry-length';
import styles from './measure-overlay.styl';

const PINK = '#be185d';
const TICK = 5;

type Matrix = DOMMatrix | SVGMatrix;

interface DimensionsOverlayProps {
    headType: string;
    mode: string;
    editing: boolean;
    isActive: boolean;
    getScreenCTM: () => Matrix | null;
}

interface Snapshot {
    key: string;
    // overlay origin on the screen
    left: number;
    top: number;
    ctm: Matrix | null;
    selection: Bounds | null;
    segments: DimensionSegment[];
}

const EMPTY: Snapshot = { key: '', left: 0, top: 0, ctm: null, selection: null, segments: [] };

const apply = (m: Matrix, x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });

// box of an element in canvas coordinates (screen box mapped back; the view is never rotated)
function canvasBounds(elem: Element, inverse: Matrix): Bounds | null {
    const r = elem.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
        return null;
    }
    const a = apply(inverse, r.left, r.top);
    const b = apply(inverse, r.right, r.bottom);
    return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}

const union = (boxes: Bounds[]): Bounds | null => (boxes.length === 0 ? null : {
    minX: Math.min(...boxes.map(b => b.minX)),
    minY: Math.min(...boxes.map(b => b.minY)),
    maxX: Math.max(...boxes.map(b => b.maxX)),
    maxY: Math.max(...boxes.map(b => b.maxY)),
});

/**
 * Dimension chains (switch "Dimensions"): pink distances of the selection to the workpiece edges and
 * to the neighbouring objects. A click on a value of the selection makes it editable; Enter moves the
 * selection so that this distance becomes the typed value (one undo step).
 */
const DimensionsOverlay: React.FC<DimensionsOverlayProps> = ({ headType, mode, editing, isActive, getScreenCTM }) => {
    const dispatch = useDispatch();
    const helpers = useHelpers();
    const options = helpers.dimensions;
    const page = useSelector(state => state[headType]?.page);
    const modelGroup = useSelector(state => state[headType]?.modelGroup);
    const SVGActions = useSelector(state => state[headType]?.SVGActions);
    const size = useSelector(state => state?.machine?.size);
    const coordinateSize = useSelector(state => state[headType]?.coordinateSize);
    const coordinateMode = useSelector(state => state[headType]?.coordinateMode);
    const renderingTimestamp = useSelector(state => state[headType]?.renderingTimestamp);
    const active = options.on && isActive && page === PAGE_EDITOR && mode === 'select' && !editing;
    const rootRef = useRef<HTMLDivElement>(null);
    const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
    // index of the segment whose label is being edited
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [draft, setDraft] = useState('');

    // selected leaves, the selection array they belong to (a new array per selection change) and the boxes
    // of the other objects: rebuilt when the objects, the selection or the view change, not while dragging
    const cacheRef = useRef<{ key: string; flat: { elem: Element }[]; selected: unknown[]; others: Bounds[] } | null>(null);

    // Every frame only a few numbers are compared (view, render timestamp, selection and its box); the
    // objects are measured again only when one of them changes.
    useEffect(() => {
        if (!active) {
            setSnapshot(EMPTY);
            setEditIndex(null);
            return undefined;
        }
        cacheRef.current = null;
        let frameKey = '';
        let frame = 0;
        const update = () => {
            frame = requestAnimationFrame(update);
            const ctm = getScreenCTM();
            const root = rootRef.current?.getBoundingClientRect();
            if (!ctm || !root || !modelGroup) {
                return;
            }
            const selectedModels = modelGroup.getSelectedModelArray();
            // the selection frame follows the selection while it is dragged
            const frameElem = SVGActions?.svgContentGroup?.operatorPoints?.allSelectedElementsBox;
            const fr = frameElem && selectedModels.length ? frameElem.getBoundingClientRect() : null;
            const viewKey = [ctm.a, ctm.d, ctm.e, ctm.f, root.left, root.top].join('|');
            const nextKey = [viewKey, renderingTimestamp, modelGroup.models?.length, selectedModels.length,
                fr ? `${fr.left},${fr.top},${fr.width},${fr.height}` : ''].join('|');
            const cache = cacheRef.current;
            if (nextKey === frameKey && cache?.selected === selectedModels) {
                return;
            }
            frameKey = nextKey;
            const inverse = ctm.inverse();
            const staticKey = [viewKey, renderingTimestamp, modelGroup.models?.length].join('|');
            let current = cache;
            if (!current || current.key !== staticKey || current.selected !== selectedModels) {
                const flat = (modelGroup.getModels?.() || []).reduce((all, m) => all.concat(m.children || [m]), [])
                    .filter(m => m.elem && m.visible !== false && m.elem.isConnected);
                const selectedLeaves = new Set(selectedModels.reduce((all, m) => all.concat(m.children || [m]), []));
                const others = flat.filter(m => !selectedLeaves.has(m)).map(m => canvasBounds(m.elem, inverse)).filter(Boolean);
                current = { key: staticKey, flat: flat.filter(m => selectedLeaves.has(m)), selected: selectedModels, others };
                cacheRef.current = current;
            }
            const selectedBoxes = current.flat.map(m => canvasBounds(m.elem, inverse)).filter(Boolean);
            const selection = union(selectedBoxes);
            const work = size && coordinateSize && coordinateMode
                ? workpieceBox(size, coordinateSize, coordinateMode.setting.sizeMultiplyFactor) : null;
            let segments: DimensionSegment[] = [];
            if (chainScope(options.scope, current.others.length + selectedBoxes.length) === 'all') {
                segments = allObjectChains(current.others.concat(selectedBoxes), work, options);
            } else if (selection) {
                segments = dimensionChains(selection, current.others, work, options);
            }
            setSnapshot({ key: nextKey, left: root.left, top: root.top, ctm, selection, segments });
        };
        update();
        return () => cancelAnimationFrame(frame);
    }, [active, getScreenCTM, modelGroup, SVGActions, renderingTimestamp, size, coordinateSize, coordinateMode, options]);

    // the edited label belongs to a segment that may disappear while typing
    useEffect(() => {
        if (editIndex !== null && !snapshot.segments[editIndex]?.editable) {
            setEditIndex(null);
        }
    }, [snapshot, editIndex]);

    const commit = (seg: DimensionSegment) => {
        const value = Number(draft.replace(',', '.'));
        setEditIndex(null);
        if (!Number.isFinite(value) || value < 0 || !snapshot.selection) {
            return;
        }
        const { dx, dy } = moveForDimension(seg, snapshot.selection, value);
        const elements = SVGActions?.getSelectedElements?.() || [];
        const t = SVGActions?.getSelectedElementsTransformation?.();
        if (!elements.length || !t || (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9)) {
            return;
        }
        // same path as the X / Y fields of Position & size: one undo step
        dispatch(editorActions.moveElementsImmediately(headType, elements, { newX: t.x + dx, newY: t.y + dy }));
    };

    const { ctm, segments } = snapshot;
    if (!active || !ctm || segments.length === 0) {
        return <div ref={rootRef} className={styles.overlay} />;
    }
    const toLocal = (x: number, y: number) => {
        const p = apply(ctm, x, y);
        return { x: p.x - snapshot.left, y: p.y - snapshot.top };
    };

    return (
        <div ref={rootRef} className={styles.overlay}>
            <svg className={styles.graphics} width="100%" height="100%" aria-hidden="true">
                <g stroke={PINK} strokeWidth={1.2} fill="none">
                    {segments.map((s, i) => {
                        const a = s.axis === 'x' ? toLocal(s.from, s.at) : toLocal(s.at, s.from);
                        const b = s.axis === 'x' ? toLocal(s.to, s.at) : toLocal(s.at, s.to);
                        const tick = s.axis === 'x'
                            ? `M${a.x} ${a.y - TICK}v${TICK * 2}M${b.x} ${b.y - TICK}v${TICK * 2}`
                            : `M${a.x - TICK} ${a.y}h${TICK * 2}M${b.x - TICK} ${b.y}h${TICK * 2}`;
                        // eslint-disable-next-line react/no-array-index-key
                        return <path key={i} d={`M${a.x} ${a.y}L${b.x} ${b.y}${tick}`} />;
                    })}
                </g>
            </svg>
            {segments.map((s, i) => {
                const a = s.axis === 'x' ? toLocal(s.from, s.at) : toLocal(s.at, s.from);
                const b = s.axis === 'x' ? toLocal(s.to, s.at) : toLocal(s.at, s.to);
                if (Math.hypot(b.x - a.x, b.y - a.y) < 2) {
                    return null;
                }
                // label beside the middle of the line: below horizontal lines, right of vertical ones
                const style = s.axis === 'x'
                    ? { left: (a.x + b.x) / 2, top: a.y + 4, transform: 'translateX(-50%)' }
                    : { left: a.x + 4, top: (a.y + b.y) / 2, transform: 'translateY(-50%)' };
                if (editIndex === i) {
                    return (
                        <input
                            // eslint-disable-next-line react/no-array-index-key
                            key={i}
                            className={styles['dimension-input']}
                            style={style}
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus
                            aria-label={i18n._('key-CncLaser/Dimensions-Distance in mm')}
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onFocus={e => e.target.select()}
                            onBlur={() => setEditIndex(null)}
                            onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') {
                                    commit(s);
                                } else if (e.key === 'Escape') {
                                    setEditIndex(null);
                                }
                            }}
                        />
                    );
                }
                return s.editable ? (
                    <button
                        // eslint-disable-next-line react/no-array-index-key
                        key={i}
                        type="button"
                        className={styles['dimension-label']}
                        style={style}
                        title={i18n._('key-CncLaser/Dimensions-Click to type a new distance')}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={() => {
                            setDraft(formatMm(s.value));
                            setEditIndex(i);
                        }}
                    >
                        {formatMm(s.value)}
                    </button>
                ) : (
                    // eslint-disable-next-line react/no-array-index-key
                    <span key={i} className={styles['dimension-label']} style={style}>{formatMm(s.value)}</span>
                );
            })}
        </div>
    );
};

export default DimensionsOverlay;
