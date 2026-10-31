import classNames from 'classnames';
import React, { useEffect, useRef, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';

import { actions as editorActions } from '../../../flux/editor';
import { arrayBox, arrayProblemText } from '../../../flux/editor/actions-array';
import i18n from '../../../lib/i18n';
import { ShortcutHandlerPriority, ShortcutManager } from '../../../lib/shortcut';
import { arrayCopyCount, arrayProblem, ArraySettings } from '../../SVGEditor/combine/array-layout';
import { panelKeysActive } from './panel-keys';
import ps from './properties.styl';

interface ArrayPanelProps {
    headType: 'laser' | 'cnc';
}

type NumberKey = 'columns' | 'rows' | 'gapX' | 'gapY' | 'count' | 'angle' | 'centreX' | 'centreY';

interface FieldProps {
    id: string;
    label: string;
    unit?: string;
    title?: string;
    value: number;
    integer?: boolean;
    onValue: (value: number) => void;
    onEnter: () => void;
    onEscape: () => void;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

// a number field that keeps what is typed; valid numbers go to the session right away
const Field: React.FC<FieldProps> = ({ id, label, unit, title, value, integer, onValue, onEnter, onEscape }) => {
    const [text, setText] = useState(String(round3(value)));
    const last = useRef(value);
    useEffect(() => {
        // a new value from outside (another session): show it
        if (value !== last.current) {
            last.current = value;
            setText(String(round3(value)));
        }
    }, [value]);
    return (
        <label className={classNames(ps.field, ps['array-field'])} htmlFor={id} title={title}>
            <span className={ps.prefix}>{label}</span>
            <input
                id={id}
                className={ps['offset-input']}
                type="text"
                inputMode="decimal"
                value={text}
                onChange={(event) => {
                    setText(event.target.value);
                    const number = Number(event.target.value.replace(',', '.'));
                    if (event.target.value.trim() !== '' && Number.isFinite(number) && (!integer || Number.isInteger(number))) {
                        last.current = number;
                        onValue(number);
                    }
                }}
                onKeyDown={(event) => {
                    // the field keeps its keys; Enter creates, Esc cancels
                    event.stopPropagation();
                    if (event.key === 'Enter') {
                        onEnter();
                    } else if (event.key === 'Escape') {
                        onEscape();
                    }
                }}
            />
            {unit && <span className={ps.unit}>{unit}</span>}
        </label>
    );
};

/**
 * Array values in the properties panel while an array is started (key A or "⋯" → Array): grid or
 * circular, the copies are previewed on the canvas. Esc cancels, Enter creates.
 */
const ArrayPanel: React.FC<ArrayPanelProps> = ({ headType }) => {
    const dispatch = useDispatch();
    const session: ArraySettings | null = useSelector(state => state[headType]?.arraySession);
    const size = useSelector((s: { machine: { size: { x: number, y: number } } }) => s?.machine?.size);
    useSelector(state => state[headType]?.renderingTimestamp);
    const box = useSelector(state => (state[headType]?.arraySession ? arrayBox(state, headType) : null), shallowEqual);
    const canvasMode = useSelector(state => state[headType]?.SVGCanvasMode);
    const editing = useSelector(state => !!state[headType]?.SVGCanvasExt?.elem);
    const ref = useRef({ session, canvasMode, editing });
    ref.current = { session, canvasMode, editing };

    // the selection changed to nothing that can be copied: close
    useEffect(() => {
        if (session && !box) {
            dispatch(editorActions.cancelArray(headType));
        }
    }, [session, box, dispatch, headType]);

    const cancel = () => dispatch(editorActions.cancelArray(headType));
    const create = () => dispatch(editorActions.applyArray(headType));

    useEffect(() => {
        if (!session) {
            return undefined;
        }
        const handler = {
            title: 'ArrayPanel',
            priority: ShortcutHandlerPriority.Widget,
            // not while Measure or point editing has the keys
            isActive: () => panelKeysActive(!!ref.current.session, ref.current.canvasMode, ref.current.editing),
            shortcuts: {
                'ARRAY-CANCEL': { keys: ['esc'], callback: cancel },
                'ARRAY-CREATE': { keys: ['enter'], callback: create },
            }
        };
        ShortcutManager.register(handler);
        return () => ShortcutManager.unregister(handler);
    }, [!!session, dispatch, headType]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!session || !box || !size) {
        return null;
    }
    const update = (values: Partial<ArraySettings>) => dispatch(editorActions.updateArray(headType, values));
    const copies = Math.max(0, arrayCopyCount(session));
    const problem = arrayProblem(session, box);
    const field = (key: NumberKey, label: string, unit?: string, options: { integer?: boolean; title?: string } = {}) => {
        // the centre is shown like the X / Y fields: work origin, Y up
        let value = session[key];
        let toSession = (v: number) => v;
        if (key === 'centreX') {
            value = session.centreX - size.x;
            toSession = (v: number) => v + size.x;
        } else if (key === 'centreY') {
            value = size.y - session.centreY;
            toSession = (v: number) => size.y - v;
        }
        return (
            <Field
                id={`array-${key}-${headType}`}
                label={label}
                unit={unit}
                title={options.title}
                value={value}
                integer={options.integer}
                onValue={(v) => update({ [key]: toSession(v) })}
                onEnter={create}
                onEscape={cancel}
            />
        );
    };
    const check = (key: 'rotate' | 'group', label: string) => (
        <label className={ps['offset-check']} htmlFor={`array-${key}-${headType}`}>
            <input
                id={`array-${key}-${headType}`}
                type="checkbox"
                checked={session[key]}
                onChange={(event) => update({ [key]: event.target.checked })}
            />
            {label}
        </label>
    );

    return (
        <div className={ps.offset} role="group" aria-label={i18n._('key-CncLaser/Array-Array')}>
            <div className={ps['offset-title']}>
                {i18n._('key-CncLaser/Array-Array')}
                <span className={ps['offset-count']}>
                    {`${round3(box.width).toFixed(1)} × ${round3(box.height).toFixed(1)} mm`}
                </span>
            </div>
            <div className={ps.segmented} role="radiogroup">
                {(['grid', 'circular'] as const).map(mode => (
                    <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={session.mode === mode}
                        className={classNames(ps['segmented-item'], { [ps.on]: session.mode === mode })}
                        onClick={() => update({ mode })}
                    >
                        {mode === 'grid' ? i18n._('key-CncLaser/Array-Grid') : i18n._('key-CncLaser/Array-Circular')}
                    </button>
                ))}
            </div>
            {session.mode === 'grid' && (
                <div className={ps.grid2}>
                    {field('columns', i18n._('key-CncLaser/Array-Columns'), undefined, { integer: true })}
                    {field('rows', i18n._('key-CncLaser/Array-Rows'), undefined, { integer: true })}
                    {field('gapX', i18n._('key-CncLaser/Array-Gap X'), 'mm', { title: i18n._('key-CncLaser/Array-Space between the boxes; negative values overlap') })}
                    {field('gapY', i18n._('key-CncLaser/Array-Gap Y'), 'mm', { title: i18n._('key-CncLaser/Array-Space between the boxes; negative values overlap') })}
                </div>
            )}
            {session.mode === 'circular' && (
                <>
                    <div className={ps.grid2}>
                        {field('count', i18n._('key-CncLaser/Array-Count'), undefined, {
                            integer: true, title: i18n._('key-CncLaser/Array-Objects on the circle, the original included')
                        })}
                        {field('angle', i18n._('key-CncLaser/Array-Angle'), '°', {
                            title: i18n._('key-CncLaser/Array-Total angle, counter-clockwise; 360 spreads the objects evenly')
                        })}
                        {field('centreX', i18n._('key-CncLaser/Array-Centre X'), 'mm')}
                        {field('centreY', i18n._('key-CncLaser/Array-Centre Y'), 'mm')}
                    </div>
                    {check('rotate', i18n._('key-CncLaser/Array-Rotate copies'))}
                </>
            )}
            {check('group', i18n._('key-CncLaser/Array-Group the copies'))}
            {problem && <span className={ps['corners-hint']}>{arrayProblemText(problem)}</span>}
            <div className={ps['offset-buttons']}>
                <button type="button" className={ps['offset-cancel']} onClick={cancel}>
                    {i18n._('key-CncLaser/Offset-Cancel')}
                </button>
                <button type="button" className={ps['offset-create']} disabled={!!problem} onClick={create}>
                    {copies === 1
                        ? i18n._('key-CncLaser/Array-Create 1 copy')
                        : i18n._('key-CncLaser/Array-Create {{count}} copies', { count: copies })}
                </button>
            </div>
        </div>
    );
};

export default ArrayPanel;
