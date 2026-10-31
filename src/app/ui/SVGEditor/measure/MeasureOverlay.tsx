import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { PAGE_EDITOR } from '../../../constants';
import i18n from '../../../lib/i18n';
import { ShortcutHandlerPriority, ShortcutManager } from '../../../lib/shortcut';
import { parsePath } from '../path-edit/path-geometry';
import { rectElementRadius } from '../path-edit/rect-corners';
import { formatMm } from './geometry-length';
import { boxSnapPoints, formatMeasure, measureInfo, nearestSnap, Point, SnapPoint } from './measure-math';
import {
    boxOutline, Dim, formatDim, formatObjectMeasure, Matrix6, measureObject, outlineBounds, pickObject, PickCandidate, Polyline, ShapeSpec, transform
} from './measure-pick';
import {
    formatSegmentMeasure, formatSegmentSum, isUniform, measureSegment, MeasureSegment, parsedSegments, pathSegments, pickSegment, rectSegments,
    SegmentMeasurement
} from './measure-segments';
import { modelGeometry, svgSource } from './model-geometry';
import styles from './measure-overlay.styl';

const PINK = '#be185d';
// snapping reach in screen pixels
const SNAP_PX = 8;
// on a focused object: snap points this near win over a part of the object, the part wins up to SNAP_PX
const SNAP_NEAR_PX = 4;
// hover reach of a part (segment) of the focused object in screen pixels
const SEGMENT_PX = 4;
// hover reach of an outline in screen pixels
const PICK_PX = 6;
// closed shapes up to this screen size can also be picked inside
const FILL_PX = 24;
const TICK = 5;
// the mode bar covers the top of the canvas, the tool bar its left side
const VIEW_TOP_PX = 64;
const VIEW_LEFT_PX = 76;

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

// a pickable object; outlines in canvas coordinates
interface Candidate extends PickCandidate {
    model;
}

interface MeasureState {
    start: Point | null;
    end: Point | null;
    fixed: boolean;
    snap: SnapPoint | null;
    // object under the cursor (no first point set, no snap point near)
    hover: Candidate | null;
    // clicked (focused) object, its measurement is shown while no part of it is chosen
    picked: Candidate | null;
    // part of the focused object under the cursor (index into its segments), -1 for none
    hoverSegment: number;
    // chosen parts of the focused object (Shift+click adds up several)
    segments: number[];
}

const EMPTY: MeasureState = { start: null, end: null, fixed: false, snap: null, hover: null, picked: null, hoverSegment: -1, segments: [] };

const apply = (m: Matrix, p: Point): Point => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
const toMatrix6 = (m: Matrix): Matrix6 => [m.a, m.b, m.c, m.d, m.e, m.f];
const num = (elem: Element, name: string) => Number(elem.getAttribute(name)) || 0;
const flatModels = models => models.reduce((all, m) => all.concat(m.children || [m]), []);

// snap points of all visible objects in canvas coordinates
function collectSnapPoints(models, ctm: Matrix): SnapPoint[] {
    const inverse = ctm.inverse();
    const points: SnapPoint[] = [];
    for (const model of flatModels(models)) {
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

// shape of a model element in element coordinates with its matrix to canvas coordinates; null = nothing to measure
function shapeSpec(model, ctm: Matrix, onLoaded: () => void): ShapeSpec | null {
    const elem = model.elem as SVGGraphicsElement;
    if (!elem || model.visible === false || !elem.isConnected || model.config?.svgNodeName === 'text') {
        return null;
    }
    const screen = elem.getScreenCTM();
    if (!screen) {
        return null;
    }
    const matrix = toMatrix6(ctm.inverse().multiply(screen));
    switch (elem.tagName.toLowerCase()) {
        case 'path':
            try {
                return { type: 'path', path: parsePath(elem.getAttribute('d') || ''), matrix };
            } catch (e) {
                return null;
            }
        case 'line':
            return { type: 'line', x1: num(elem, 'x1'), y1: num(elem, 'y1'), x2: num(elem, 'x2'), y2: num(elem, 'y2'), matrix };
        case 'circle':
            return { type: 'ellipse', cx: num(elem, 'cx'), cy: num(elem, 'cy'), rx: num(elem, 'r'), ry: num(elem, 'r'), matrix };
        case 'ellipse':
            return { type: 'ellipse', cx: num(elem, 'cx'), cy: num(elem, 'cy'), rx: num(elem, 'rx'), ry: num(elem, 'ry'), matrix };
        case 'rect': {
            const width = num(elem, 'width');
            const height = num(elem, 'height');
            const radius = rectElementRadius(elem.getAttribute('rx'), elem.getAttribute('ry'), width, height);
            return { type: 'rect', x: num(elem, 'x'), y: num(elem, 'y'), width, height, radius, matrix };
        }
        case 'image': {
            // imported SVG files cut as vectors; pictures have no outline to measure
            if (model.sourceType !== 'svg' || model.mode !== 'vector') {
                return null;
            }
            const geometry = modelGeometry(model, onLoaded)[0];
            return {
                type: 'svg',
                x: num(elem, 'x'),
                y: num(elem, 'y'),
                width: num(elem, 'width'),
                height: num(elem, 'height'),
                length: geometry?.length ?? null,
                matrix,
            };
        }
        default:
            return null;
    }
}

// outline of an imported SVG file: its parsed shapes, stretched to the image (its box while loading)
function svgOutline(model, spec: Extract<ShapeSpec, { type: 'svg' }>, onLoaded: () => void): Polyline[] {
    const box = { x: spec.x, y: spec.y, width: spec.width, height: spec.height };
    const parsed = svgSource(model, onLoaded);
    const vb = parsed?.viewBox;
    if (!parsed || !vb || !vb[2] || !vb[3]) {
        return boxOutline(box, spec.matrix);
    }
    const sx = spec.width / vb[2];
    const sy = spec.height / vb[3];
    const lines: Polyline[] = [];
    for (const shape of parsed.shapes) {
        if (shape.visibility === false) {
            continue;
        }
        for (const p of shape.paths) {
            lines.push({
                closed: p.closed,
                points: p.points.map(([x, y]) => transform(spec.matrix, { x: spec.x + (x - vb[0]) * sx, y: spec.y + (y - vb[1]) * sy })),
            });
        }
    }
    return lines.length ? lines : boxOutline(box, spec.matrix);
}

function collectCandidates(models, ctm: Matrix, onLoaded: () => void): Candidate[] {
    const result: Candidate[] = [];
    for (const model of flatModels(models)) {
        const spec = shapeSpec(model, ctm, onLoaded);
        if (!spec) {
            continue;
        }
        let outlines = spec.type === 'svg' ? svgOutline(model, spec, onLoaded) : measureObject(spec, 1).outline;
        if (spec.type === 'rect' && spec.radius > 0) {
            // with its rounded corners
            const parts = rectSegments(spec.x, spec.y, spec.width, spec.height, spec.radius, spec.matrix);
            outlines = [{ closed: true, points: parts.reduce((all, part) => all.concat(part.points), [] as Point[]) }];
        }
        result.push({ id: model.modelID, model, outlines, bounds: outlineBounds(outlines) });
    }
    return result;
}

// segments per model and placement; few objects are focused, so a small cache is enough
const segmentCache = new Map<string, MeasureSegment[]>();
const SEGMENT_CACHE_SIZE = 24;

// the parts of a model one can measure singly (none for circles and ellipses: they are one part)
function modelSegments(model, ctm: Matrix, onLoaded: () => void): MeasureSegment[] {
    const spec = shapeSpec(model, ctm, onLoaded);
    if (!spec || spec.type === 'ellipse') {
        return [];
    }
    const elem = model.elem as SVGElement;
    const attrs = ['d', 'x', 'y', 'width', 'height', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2'].map(a => elem.getAttribute(a)).join(',');
    const parsed = spec.type === 'svg' ? svgSource(model, onLoaded) : null;
    if (spec.type === 'svg' && !parsed) {
        // still loading (not cached)
        return [];
    }
    const key = `${model.modelID}|${spec.matrix.map(v => v.toFixed(6)).join(',')}|${attrs}|${model.resource?.originalFile?.path || ''}`;
    let segments = segmentCache.get(key);
    if (segments) {
        // most recently used last
        segmentCache.delete(key);
        segmentCache.set(key, segments);
        return segments;
    }
    switch (spec.type) {
        case 'path':
            segments = pathSegments(spec.path, spec.matrix);
            break;
        case 'line':
            segments = pathSegments([{
                closed: false,
                nodes: [{ x: spec.x1, y: spec.y1, in: null, out: null }, { x: spec.x2, y: spec.y2, in: null, out: null }],
            }], spec.matrix);
            break;
        case 'rect':
            segments = rectSegments(spec.x, spec.y, spec.width, spec.height, spec.radius, spec.matrix);
            break;
        case 'svg':
        default: {
            const vb = parsed.viewBox;
            if (!vb || !vb[2] || !vb[3]) {
                segments = [];
                break;
            }
            const sx = spec.width / vb[2];
            const sy = spec.height / vb[3];
            const m = spec.matrix;
            // the file is stretched to the image (preserveAspectRatio none), then placed by the model matrix
            const uniform = isUniform([m[0] * sx, m[1] * sx, m[2] * sy, m[3] * sy, 0, 0]);
            segments = parsedSegments(parsed.shapes, p => transform(m, { x: spec.x + (p.x - vb[0]) * sx, y: spec.y + (p.y - vb[1]) * sy }), uniform);
        }
    }
    segmentCache.set(key, segments);
    if (segmentCache.size > SEGMENT_CACHE_SIZE) {
        segmentCache.delete(segmentCache.keys().next().value);
    }
    return segments;
}

// rough text width for the label boxes (no measuring in the render)
const textWidth = (text: string, size: number) => text.length * size * 0.6;

const geometryWord = (key: string) => i18n._(`key-CncLaser/Geometry-${key}`);
const segmentWord = (key: string) => (key === 'Arc' || key === 'segments' ? i18n._(`key-CncLaser/Measure-${key}`) : geometryWord(key));

/**
 * Measure tool: click two points, the distance with Δx, Δy and angle is shown on the canvas.
 * Snaps to end points of paths, centres and box corners / mid points. Away from snap points the object
 * under the cursor is highlighted; clicking it shows its length, radius and diameter or size.
 * Nothing is added to the project and nothing is selected.
 */
const MeasureOverlay: React.FC<MeasureOverlayProps> = ({ headType, mode, editing, isActive, getScreenCTM, getSvgContainer, setMode }) => {
    const page = useSelector(state => state[headType]?.page);
    const modelGroup = useSelector(state => state[headType]?.modelGroup);
    const active = mode === 'measure' && isActive && page === PAGE_EDITOR;
    const [measure, setMeasure] = useState<MeasureState>(EMPTY);
    const [ctmKey, setCtmKey] = useState('');
    // an imported file has been parsed: its outline and length are known now
    const [, setLoaded] = useState(0);
    const rootRef = useRef<HTMLDivElement>(null);
    const snapRef = useRef<{ key: string; points: SnapPoint[]; candidates: Candidate[] }>({ key: '', points: [], candidates: [] });
    const modeRef = useRef({ mode, editing, isActive, page, setMode });
    modeRef.current = { mode, editing, isActive, page, setMode };
    // the shown state, for Esc and hovering the parts of the focused object
    const measureRef = useRef<MeasureState>(measure);
    measureRef.current = measure;

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
        // a first point is set and the second follows the cursor
        let measuring = false;
        // Esc steps back: chosen part -> whole object -> nothing -> leave the tool
        const stepBack = () => {
            const current = measureRef.current;
            if (current.segments.length > 0) {
                setMeasure(prev => ({ ...prev, segments: [] }));
            } else if (current.picked || current.start) {
                measuring = false;
                setMeasure(EMPTY);
            } else {
                modeRef.current.setMode('select');
            }
        };
        const handler = {
            title: 'MeasureMode',
            priority: ShortcutHandlerPriority.Widget,
            isActive: () => true,
            shortcuts: {
                'MEASURE-ESC': {
                    keys: ['esc'],
                    callback: stepBack
                },
            }
        };
        ShortcutManager.register(handler);

        const container = getSvgContainer();
        const onLoaded = () => {
            snapRef.current = { key: '', points: [], candidates: [] };
            setLoaded(n => n + 1);
        };
        const setCursor = (pointer: boolean) => {
            if (!container) {
                return;
            }
            if (pointer) {
                container.style.cursor = 'pointer';
            } else if (container.style.cursor === 'pointer') {
                container.style.cursor = 'crosshair';
            }
        };
        // the point under the cursor (snapped), the part of the focused object there, and the object there when no point snaps
        const pick = (event: MouseEvent): { point: Point; snap: SnapPoint | null; hover: Candidate | null; segment: number } | null => {
            const ctm = getScreenCTM();
            if (!ctm) {
                return null;
            }
            const models = modelGroup?.getModels?.() || [];
            const key = `${ctm.a},${ctm.e},${ctm.f},${models.length}`;
            if (snapRef.current.key !== key) {
                snapRef.current = { key, points: collectSnapPoints(models, ctm), candidates: collectCandidates(models, ctm, onLoaded) };
            }
            const scale = Math.abs(ctm.a || 1);
            const point = apply(ctm.inverse(), { x: event.clientX, y: event.clientY });
            // a part of the focused object wins over snap points, except right at an end point or corner
            // (box mid points often lie in the middle of a side, where one clicks to pick the side)
            const focused = measureRef.current.picked;
            let segment = -1;
            const ends = () => snapRef.current.points.filter(q => q.kind === 'end' || q.kind === 'corner');
            if (focused && !measuring && !nearestSnap(ends(), point, SNAP_NEAR_PX / scale)) {
                segment = pickSegment(modelSegments(focused.model, ctm, onLoaded), point, SEGMENT_PX / scale);
            }
            const snap = segment >= 0 ? null : nearestSnap(snapRef.current.points, point, SNAP_PX / scale);
            let hover: Candidate | null = null;
            if (!snap && !measuring && segment < 0) {
                const id = pickObject(snapRef.current.candidates, point, PICK_PX / scale, FILL_PX / scale);
                hover = snapRef.current.candidates.find(c => c.id === id) || null;
            }
            return { point: snap ? { x: snap.x, y: snap.y } : point, snap, hover, segment };
        };
        const onMouseDown = (event: MouseEvent) => {
            if (event.button !== 0 || event.ctrlKey || event.metaKey) {
                return;
            }
            const p = pick(event);
            if (!p) {
                return;
            }
            const current = measureRef.current;
            if (measuring) {
                measuring = false;
                setMeasure(prev => ({ ...prev, end: p.point, fixed: true, snap: p.snap, hover: null }));
            } else if (p.segment >= 0) {
                // a part of the focused object; Shift adds it to (or takes it from) the chosen parts
                const chosen = current.segments;
                let segments = [p.segment];
                if (event.shiftKey) {
                    segments = chosen.includes(p.segment) ? chosen.filter(i => i !== p.segment) : [...chosen, p.segment];
                }
                setMeasure(prev => ({ ...prev, segments, hoverSegment: p.segment }));
            } else if (p.hover) {
                // measure the whole object and focus it: its parts can be measured next
                setMeasure({ ...EMPTY, picked: p.hover, hover: p.hover });
            } else if (current.picked && !p.snap) {
                // a click into empty space ends the object measurement
                setMeasure(EMPTY);
            } else {
                measuring = true;
                setCursor(false);
                setMeasure({ ...EMPTY, start: p.point, end: p.point, snap: p.snap });
            }
        };
        const onMouseMove = (event: MouseEvent) => {
            const p = pick(event);
            if (!p) {
                return;
            }
            setCursor(!!p.hover || p.segment >= 0);
            setMeasure(prev => (measuring
                ? { ...prev, end: p.point, snap: p.snap, hover: null, hoverSegment: -1 }
                : { ...prev, snap: p.snap, hover: p.hover, hoverSegment: p.segment }));
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
            setCursor(false);
            snapRef.current = { key: '', points: [], candidates: [] };
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
    const linePoints = (line: Polyline) => line.points.map(p => {
        const s = toScreen(p);
        return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
    }).join(' ');
    // faint: the focused object while a part of it is measured
    const renderOutline = (lines: Polyline[], key: string, faint: number = 0) => (
        <g key={key} fill="none" strokeLinejoin="round" strokeLinecap="round" opacity={faint || 1}>
            {!faint && lines.map((line, i) => React.createElement(line.closed ? 'polygon' : 'polyline', {
                // eslint-disable-next-line react/no-array-index-key
                key: `glow${i}`, points: linePoints(line), stroke: PINK, strokeOpacity: 0.25, strokeWidth: 6
            }))}
            {lines.map((line, i) => React.createElement(line.closed ? 'polygon' : 'polyline', {
                // eslint-disable-next-line react/no-array-index-key
                key: `line${i}`, points: linePoints(line), stroke: PINK, strokeWidth: faint ? 1.2 : 1.6
            }))}
        </g>
    );
    const { start, end, snap, hover, picked, hoverSegment, segments: chosen } = measure;
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
        labelX = Math.max(VIEW_LEFT_PX, Math.min((a.x + b.x) / 2 - labelW / 2, root.width - labelW - 4));
        labelY = Math.max(4, Math.min((a.y + b.y) / 2 - labelH - 12, root.height - labelH - 4));
    }

    // parts of the focused object
    const reload = () => setLoaded(n => n + 1);
    const parts = picked ? modelSegments(picked.model, ctm, reload) : [];
    const chosenParts = chosen.filter(i => i < parts.length);
    const renderPart = (seg: MeasureSegment, key: string, width: number) => {
        const points = linePoints({ closed: false, points: seg.points });
        return (
            <g key={key} fill="none" strokeLinejoin="round" strokeLinecap="round">
                <polyline points={points} stroke={PINK} strokeOpacity={0.25} strokeWidth={width + 5} />
                <polyline points={points} stroke={PINK} strokeWidth={width} />
            </g>
        );
    };
    const hoverPart = picked && hoverSegment >= 0 && hoverSegment < parts.length && !chosenParts.includes(hoverSegment)
        ? renderPart(parts[hoverSegment], 'hover-part', 3.5) : null;

    // measurement of the chosen part(s): drawn along the part, the label beside it
    let partGraphics = null;
    if (picked && chosenParts.length > 0) {
        const ms: SegmentMeasurement[] = chosenParts.map(i => measureSegment(parts[i]));
        const last = ms[ms.length - 1];
        const label = ms.length > 1 ? formatSegmentSum(ms, segmentWord) : formatSegmentMeasure(last, segmentWord);
        const mid = toScreen(last.mid);
        // away from the centre of the arc, else away from the middle of the object
        let away: Point;
        if (last.centre && (last.kind === 'arc' || ms.length > 1)) {
            away = toScreen(last.centre);
        } else {
            const box = outlineBounds(picked.outlines);
            away = box ? toScreen({ x: box.x + box.width / 2, y: box.y + box.height / 2 }) : { x: mid.x, y: mid.y + 1 };
        }
        let dir = { x: mid.x - away.x, y: mid.y - away.y };
        if (last.kind === 'line' || last.kind === 'curve' || (ms.length > 1 && !last.centre)) {
            // perpendicular to the chord, on the side away from the object
            const p1 = toScreen(last.from);
            const p2 = toScreen(last.to);
            const n = { x: -(p2.y - p1.y), y: p2.x - p1.x };
            dir = n.x * dir.x + n.y * dir.y < 0 ? { x: -n.x, y: -n.y } : n;
        }
        if (last.kind === 'circle') {
            dir = { x: 1, y: 0 };
        }
        const dl = Math.hypot(dir.x, dir.y);
        dir = dl > 1e-9 ? { x: dir.x / dl, y: dir.y / dl } : { x: 0, y: -1 };
        const w = Math.max(110, textWidth(label.title, 13), textWidth(label.details, 10)) + 24;
        const h = label.details ? 40 : 28;
        // the label centre: beside the middle of the part, along dir (the other side when that leaves the view)
        const reach = 16 + Math.abs(dir.x) * (w / 2) + Math.abs(dir.y) * (h / 2);
        const fits = (cx: number, cy: number) => cx - w / 2 >= VIEW_LEFT_PX && cx + w / 2 <= root.width - 4
            && cy - h / 2 >= VIEW_TOP_PX && cy + h / 2 <= root.height - 4;
        if (!fits(mid.x + dir.x * reach, mid.y + dir.y * reach) && fits(mid.x - dir.x * reach, mid.y - dir.y * reach)) {
            dir = { x: -dir.x, y: -dir.y };
        }
        let centreX = mid.x + dir.x * reach;
        let centreY = mid.y + dir.y * reach;
        if (last.kind === 'circle' && last.centre) {
            const c = toScreen(last.centre);
            const r = Math.abs(last.radius * ctm.a);
            centreX = c.x + r + 16 + w / 2;
            centreY = c.y;
        }
        const x = Math.max(VIEW_LEFT_PX, Math.min(centreX - w / 2, root.width - w - 4));
        const y = Math.max(VIEW_TOP_PX, Math.min(centreY - h / 2, root.height - h - 4));
        // the radius line of an arc or circle: from the centre to the middle of the arc
        let radius = null;
        if (ms.length === 1 && (last.kind === 'arc' || last.kind === 'circle') && last.centre) {
            const c = toScreen(last.centre);
            const target = last.kind === 'circle'
                ? { x: c.x + Math.abs(last.radius * ctm.a) * Math.SQRT1_2, y: c.y - Math.abs(last.radius * ctm.a) * Math.SQRT1_2 }
                : mid;
            const t = `R ${formatMm(last.radius)}`;
            const pw = textWidth(t, 11) + 12;
            // the value sits on the radius line when it has room, the label box shows it anyway
            const roomy = Math.hypot(target.x - c.x, target.y - c.y) > pw + 12;
            const lx = (c.x + target.x) / 2;
            const ly = (c.y + target.y) / 2;
            radius = (
                <g>
                    <line x1={c.x} y1={c.y} x2={target.x} y2={target.y} stroke={PINK} strokeWidth={1.4} strokeDasharray="4 3" />
                    <circle cx={c.x} cy={c.y} r={3} fill="#ffffff" stroke={PINK} strokeWidth={1.4} />
                    {roomy && <rect x={lx - pw / 2} y={ly - 10} width={pw} height={20} rx={4} fill={PINK} />}
                    {roomy && <text x={lx} y={ly + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#ffffff">{t}</text>}
                </g>
            );
        }
        const ends = ms.filter(m => m.kind !== 'circle').reduce((all, m) => all.concat([m.from, m.to]), [] as Point[]).map(toScreen);
        partGraphics = (
            <g>
                {chosenParts.map(i => renderPart(parts[i], `part${i}`, 3))}
                {radius}
                <g stroke={PINK} strokeWidth={1.4}>
                    {ends.map(p => <circle key={`${p.x},${p.y}`} cx={p.x} cy={p.y} r={4} fill="#ffffff" />)}
                </g>
                <rect x={x} y={y} width={w} height={h} rx={8} fill="#1f2430" />
                <text x={x + w / 2} y={y + 18} textAnchor="middle" fontSize={13} fontWeight={700} fill="#ffffff">{label.title}</text>
                {label.details && <text x={x + w / 2} y={y + 33} textAnchor="middle" fontSize={10} fill="#c7cbd4">{label.details}</text>}
            </g>
        );
    }

    // measurement of the clicked object (from the element as it is now)
    let objectGraphics = null;
    const spec = picked && !partGraphics ? shapeSpec(picked.model, ctm, reload) : null;
    if (spec) {
        // visible canvas below the mode bar: dimension lines stay inside
        const inverse = ctm.inverse();
        const v1 = apply(inverse, { x: root.left + VIEW_LEFT_PX, y: root.top + VIEW_TOP_PX });
        const v2 = apply(inverse, { x: root.right - 8, y: root.bottom - 8 });
        const view = { x: Math.min(v1.x, v2.x), y: Math.min(v1.y, v2.y), width: Math.abs(v2.x - v1.x), height: Math.abs(v2.y - v1.y) };
        const m = measureObject(spec, 1 / Math.abs(ctm.a || 1), view);
        const label = formatObjectMeasure(m, geometryWord);
        const outline = spec.type === 'svg' ? picked.outlines : m.outline;
        const dims = m.dims.map((dim: Dim) => ({ dim, from: toScreen(dim.from), to: toScreen(dim.to), text: formatDim(dim) }));
        // the label goes right of everything drawn, else left, else above, inside the view
        const screenPoints = [
            ...outline.reduce((all, line) => all.concat(line.points), [] as Point[]).map(toScreen),
            ...dims.reduce((all, d) => {
                // the value label in the middle of the line
                const cx = (d.from.x + d.to.x) / 2;
                const cy = (d.from.y + d.to.y) / 2;
                const hw = textWidth(d.text, 11) / 2 + 6;
                return all.concat([d.from, d.to, { x: cx - hw, y: cy - 10 }, { x: cx + hw, y: cy + 10 }]);
            }, [] as Point[]),
        ];
        const box = outlineBounds([{ closed: false, points: screenPoints }]) || { x: 0, y: 0, width: 0, height: 0 };
        const w = Math.max(120, textWidth(label.title, 13), textWidth(label.details, 10)) + 24;
        const h = label.details ? 40 : 28;
        let x = box.x + box.width + 16;
        let y = box.y + box.height / 2 - h / 2;
        if (x + w > root.width - 4) {
            x = box.x - 16 - w;
            if (x < VIEW_LEFT_PX) {
                x = box.x + box.width / 2 - w / 2;
                y = box.y - h - 16 >= VIEW_TOP_PX ? box.y - h - 16 : box.y + box.height + 16;
            }
        }
        x = Math.max(VIEW_LEFT_PX, Math.min(x, root.width - w - 4));
        y = Math.max(VIEW_TOP_PX, Math.min(y, root.height - h - 4));
        objectGraphics = (
            <g>
                {renderOutline(outline, 'outline')}
                <g stroke={PINK} strokeWidth={1.4}>
                    {dims.map(({ dim, from, to }) => {
                        const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
                        const nx = (-(to.y - from.y) / len) * TICK;
                        const ny = ((to.x - from.x) / len) * TICK;
                        return (
                            <g key={dim.key}>
                                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
                                {dim.ticks && <line x1={from.x - nx} y1={from.y - ny} x2={from.x + nx} y2={from.y + ny} />}
                                {dim.ticks && <line x1={to.x - nx} y1={to.y - ny} x2={to.x + nx} y2={to.y + ny} />}
                                {!dim.ticks && <circle cx={to.x} cy={to.y} r={3} fill="#ffffff" />}
                            </g>
                        );
                    })}
                    {m.points.map(toScreen).map(p => <circle key={`${p.x},${p.y}`} cx={p.x} cy={p.y} r={4} fill="#ffffff" />)}
                </g>
                {dims.map(({ dim, from, to, text: t }) => {
                    const pw = textWidth(t, 11) + 12;
                    return (
                        <g key={`label-${dim.key}`}>
                            <rect x={(from.x + to.x) / 2 - pw / 2} y={(from.y + to.y) / 2 - 10} width={pw} height={20} rx={4} fill={PINK} />
                            <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#ffffff">{t}</text>
                        </g>
                    );
                })}
                <rect x={x} y={y} width={w} height={h} rx={8} fill="#1f2430" />
                <text x={x + w / 2} y={y + 18} textAnchor="middle" fontSize={13} fontWeight={700} fill="#ffffff">{label.title}</text>
                {label.details && <text x={x + w / 2} y={y + 33} textAnchor="middle" fontSize={10} fill="#c7cbd4">{label.details}</text>}
            </g>
        );
    }

    return (
        <div ref={rootRef} className={styles.overlay}>
            <svg className={styles.graphics} width={root.width} height={root.height} aria-hidden="true">
                {hover && hover.id !== picked?.id && renderOutline(hover.outlines, 'hover')}
                {partGraphics && renderOutline(picked.outlines, 'focused', 0.45)}
                {objectGraphics}
                {partGraphics}
                {hoverPart}
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
