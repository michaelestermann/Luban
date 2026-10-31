import classNames from 'classnames';
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { actions as editorActions } from '../../../flux/editor';
import i18n from '../../../lib/i18n';
import { NumberInput as Input } from '../../components/Input';
import {
    CornerKey, CornerRadii, flipRadii, maxCornerRadius, radiiEqual, readCorners
} from '../../SVGEditor/path-edit/rect-corners';
import ps from './properties.styl';

interface CornersSectionProps {
    headType: 'laser' | 'cnc';
    disabled: boolean;
}

// the four fields when unlocked: ↖ ↗ / ↙ ↘ (rotation of the corner icon)
const FIELDS: { key: CornerKey; turn: number; title: string }[] = [
    { key: 'tl', turn: 0, title: 'key-CncLaser/Corners-Top left' },
    { key: 'tr', turn: 90, title: 'key-CncLaser/Corners-Top right' },
    { key: 'bl', turn: 270, title: 'key-CncLaser/Corners-Bottom left' },
    { key: 'br', turn: 180, title: 'key-CncLaser/Corners-Bottom right' },
];

// a rounded top left corner, turned to the corner it stands for
const cornerIcon = (turn: number) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M3 14V9a6 6 0 016-6h5" transform={`rotate(${turn} 8 8)`} />
    </svg>
);

const round2 = (value: number) => Math.round(value * 100) / 100;

const lockIcon = (locked: boolean) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d={locked ? 'M8 11V8a4 4 0 018 0v3' : 'M8 11V8a4 4 0 017.5-2'} />
    </svg>
);

/**
 * Corner radius of a selected rectangle (properties panel): R with a lock (all corners equal), unlocked
 * four fields. Values above half the shorter side are clamped (with a hint).
 */
const CornersSection: React.FC<CornersSectionProps> = ({ headType, disabled }) => {
    const dispatch = useDispatch();
    const modelGroup = useSelector(state => state[headType]?.modelGroup);
    useSelector(state => state[headType]?.renderingTimestamp);
    // unlocked per object (by model id); default locked unless the corners differ
    const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
    const [hint, setHint] = useState<{ id: string; max: number } | null>(null);
    // remounts the fields after a clamped value (the shown value may not change)
    const [version, setVersion] = useState(0);

    const selected = modelGroup?.getSelectedModelArray?.() || [];
    const model = selected.length === 1 ? selected[0] : null;
    const elem: Element | null = model?.elem || null;
    const info = elem ? readCorners(elem.nodeName, (name) => elem.getAttribute(name)) : null;
    if (!model || !info) {
        return null;
    }
    const flipX = model.transformation.scaleX < 0;
    const flipY = model.transformation.scaleY < 0;
    // the corners as seen on the screen
    const radii = flipRadii(info.radii, flipX, flipY);
    const max = maxCornerRadius(info.width, info.height);
    const equal = radiiEqual(radii, 1e-3);
    const isUnlocked = unlocked[model.modelID] ?? !equal;

    const apply = (next: CornerRadii, typed: number) => {
        setHint(typed > max + 1e-9 ? { id: model.modelID, max } : null);
        setVersion(v => v + 1);
        dispatch(editorActions.setRectCorners(headType, next));
    };
    const setAll = (value: number) => apply({ tl: value, tr: value, br: value, bl: value }, value);
    const setOne = (key: CornerKey, value: number) => apply({ ...radii, [key]: value }, value);
    const toggleLock = () => {
        if (isUnlocked && !equal) {
            // locking makes all corners equal (the largest one)
            setAll(Math.max(radii.tl, radii.tr, radii.br, radii.bl));
        }
        setUnlocked({ ...unlocked, [model.modelID]: !isUnlocked });
    };

    const field = (key: string, label: React.ReactNode, title: string, value: number, onChange: (v: number) => void) => (
        <div key={key} className={classNames(ps.field, { [ps.disabled]: disabled })} title={title}>
            <span className={ps.prefix}>{label}</span>
            <Input
                key={`${key}-${model.modelID}-${version}`}
                suffix="mm"
                size="small"
                disabled={disabled}
                min={0}
                value={round2(value)}
                onChange={onChange}
            />
        </div>
    );

    return (
        <div className={ps.corners} role="group" aria-label={i18n._('key-CncLaser/Corners-Corners')}>
            <span className={ps['geometry-title']}>{i18n._('key-CncLaser/Corners-Corners')}</span>
            {!isUnlocked && (
                <div className={ps.grid2}>
                    {field('r', 'R', i18n._('key-CncLaser/Corners-Corner radius'), equal ? radii.tl : Math.max(radii.tl, radii.tr, radii.br, radii.bl), setAll)}
                    <div className={ps.buttons}>
                        <button
                            type="button"
                            className={classNames(ps['icon-button'], ps.on)}
                            aria-label={i18n._('key-CncLaser/Corners-All corners equal')}
                            aria-pressed="true"
                            title={i18n._('key-CncLaser/Corners-All corners equal · click to set each corner')}
                            disabled={disabled}
                            onClick={toggleLock}
                        >
                            {lockIcon(true)}
                        </button>
                    </div>
                </div>
            )}
            {isUnlocked && (
                <div className={ps['corners-unlocked']}>
                    <div className={ps.grid2}>
                        {FIELDS.map(f => field(f.key, cornerIcon(f.turn), i18n._(f.title), radii[f.key], (v) => setOne(f.key, v)))}
                    </div>
                    <button
                        type="button"
                        className={ps['icon-button']}
                        aria-label={i18n._('key-CncLaser/Corners-All corners equal')}
                        aria-pressed="false"
                        title={i18n._('key-CncLaser/Corners-Each corner · click to make all corners equal')}
                        disabled={disabled}
                        onClick={toggleLock}
                    >
                        {lockIcon(false)}
                    </button>
                </div>
            )}
            {hint && hint.id === model.modelID && (
                <span className={ps['corners-hint']}>
                    {i18n._('key-CncLaser/Corners-At most {{max}} mm (half the shorter side)', { max: round2(hint.max) })}
                </span>
            )}
        </div>
    );
};

export default CornersSection;
