/**
 * Snapping while dragging on the canvas (switch "Snap"). A session collects the candidates once when a
 * drag starts; every mouse move then only runs the pure snapping. Alt held: no snapping.
 */
import { Bounds, workpieceBox } from '../measure/dimension-chains';
import { Point, SnapPoint } from '../measure/measure-math';
import { parsePath } from '../path-edit/path-geometry';
import { getHelpers, SnapSettings } from '../rail/helper-switches';
import { Axes, buildCandidates, Guide, snapBox, SnapCandidates, snapPoint, snapRefs, SnapRef } from './snap-math';
import {
    buildOriginTargets, canvasToModel, modelToCanvas, ORIGIN_SNAP_PX, OriginTarget, OriginTargetInput, originTolerance, pickOriginTarget,
} from './origin-targets';

// snapping reach in screen pixels
export const SNAP_PX = ORIGIN_SNAP_PX;
// a drag shorter than this (screen pixels) is a click: nothing jumps
const CLICK_PX = 3;

type Matrix = DOMMatrix | SVGMatrix;

export interface SnapGuides {
    guides: Guide[];
    point: SnapPoint | null;
    // the point is a work origin target (drawn red)
    origin?: boolean;
}

// guides drawn by SnapOverlay
let shown: SnapGuides | null = null;
let shownKey = '';
const listeners = new Set<(g: SnapGuides | null) => void>();

function showGuides(g: SnapGuides | null) {
    const key = g && (g.guides.length || g.point) ? JSON.stringify(g) : '';
    if (key === shownKey) {
        return;
    }
    shownKey = key;
    shown = key ? g : null;
    listeners.forEach(listener => listener(shown));
}

export function subscribeSnapGuides(listener: (g: SnapGuides | null) => void): () => void {
    listeners.add(listener);
    listener(shown);
    return () => {
        listeners.delete(listener);
    };
}

const apply = (m: Matrix, p: Point): Point => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });

// box of an element in canvas coordinates (screen box mapped back; the view is never rotated)
function canvasBounds(elem: Element, inverse: Matrix): Bounds | null {
    const r = elem.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
        return null;
    }
    const a = apply(inverse, { x: r.left, y: r.top });
    const b = apply(inverse, { x: r.right, y: r.bottom });
    return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}

// union of the boxes of the elements in canvas coordinates
export function elementsBounds(elements: Element[], ctm: Matrix): Bounds | null {
    const inverse = ctm.inverse();
    let result: Bounds | null = null;
    for (const elem of elements) {
        const b = canvasBounds(elem, inverse);
        if (b) {
            result = result ? {
                minX: Math.min(result.minX, b.minX),
                minY: Math.min(result.minY, b.minY),
                maxX: Math.max(result.maxX, b.maxX),
                maxY: Math.max(result.maxY, b.maxY),
            } : b;
        }
    }
    return result;
}

export interface SnapContext {
    // models of the editor (groups have children)
    models: { elem?: Element; visible?: boolean; children?: unknown[] }[];
    // the moving or edited elements: not snap targets
    exclude: Element[];
    ctm: Matrix;
    // machine size: the work origin is at (size.x, size.y) on the canvas
    size: { x: number; y: number };
    coordinateSize?: { x: number; y: number };
    coordinateMode?: { setting?: { sizeMultiplyFactor?: { x: number; y: number } } };
}

export class SnapSession {
    public readonly settings: SnapSettings;

    private candidates: SnapCandidates;

    private tolerance: number;

    private constructor(settings: SnapSettings, candidates: SnapCandidates, tolerance: number) {
        this.settings = settings;
        this.candidates = candidates;
        this.tolerance = tolerance;
    }

    // null when the switch is off
    public static start(ctx: SnapContext): SnapSession | null {
        const settings = getHelpers().snap;
        if (!settings.on || !ctx.ctm) {
            return null;
        }
        const inverse = ctx.ctm.inverse();
        const boxes: Bounds[] = [];
        const ends: Point[] = [];
        const flat = ctx.models.reduce((all, m) => all.concat(m.children || [m]), []);
        for (const model of flat) {
            const elem = model.elem as SVGGraphicsElement;
            if (!elem || model.visible === false || !elem.isConnected || ctx.exclude.some(ex => ex === elem || ex.contains(elem))) {
                continue;
            }
            const box = canvasBounds(elem, inverse);
            if (!box) {
                continue;
            }
            boxes.push(box);
            if (settings.points && elem.tagName.toLowerCase() === 'path') {
                // end points of the path, from element to canvas coordinates
                const toCanvas = inverse.multiply(elem.getScreenCTM());
                try {
                    for (const sub of parsePath(elem.getAttribute('d') || '')) {
                        for (const n of sub.nodes) {
                            ends.push(apply(toCanvas, n));
                        }
                    }
                } catch (e) {
                    // unparsable path: its box points are enough
                }
            }
        }
        const factor = ctx.coordinateMode?.setting?.sizeMultiplyFactor;
        const work = ctx.size && ctx.coordinateSize && factor ? workpieceBox(ctx.size, ctx.coordinateSize, factor) : null;
        if (work) {
            boxes.push(work);
        }
        const origin = ctx.size ? { x: ctx.size.x, y: ctx.size.y } : { x: 0, y: 0 };
        const candidates = buildCandidates({ boxes, ends, origin }, settings);
        return new SnapSession(settings, candidates, SNAP_PX / Math.abs(ctx.ctm.a || 1));
    }

    // the switch or its options changed since the start
    public isCurrent(): boolean {
        return getHelpers().snap === this.settings;
    }

    // the pointer moved further than a click jitter
    public isDrag(dx: number, dy: number): boolean {
        return Math.hypot(dx, dy) >= (this.tolerance * CLICK_PX) / SNAP_PX;
    }

    // moving a box: snapped delta
    public move(box: Bounds, dx: number, dy: number, event: MouseEvent): { dx: number; dy: number } {
        if (event.altKey || !this.isDrag(dx, dy)) {
            showGuides(null);
            return { dx, dy };
        }
        const r = snapBox(box, dx, dy, this.candidates, this.tolerance);
        showGuides({ guides: r.guides, point: r.point });
        return { dx: r.dx, dy: r.dy };
    }

    // refs moved by (dx, dy) on the given axes: snapped delta
    public refs(refs: SnapRef[], span: Bounds, dx: number, dy: number, event: MouseEvent, axes: Axes): { dx: number; dy: number } {
        if (event.altKey || !this.isDrag(dx, dy)) {
            showGuides(null);
            return { dx, dy };
        }
        const r = snapRefs(refs, span, dx, dy, this.candidates, this.tolerance, axes);
        showGuides({ guides: r.guides, point: r.point });
        return { dx: r.dx, dy: r.dy };
    }

    // a single point (cursor, path point)
    public point(p: Point, event: MouseEvent): Point {
        if (event.altKey) {
            showGuides(null);
            return p;
        }
        const r = snapPoint(p, this.candidates, this.tolerance);
        showGuides({ guides: r.guides, point: r.point });
        return { x: r.x, y: r.y };
    }

    public clear() {
        showGuides(null);
    }
}

export interface OriginSnapContext {
    input: OriginTargetInput;
    ctm: Matrix;
    // machine size: the canvas zero of the coordinate mode is at (size.x, size.y)
    size: { x: number; y: number };
}

/**
 * Snapping of the work origin marker: always on (the origin can only be bound to a frame point), whatever
 * the switch "Snap" says. Its targets are tagged with what they bind to (origin-targets).
 */
export class OriginSnap {
    private targets: OriginTarget[];

    private readonly ctx: OriginSnapContext;

    private constructor(ctx: OriginSnapContext) {
        this.ctx = ctx;
        this.targets = buildOriginTargets(ctx.input);
    }

    public static start(ctx: OriginSnapContext): OriginSnap {
        return new OriginSnap(ctx);
    }

    /** New targets (Ctrl pressed / released: members of groups). */
    public rebuild(input: OriginTargetInput): void {
        this.targets = buildOriginTargets(input);
    }

    public getTargets(): OriginTarget[] {
        return this.targets;
    }

    /** The target under a screen point (client px), null when none is within reach. */
    public pick(screen: Point): OriginTarget | null {
        const inverse = this.ctx.ctm.inverse();
        const canvas = apply(inverse, screen);
        const model = canvasToModel(canvas, this.ctx.size);
        return pickOriginTarget(this.targets, model, originTolerance(this.ctx.ctm.a));
    }

    /** Model point to client px. */
    public toScreen(p: Point): Point {
        return apply(this.ctx.ctm, modelToCanvas(p, this.ctx.size));
    }

    public show(target: OriginTarget | null): void {
        if (!target) {
            showGuides(null);
            return;
        }
        const c = modelToCanvas(target.point, this.ctx.size);
        showGuides({ guides: [], point: { x: c.x, y: c.y, kind: 'corner' } as SnapPoint, origin: true });
    }

    public clear(): void {
        showGuides(null);
    }
}
