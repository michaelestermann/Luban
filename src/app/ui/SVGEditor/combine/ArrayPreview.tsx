import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { applyMatrix, arrayProblem, ArraySettings, arrayTransforms, Box } from './array-layout';
import { arraySelection, previewOutlines, selectionBox } from './array-model';
import { Pt } from './shape-ops';
import styles from '../measure/measure-overlay.styl';

type Matrix = DOMMatrix | SVGMatrix;

interface ArrayPreviewProps {
    headType: 'laser' | 'cnc';
    isActive: boolean;
    getScreenCTM: () => Matrix | null;
    getContentGroup: () => Element | null;
}

const BLUE = '#1d4ed8';
// outlines drawn at most (copies × lines), so a large array of a big file stays fast
const MAX_LINES = 4000;

/** Dashed preview of the array copies while the Array values are open (canvas overlay, screen space). */
const ArrayPreview: React.FC<ArrayPreviewProps> = ({ headType, isActive, getScreenCTM, getContentGroup }) => {
    const session: ArraySettings | null = useSelector(state => state[headType]?.arraySession);
    const modelGroup = useSelector(state => state[headType]?.modelGroup);
    const timestamp = useSelector(state => state[headType]?.renderingTimestamp);
    const [outlines, setOutlines] = useState<{ points: Pt[]; closed: boolean }[]>([]);
    const [box, setBox] = useState<Box | null>(null);
    const [ctmKey, setCtmKey] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);
    const active = !!session && isActive;

    // outlines of the selection; read again when the selection or an object changes
    const selection = active ? arraySelection(modelGroup) : null;
    const leaves = selection ? selection.leaves : [];
    const selectionKey = leaves.map(m => `${m.modelID}:${m.elem?.getAttribute('transform')}:${m.elem?.getAttribute('d')?.length}`).join('|');
    useEffect(() => {
        if (!active || leaves.length === 0) {
            setOutlines([]);
            setBox(null);
            return undefined;
        }
        let alive = true;
        setBox(selectionBox(leaves, getContentGroup()));
        previewOutlines(leaves, getContentGroup()).then((list) => {
            if (alive) {
                setOutlines(list);
            }
        });
        return () => {
            alive = false;
        };
    }, [active, selectionKey, timestamp]); // eslint-disable-line react-hooks/exhaustive-deps

    // follow zoom and pan
    useEffect(() => {
        if (!active) {
            return undefined;
        }
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
        return () => cancelAnimationFrame(frame);
    }, [active, getScreenCTM]);

    // copies in canvas coordinates, only when the values or the outlines change
    const copies = useMemo(() => {
        if (!session || !box || arrayProblem(session, box)) {
            return [] as { points: Pt[]; closed: boolean }[];
        }
        const matrices = arrayTransforms(session, box);
        const limit = Math.max(1, Math.floor(MAX_LINES / Math.max(1, outlines.length)));
        return matrices.slice(0, limit).reduce(
            (all, m) => all.concat(outlines.map(o => ({ points: o.points.map(p => applyMatrix(m, p)), closed: o.closed }))),
            [] as { points: Pt[]; closed: boolean }[]
        );
    }, [session, box, outlines]);

    const ctm = active ? getScreenCTM() : null;
    const root = rootRef.current?.getBoundingClientRect();
    if (!active || !ctm || !root || !ctmKey) {
        return <div ref={rootRef} className={styles.overlay} />;
    }
    const sx = (p: Pt) => ctm.a * p.x + ctm.c * p.y + ctm.e - root.left;
    const sy = (p: Pt) => ctm.b * p.x + ctm.d * p.y + ctm.f - root.top;
    const toScreen = (p: Pt) => `${sx(p).toFixed(1)} ${sy(p).toFixed(1)}`;
    const d = copies.filter(o => o.points.length > 1)
        .map(o => `M${o.points.map(toScreen).join(' L')}${o.closed ? ' Z' : ''}`)
        .join(' ');
    const centre = session.mode === 'circular' ? { x: sx({ x: session.centreX, y: session.centreY }), y: sy({ x: session.centreX, y: session.centreY }) } : null;

    return (
        <div ref={rootRef} className={styles.overlay}>
            <svg className={styles.graphics} width={root.width} height={root.height} aria-hidden="true" data-array-preview="true">
                {d && <path d={d} fill="none" stroke={BLUE} strokeWidth={1.4} strokeDasharray="5 4" />}
                {centre && (
                    <g stroke={BLUE} strokeWidth={1.4} data-array-centre="true">
                        <circle cx={centre.x} cy={centre.y} r={5} fill="#ffffff" />
                        <path d={`M${centre.x - 10} ${centre.y} H${centre.x + 10} M${centre.x} ${centre.y - 10} V${centre.y + 10}`} />
                    </g>
                )}
            </svg>
        </div>
    );
};

export default ArrayPreview;
