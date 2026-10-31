import classNames from 'classnames';
import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import i18n from '../../../lib/i18n';
import { ShortcutHandlerPriority, ShortcutManager } from '../../../lib/shortcut';
import { NumberInput as Input } from '../../components/Input';
import type DrawGroup from '../svg-content/DrawGroup';
import { toLogical } from './point-edit';
import usePointEditState from './usePointEditState';
import styles from './point-card.styl';

interface PointEditOverlayProps {
    drawGroup: DrawGroup | null;
    // screen matrix of the canvas content (SVG canvas units to screen pixels)
    getScreenCTM: () => DOMMatrix | SVGMatrix | null;
    // the SVG editor is the active view (shortcuts)
    isActive: boolean;
    // leaves point editing (same as Done)
    onExit: () => void;
}

// space between the point and the card, screen pixels
const GAP = 18;
const MARGIN = 8;

const stroke = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    'aria-hidden': true,
} as const;

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Point editing on the canvas: the point card next to the selected end point (follows zoom and pan,
 * never covers the point) and the keys of the mode (Tab, Shift+Tab, Enter, Del, Esc).
 */
const PointEditOverlay: React.FC<PointEditOverlayProps> = ({ drawGroup, getScreenCTM, isActive, onExit }) => {
    const state = usePointEditState(drawGroup);
    const size = useSelector((s: { machine: { size: { x: number, y: number } } }) => s?.machine?.size);
    const rootRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<{ left: number, top: number } | null>(null);

    const activeRef = useRef(isActive);
    activeRef.current = isActive;
    const exitRef = useRef(onExit);
    exitRef.current = onExit;

    useEffect(() => {
        if (!drawGroup) {
            return undefined;
        }
        const handler = {
            title: 'PointEdit',
            priority: ShortcutHandlerPriority.Widget,
            isActive: () => activeRef.current && drawGroup.isEditingPoints(),
            shortcuts: {
                'POINT-EDIT-ESC': {
                    keys: ['esc'],
                    callback: () => {
                        // first the card, then the mode
                        if (!drawGroup.closePointCard()) {
                            exitRef.current();
                        }
                    }
                },
                'POINT-EDIT-ENTER': {
                    keys: ['enter'],
                    callback: () => {
                        // without a selected point Enter leaves the mode, as before
                        if (!drawGroup.openPointCard()) {
                            exitRef.current();
                        }
                    }
                },
                'POINT-EDIT-DELETE': {
                    keys: ['del', 'backspace'],
                    callback: () => {
                        drawGroup.deleteSelectedPoint();
                    }
                },
                'POINT-EDIT-NEXT': {
                    keys: ['tab'],
                    callback: () => drawGroup.selectStep(1)
                },
                'POINT-EDIT-PREVIOUS': {
                    keys: ['shift+tab'],
                    callback: () => drawGroup.selectStep(-1)
                },
            }
        };
        ShortcutManager.register(handler);
        return () => {
            ShortcutManager.unregister(handler);
        };
    }, [drawGroup]);

    // the card follows the point (drag, zoom, pan, resize)
    const cardOpen = state.cardOpen;
    useEffect(() => {
        if (!cardOpen || !drawGroup) {
            setPosition(null);
            return undefined;
        }
        let frame = 0;
        const update = () => {
            const point = drawGroup.getSelectedPointPosition();
            const ctm = getScreenCTM();
            const root = rootRef.current;
            if (point && ctm && root) {
                const box = root.getBoundingClientRect();
                const x = ctm.a * point.x + ctm.c * point.y + ctm.e - box.left;
                const y = ctm.b * point.x + ctm.d * point.y + ctm.f - box.top;
                const width = cardRef.current ? cardRef.current.offsetWidth : 232;
                const height = cardRef.current ? cardRef.current.offsetHeight : 190;
                // first side of the point that fits and does not cover the shape: right, left, below, above
                const shape = drawGroup.getEditingElement()?.getBoundingClientRect();
                const clampTop = (t: number) => Math.max(MARGIN, Math.min(t, box.height - height - MARGIN));
                const clampLeft = (l: number) => Math.max(MARGIN, Math.min(l, box.width - width - MARGIN));
                const candidates = [
                    { left: x + GAP, top: clampTop(y - 28) },
                    { left: x - GAP - width, top: clampTop(y - 28) },
                    { left: clampLeft(x - width / 2), top: y + GAP },
                    { left: clampLeft(x - width / 2), top: y - GAP - height },
                ];
                const fits = (c: { left: number, top: number }) => c.left >= MARGIN && c.top >= MARGIN
                    && c.left + width <= box.width - MARGIN && c.top + height <= box.height - MARGIN;
                const clear = (c: { left: number, top: number }) => !shape
                    || c.left + box.left >= shape.right || c.left + box.left + width <= shape.left
                    || c.top + box.top >= shape.bottom || c.top + box.top + height <= shape.top;
                const pick = candidates.find(c => fits(c) && clear(c)) || candidates.find(fits) || candidates[0];
                const { left, top } = pick;
                setPosition((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }));
            }
            frame = requestAnimationFrame(update);
        };
        update();
        return () => cancelAnimationFrame(frame);
    }, [cardOpen, drawGroup, getScreenCTM]);

    const selected = state.selected;
    if (!state.active || !cardOpen || !selected || !size) {
        return <div ref={rootRef} className={styles.overlay} />;
    }

    const logical = toLogical(selected, size);
    const key = `${selected.subpathIndex}-${selected.nodeIndex}`;

    const typeButton = (type: 'corner' | 'smooth', label: string, title: string, icon: React.ReactNode) => (
        <button
            type="button"
            className={classNames(styles['type-button'], { [styles.on]: selected.type === type })}
            aria-pressed={selected.type === type}
            title={title}
            onClick={() => drawGroup.setSelectedPointType(type)}
        >
            {icon}
            {label}
        </button>
    );

    return (
        <div ref={rootRef} className={styles.overlay}>
            <div
                ref={cardRef}
                className={styles.card}
                style={position ? { left: position.left, top: position.top } : { visibility: 'hidden' }}
                role="dialog"
                aria-label={i18n._('key-CncLaser/PointEdit-Point {{index}}', { index: selected.ordinal + 1 })}
            >
                <div className={styles.header}>
                    <span className={styles.title}>{i18n._('key-CncLaser/PointEdit-Point {{index}}', { index: selected.ordinal + 1 })}</span>
                    <span className={styles.hint}>{i18n._('key-CncLaser/PointEdit-Tab → next')}</span>
                    <button
                        type="button"
                        className={styles.close}
                        aria-label={i18n._('key-CncLaser/PointEdit-Close')}
                        title={i18n._('key-CncLaser/PointEdit-Close')}
                        onClick={() => drawGroup.closePointCard()}
                    >
                        <svg {...stroke} width={14} height={14}><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                </div>
                <div className={styles.grid2}>
                    <div className={styles.field}>
                        <span className={styles.prefix}>X</span>
                        <Input
                            key={`x-${key}`}
                            suffix="mm"
                            size="small"
                            value={round(logical.x)}
                            onChange={(value: number) => drawGroup.setSelectedPointPosition(value + size.x, selected.y)}
                        />
                    </div>
                    <div className={styles.field}>
                        <span className={styles.prefix}>Y</span>
                        <Input
                            key={`y-${key}`}
                            suffix="mm"
                            size="small"
                            value={round(logical.y)}
                            onChange={(value: number) => drawGroup.setSelectedPointPosition(selected.x, size.y - value)}
                        />
                    </div>
                </div>
                <div className={styles.grid2}>
                    {typeButton('corner', i18n._('key-CncLaser/PointEdit-Corner'), i18n._('key-CncLaser/PointEdit-Corner: the handles move independently'), (
                        <svg {...stroke}><path d="M5 19L12 5l7 14" /></svg>
                    ))}
                    {typeButton('smooth', i18n._('key-CncLaser/PointEdit-Smooth'), i18n._('key-CncLaser/PointEdit-Smooth: the handles stay in line'), (
                        <svg {...stroke}><path d="M4 18c3-10 13-10 16 0" /></svg>
                    ))}
                </div>
                <div className={styles.actions}>
                    <button
                        type="button"
                        className={styles['action-button']}
                        title={i18n._('key-CncLaser/PointEdit-Open the path at this point')}
                        disabled={!selected.canSplit}
                        onClick={() => drawGroup.splitSelectedPoint()}
                    >
                        <svg {...stroke}><path d="M4 12h6M14 12h6M10 7l-2 10M16 7l-2 10" /></svg>
                        {i18n._('key-CncLaser/PointEdit-Split here')}
                    </button>
                    <button
                        type="button"
                        className={classNames(styles['action-button'], styles.danger)}
                        aria-label={i18n._('key-CncLaser/PointEdit-Delete point')}
                        title={i18n._('key-CncLaser/PointEdit-Delete the selected point (Del)')}
                        disabled={!selected.canDelete}
                        onClick={() => drawGroup.deleteSelectedPoint()}
                    >
                        <svg {...stroke}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PointEditOverlay;
