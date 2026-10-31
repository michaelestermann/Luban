import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { offsetGroups, OffsetSettings } from '../../../flux/editor/actions-combine';
import { modelOutline, offsetModels } from './model-outline';
import { Outline, Pt } from './shape-ops';
import styles from '../measure/measure-overlay.styl';

type Matrix = DOMMatrix | SVGMatrix;

interface OffsetPreviewProps {
    headType: 'laser' | 'cnc';
    isActive: boolean;
    getScreenCTM: () => Matrix | null;
    getContentGroup: () => Element | null;
}

const BLUE = '#1d4ed8';
// ms the values must rest before the preview is computed again
const PREVIEW_DELAY = 250;

/** Dashed preview of the offset outlines while the Offset values are open (canvas overlay, screen space). */
const OffsetPreview: React.FC<OffsetPreviewProps> = ({ headType, isActive, getScreenCTM, getContentGroup }) => {
    const session: OffsetSettings | null = useSelector(state => state[headType]?.offsetSession);
    const modelGroup = useSelector(state => state[headType]?.modelGroup);
    const timestamp = useSelector(state => state[headType]?.renderingTimestamp);
    const [outlines, setOutlines] = useState<Outline[]>([]);
    const [ctmKey, setCtmKey] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);
    const active = !!session && isActive;

    // outlines of the selection; read again when the selection or an object changes
    const models = active ? offsetModels(modelGroup) : [];
    const selectionKey = models.map(m => `${m.modelID}:${m.elem?.getAttribute('transform')}:${m.elem?.getAttribute('d')?.length}`).join('|');
    useEffect(() => {
        if (!active) {
            setOutlines([]);
            return undefined;
        }
        let alive = true;
        Promise.all(models.map(async (m) => modelOutline(m, getContentGroup()))).then((list) => {
            if (alive) {
                setOutlines(list.filter(Boolean));
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

    // values while typing: the offset runs on the main thread, so it waits until they rest for a moment
    const [settled, setSettled] = useState<OffsetSettings | null>(session);
    const opened = !!session;
    useEffect(() => {
        if (!session) {
            setSettled(null);
            return undefined;
        }
        const timer = setTimeout(() => setSettled(session), PREVIEW_DELAY);
        return () => clearTimeout(timer);
    }, [session]);
    // the first preview right away when the values open
    useEffect(() => setSettled(session), [opened]); // eslint-disable-line react-hooks/exhaustive-deps

    // offset only when the values or the outlines change, not on zoom
    const polygons = useMemo(
        () => (settled ? outlines.reduce((all, outline) => all.concat(...offsetGroups(outline, settled)), [] as Pt[][]) : []),
        [outlines, settled]
    );

    const ctm = active ? getScreenCTM() : null;
    const root = rootRef.current?.getBoundingClientRect();
    if (!active || !ctm || !root || !ctmKey) {
        return <div ref={rootRef} className={styles.overlay} />;
    }
    const toScreen = (p: Pt) => `${(ctm.a * p.x + ctm.c * p.y + ctm.e - root.left).toFixed(1)} ${(ctm.b * p.x + ctm.d * p.y + ctm.f - root.top).toFixed(1)}`;
    const d = polygons.map(poly => `M${poly.map(toScreen).join(' L')} Z`)
        .join(' ');

    return (
        <div ref={rootRef} className={styles.overlay}>
            <svg className={styles.graphics} width={root.width} height={root.height} aria-hidden="true" data-offset-preview="true">
                {d && <path d={d} fill="none" stroke={BLUE} strokeWidth={1.4} strokeDasharray="5 4" />}
            </svg>
        </div>
    );
};

export default OffsetPreview;
