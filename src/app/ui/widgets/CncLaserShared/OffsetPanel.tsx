import classNames from 'classnames';
import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { actions as editorActions } from '../../../flux/editor';
import { OffsetSettings } from '../../../flux/editor/actions-combine';
import i18n from '../../../lib/i18n';
import { ShortcutHandlerPriority, ShortcutManager } from '../../../lib/shortcut';
import { offsetModels } from '../../SVGEditor/combine/model-outline';
import ps from './properties.styl';

interface OffsetPanelProps {
    headType: 'laser' | 'cnc';
}

const SIDES: { value: OffsetSettings['side']; label: string }[] = [
    { value: 'outside', label: 'key-CncLaser/Offset-Outside' },
    { value: 'inside', label: 'key-CncLaser/Offset-Inside' },
    { value: 'both', label: 'key-CncLaser/Offset-Both' },
];

const CORNERS: { value: OffsetSettings['corners']; label: string }[] = [
    { value: 'round', label: 'key-CncLaser/Offset-Round' },
    { value: 'sharp', label: 'key-CncLaser/Offset-Sharp' },
    { value: 'chamfer', label: 'key-CncLaser/Offset-Chamfer' },
];

/**
 * Offset values in the properties panel while an offset is started (key O or "⋯" → Offset): distance,
 * side, corners, keep original; the canvas shows a dashed preview. Esc cancels, Enter creates.
 */
const OffsetPanel: React.FC<OffsetPanelProps> = ({ headType }) => {
    const dispatch = useDispatch();
    const session: OffsetSettings | null = useSelector(state => state[headType]?.offsetSession);
    const modelGroup = useSelector(state => state[headType]?.modelGroup);
    useSelector(state => state[headType]?.renderingTimestamp);
    const [distanceText, setDistanceText] = useState('');
    const count = session ? offsetModels(modelGroup).length : 0;
    const ref = useRef({ session, count });
    ref.current = { session, count };

    useEffect(() => {
        if (session) {
            setDistanceText(String(session.distance));
        }
        // only when the panel opens
    }, [!!session]); // eslint-disable-line react-hooks/exhaustive-deps

    // the selection changed to nothing that can be offset: close
    useEffect(() => {
        if (session && count === 0) {
            dispatch(editorActions.cancelOffset(headType));
        }
    }, [session, count, dispatch, headType]);

    useEffect(() => {
        if (!session) {
            return undefined;
        }
        const handler = {
            title: 'OffsetPanel',
            priority: ShortcutHandlerPriority.Widget,
            isActive: () => !!ref.current.session,
            shortcuts: {
                'OFFSET-CANCEL': { keys: ['esc'], callback: () => dispatch(editorActions.cancelOffset(headType)) },
                'OFFSET-CREATE': { keys: ['enter'], callback: () => dispatch(editorActions.applyOffset(headType)) },
            }
        };
        ShortcutManager.register(handler);
        return () => ShortcutManager.unregister(handler);
    }, [!!session, dispatch, headType]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!session || count === 0) {
        return null;
    }
    const update = (values: Partial<OffsetSettings>) => dispatch(editorActions.updateOffset(headType, values));
    const onDistance = (text: string) => {
        setDistanceText(text);
        const value = Number(text.replace(',', '.'));
        if (Number.isFinite(value) && value >= 0) {
            update({ distance: value });
        }
    };
    const valid = session.distance > 0;

    return (
        <div className={ps.offset} role="group" aria-label={i18n._('key-CncLaser/Offset-Offset')}>
            <div className={ps['offset-title']}>
                {i18n._('key-CncLaser/Offset-Offset')}
                <span className={ps['offset-count']}>
                    {count === 1
                        ? i18n._('key-CncLaser/Offset-1 object')
                        : i18n._('key-CncLaser/Offset-{{count}} objects', { count })}
                </span>
            </div>
            <label className={ps['offset-row']} htmlFor={`offset-distance-${headType}`}>
                <span className={ps.prefix}>{i18n._('key-CncLaser/Offset-Distance')}</span>
                <span className={classNames(ps.field, ps['offset-field'])}>
                    <input
                        id={`offset-distance-${headType}`}
                        className={ps['offset-input']}
                        type="text"
                        inputMode="decimal"
                        value={distanceText}
                        onChange={(event) => onDistance(event.target.value)}
                        onKeyDown={(event) => {
                            // the field keeps its keys; Enter creates, Esc cancels
                            event.stopPropagation();
                            if (event.key === 'Enter') {
                                dispatch(editorActions.applyOffset(headType));
                            } else if (event.key === 'Escape') {
                                dispatch(editorActions.cancelOffset(headType));
                            }
                        }}
                    />
                    <span className={ps.unit}>mm</span>
                </span>
            </label>
            {[{ items: SIDES, key: 'side' as const }, { items: CORNERS, key: 'corners' as const }].map(({ items, key }) => (
                <div key={key} className={ps.segmented} role="radiogroup">
                    {items.map(item => (
                        <button
                            key={item.value}
                            type="button"
                            role="radio"
                            aria-checked={session[key] === item.value}
                            className={classNames(ps['segmented-item'], { [ps.on]: session[key] === item.value })}
                            onClick={() => update({ [key]: item.value })}
                        >
                            {i18n._(item.label)}
                        </button>
                    ))}
                </div>
            ))}
            <label className={ps['offset-check']} htmlFor={`offset-keep-${headType}`}>
                <input
                    id={`offset-keep-${headType}`}
                    type="checkbox"
                    checked={session.keepOriginal}
                    onChange={(event) => update({ keepOriginal: event.target.checked })}
                />
                {i18n._('key-CncLaser/Offset-Keep original')}
            </label>
            <div className={ps['offset-buttons']}>
                <button type="button" className={ps['offset-cancel']} onClick={() => dispatch(editorActions.cancelOffset(headType))}>
                    {i18n._('key-CncLaser/Offset-Cancel')}
                </button>
                <button
                    type="button"
                    className={ps['offset-create']}
                    disabled={!valid}
                    title={valid ? '' : i18n._('key-CncLaser/Offset-Enter a distance greater than 0')}
                    onClick={() => dispatch(editorActions.applyOffset(headType))}
                >
                    {i18n._('key-CncLaser/Offset-Create offset')}
                </button>
            </div>
        </div>
    );
};

export default OffsetPanel;
