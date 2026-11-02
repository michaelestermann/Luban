import { useEffect, useState } from 'react';

import { Origin } from '../../../constants/coordinate';
import { BoxLike, Point, referencePoint } from '../../../lib/object-origin';
import { OriginContext, originShift, resolveReferenceBox } from '../../../lib/work-origin';
import { liveElementBox } from './live-box';

interface ModelLike { modelID: string; visible?: boolean; elem?: SVGGraphicsElement }
interface EditorLike {
    toolPathGroup?: { getOriginContext?: () => OriginContext };
    modelGroup?: { getModels?: () => ModelLike[] };
    SVGActions?: { size?: { x: number; y: number }; svgContentGroup?: { group?: SVGGraphicsElement } };
}

/**
 * The origin context of the tool paths, but with the boxes of the objects as the canvas draws them now
 * (during a move, resize or rotate the model is only updated on mouse-up). Hidden objects keep their model box.
 */
export function liveOriginContext(editor: EditorLike | null | undefined): OriginContext | null {
    const base = editor?.toolPathGroup?.getOriginContext?.();
    if (!base) {
        return null;
    }
    const group = editor.SVGActions?.svgContentGroup?.group;
    const size = editor.SVGActions?.size;
    const models = typeof editor.modelGroup?.getModels === 'function' ? editor.modelGroup.getModels() : [];
    if (!group || !size) {
        return base;
    }
    return {
        ...base,
        getBox: (modelID: string): BoxLike | null => {
            const model = models.find(m => m.modelID === modelID);
            const live = model && model.visible !== false ? liveElementBox(model.elem, group, size) : null;
            return live || base.getBox(modelID);
        },
    };
}

/** The reference point of an origin (model mm) as the canvas shows it now; null: the workpiece origin applies. */
export function liveOriginPoint(editor: EditorLike | null | undefined, origin: Origin | null | undefined): Point | null {
    if (!origin) {
        return null;
    }
    const ctx = liveOriginContext(editor);
    return ctx ? referencePoint(resolveReferenceBox(origin, ctx), origin.reference) : null;
}

/** The work origin (G-code zero, offset included, model mm) as the canvas shows it now; null: the canvas zero. */
export function liveWorkOriginPoint(editor: EditorLike | null | undefined, origin: Origin | null | undefined): Point | null {
    if (!origin) {
        return null;
    }
    const ctx = liveOriginContext(editor);
    return ctx ? originShift(origin, ctx) : null;
}

/**
 * Renders again (once per frame) while the user changes objects without a store update: a drag with a mouse
 * button held (move, resize, rotate preview) and arrow-key nudges. The editor writes the model only when the
 * gesture ends (and SVG transform-list changes are not reported to a MutationObserver), so the origin
 * marker follows its objects from these input events. Returns a counter.
 */
export function useTransformTick(headType: string, active = true): number {
    const [tick, setTick] = useState(0);
    useEffect(() => {
        if (!active || !headType) {
            return undefined;
        }
        let frame = 0;
        const later = () => {
            if (!frame) {
                frame = requestAnimationFrame(() => {
                    frame = 0;
                    setTick(n => n + 1);
                });
            }
        };
        const onMove = (event: MouseEvent) => {
            if (event.buttons) {
                later();
            }
        };
        window.addEventListener('mousemove', onMove, true);
        window.addEventListener('mouseup', later, true);
        window.addEventListener('keydown', later, true);
        window.addEventListener('keyup', later, true);
        return () => {
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', later, true);
            window.removeEventListener('keydown', later, true);
            window.removeEventListener('keyup', later, true);
            if (frame) {
                cancelAnimationFrame(frame);
            }
        };
    }, [headType, active]);
    return tick;
}
