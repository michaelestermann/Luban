import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { PAGE_EDITOR } from '../../../constants';
import { smallObjectMarkers } from '../../../lib/small-objects';
import styles from '../measure/measure-overlay.styl';

// stroke of an outline on the screen (CSS px)
const OUTLINE_WIDTH = 1;

type Matrix = DOMMatrix | SVGMatrix;

interface SmallObjectMarkersProps {
    headType: string;
    isActive: boolean;
    getScreenCTM: () => Matrix | null;
}

interface Marker {
    key: string;
    x: number;
    y: number;
    rx: number;
    ry: number;
    color: string;
}

interface ModelLike {
    modelID?: string;
    elem?: Element | null;
    visible?: boolean;
    children?: ModelLike[];
}

const leavesOf = (models: ModelLike[]): ModelLike[] => models.reduce((all, m) => all.concat(m.children || [m]), [] as ModelLike[]);

const sameMarkers = (a: Marker[], b: Marker[]) => a.length === b.length
    && a.every((m, i) => m.key === b[i].key && m.x === b[i].x && m.y === b[i].y && m.rx === b[i].rx && m.ry === b[i].ry && m.color === b[i].color);

/**
 * A hairline outline of every object that is smaller than a few pixels at the current zoom (e.g. the
 * 0.2 mm drill holes of a PCB file): its true size, but never smaller than 2 px, so it can be seen at every
 * zoom (its own drawing is a pixel or nothing there and its stroke is cut off at the object frame).
 * Display only: it takes no mouse input and changes nothing of the objects.
 */
const SmallObjectMarkers: React.FC<SmallObjectMarkersProps> = ({ headType, isActive, getScreenCTM }) => {
    const page = useSelector(state => state[headType]?.page);
    const modelGroup = useSelector(state => state[headType]?.modelGroup);
    const SVGActions = useSelector(state => state[headType]?.SVGActions);
    const renderingTimestamp = useSelector(state => state[headType]?.renderingTimestamp);
    const active = isActive && page === PAGE_EDITOR;
    const rootRef = useRef<HTMLDivElement>(null);
    const [markers, setMarkers] = useState<Marker[]>([]);

    // Every frame only a few numbers are compared (view, render timestamp, object count and the box of the
    // selection, which follows a drag); the objects are measured again only when one of them changed.
    useEffect(() => {
        if (!active || !modelGroup) {
            setMarkers([]);
            return undefined;
        }
        let frameKey = '';
        let frame = 0;
        const update = () => {
            frame = requestAnimationFrame(update);
            const ctm = getScreenCTM();
            const root = rootRef.current?.getBoundingClientRect();
            if (!ctm || !root) {
                return;
            }
            const models: ModelLike[] = modelGroup.getModels?.() || [];
            const frameElem = SVGActions?.svgContentGroup?.operatorPoints?.allSelectedElementsBox;
            const fr = frameElem && modelGroup.getSelectedModelArray?.()?.length ? frameElem.getBoundingClientRect() : null;
            const nextKey = [ctm.a, ctm.d, ctm.e, ctm.f, root.left, root.top, root.width, root.height, renderingTimestamp, models.length,
                fr ? `${fr.left},${fr.top},${fr.width},${fr.height}` : ''].join('|');
            if (nextKey === frameKey) {
                return;
            }
            frameKey = nextKey;
            const leaves = leavesOf(models).filter(m => m.elem && m.visible !== false && m.elem.isConnected
                && m.elem.getAttribute('display') !== 'none' && m.elem.getAttribute('visibility') !== 'hidden');
            const boxes = leaves.map((m) => {
                const r = m.elem.getBoundingClientRect();
                return { x: r.left - root.left, y: r.top - root.top, width: r.width, height: r.height };
            });
            const next = smallObjectMarkers(boxes)
                .filter(({ x, y, rx, ry }) => x >= -rx && y >= -ry && x <= root.width + rx && y <= root.height + ry)
                .map(({ index, x, y, rx, ry }) => ({
                    key: leaves[index].modelID || String(index),
                    x,
                    y,
                    rx,
                    ry,
                    color: leaves[index].elem.getAttribute('stroke') || '#000000'
                }));
            setMarkers(prev => (sameMarkers(prev, next) ? prev : next));
        };
        update();
        return () => cancelAnimationFrame(frame);
    }, [active, getScreenCTM, modelGroup, SVGActions, renderingTimestamp]);

    if (!active || markers.length === 0) {
        return <div ref={rootRef} className={styles.overlay} />;
    }
    return (
        <div ref={rootRef} className={styles.overlay} data-small-object-markers>
            <svg className={styles.graphics} width="100%" height="100%" aria-hidden="true">
                {markers.map(m => (
                    // the stroke inside the size: the outer edge is the object's (at least 2 px)
                    <ellipse
                        key={m.key}
                        cx={m.x}
                        cy={m.y}
                        rx={Math.max(m.rx - OUTLINE_WIDTH / 2, OUTLINE_WIDTH / 2)}
                        ry={Math.max(m.ry - OUTLINE_WIDTH / 2, OUTLINE_WIDTH / 2)}
                        fill="none"
                        stroke={m.color}
                        strokeWidth={OUTLINE_WIDTH}
                    />
                ))}
            </svg>
        </div>
    );
};

export default SmallObjectMarkers;
