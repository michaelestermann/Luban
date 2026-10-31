import { Popover } from 'antd';
import classNames from 'classnames';
import React, { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { PAGE_EDITOR } from '../../../constants';
import i18n from '../../../lib/i18n';
import { ShortcutHandlerPriority, ShortcutManager } from '../../../lib/shortcut';
import { HelperName, HelperSwitches, toggleHelper, updateHelper, useHelpers } from './helper-switches';
import RailButton from './RailButton';
import styles from './rail.styl';

interface SwitchEntry {
    name: HelperName;
    // key that toggles the switch
    key: string;
    title: () => string;
    icon: React.ReactNode;
    options: (helpers: HelperSwitches) => React.ReactNode;
}

const DimensionsOptions: React.FC<{ helpers: HelperSwitches }> = ({ helpers }) => {
    const d = helpers.dimensions;
    const scopeButton = (scope: 'selection' | 'all', label: string) => (
        <button
            type="button"
            className={classNames(styles.segment, { [styles.on]: d.scope === scope })}
            aria-pressed={d.scope === scope}
            onClick={() => updateHelper('dimensions', { scope })}
        >
            {label}
        </button>
    );
    return (
        <>
            <div className={styles.segments}>
                {scopeButton('selection', i18n._('key-CncLaser/Dimensions-Selection'))}
                {scopeButton('all', i18n._('key-CncLaser/Dimensions-All objects'))}
            </div>
            {d.scope === 'all' && (
                <div className={styles.note}>{i18n._('key-CncLaser/Dimensions-Above 150 objects only the selection.')}</div>
            )}
            <label className={styles.check}>
                <input type="checkbox" checked={d.edges} onChange={e => updateHelper('dimensions', { edges: e.target.checked })} />
                {i18n._('key-CncLaser/Dimensions-To the workpiece edges')}
            </label>
            <label className={styles.check}>
                <input type="checkbox" checked={d.between} onChange={e => updateHelper('dimensions', { between: e.target.checked })} />
                {i18n._('key-CncLaser/Dimensions-Between objects')}
            </label>
            <div className={styles.note}>{i18n._('key-CncLaser/Dimensions-Click a value to type a new distance. Not in the G-code.')}</div>
        </>
    );
};

const SnapOptions: React.FC<{ helpers: HelperSwitches }> = ({ helpers }) => {
    const snap = helpers.snap;
    const [size, setSize] = useState(String(snap.gridSize));
    useEffect(() => setSize(String(snap.gridSize)), [snap.gridSize]);
    const commitSize = () => {
        const value = Number(size);
        if (Number.isFinite(value) && value > 0) {
            updateHelper('snap', { gridSize: value });
        } else {
            setSize(String(snap.gridSize));
        }
    };
    const check = (key: 'grid' | 'points' | 'centers' | 'edges' | 'align', label: string) => (
        <label className={styles.check}>
            <input type="checkbox" checked={snap[key]} onChange={e => updateHelper('snap', { [key]: e.target.checked })} />
            {label}
        </label>
    );
    return (
        <>
            <div className={styles['check-row']}>
                {check('grid', i18n._('key-CncLaser/Snap-Grid'))}
                <span className={styles['grid-size']}>
                    <input
                        type="number"
                        min={0.1}
                        step={0.5}
                        value={size}
                        disabled={!snap.grid}
                        aria-label={i18n._('key-CncLaser/Snap-Grid size')}
                        title={i18n._('key-CncLaser/Snap-Grid size')}
                        onChange={e => setSize(e.target.value)}
                        onBlur={commitSize}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                commitSize();
                            }
                        }}
                    />
                    mm
                </span>
            </div>
            {check('points', i18n._('key-CncLaser/Snap-End and mid points'))}
            {check('centers', i18n._('key-CncLaser/Snap-Centres'))}
            {check('edges', i18n._('key-CncLaser/Snap-Edges'))}
            {check('align', i18n._('key-CncLaser/Snap-Align to other objects'))}
            <div className={styles.note}>{i18n._('key-CncLaser/Snap-Hold Alt to move freely')}</div>
        </>
    );
};

// one entry per switch
const SWITCHES: SwitchEntry[] = [
    {
        name: 'dimensions',
        key: 'd',
        title: () => i18n._('key-CncLaser/Dimensions-Dimensions (D) · right-click: options'),
        icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M4 8v8M20 8v8M4 12h16" />
                <path d="M7 9l-3 3 3 3M17 9l3 3-3 3" />
            </svg>
        ),
        options: helpers => <DimensionsOptions helpers={helpers} />,
    },
    {
        name: 'snap',
        key: 's',
        title: () => i18n._('key-CncLaser/Snap-Snap (S) · right-click: options'),
        icon: (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M6 4v8a6 6 0 0 0 12 0V4" />
                <path d="M10 4v8a2 2 0 0 0 4 0V4" />
                <path d="M6 7h4M14 7h4" />
            </svg>
        ),
        options: helpers => <SnapOptions helpers={helpers} />,
    },
];

const optionTitles: Record<HelperName, () => string> = {
    dimensions: () => i18n._('key-CncLaser/Dimensions-Dimensions · options'),
    snap: () => i18n._('key-CncLaser/Snap-Snap · options'),
};

interface RailSwitchesProps {
    headType: string;
    isActive: boolean;
    editable: boolean;
}

/**
 * Helper switches of the tool rail: click = on / off, right-click = options next to the button.
 */
const RailSwitches: React.FC<RailSwitchesProps> = ({ headType, isActive, editable }) => {
    const helpers = useHelpers();
    const page = useSelector(state => state[headType]?.page);
    const [open, setOpen] = useState<HelperName | null>(null);
    const activeRef = useRef(false);
    activeRef.current = isActive && page === PAGE_EDITOR && editable;

    // keys toggle the switches (not in text fields: the shortcut manager skips inputs)
    useEffect(() => {
        const shortcuts = {};
        for (const entry of SWITCHES) {
            shortcuts[`HELPER-${entry.name.toUpperCase()}`] = { keys: [entry.key], callback: () => toggleHelper(entry.name) };
        }
        const handler = {
            title: 'RailSwitches',
            priority: ShortcutHandlerPriority.View,
            isActive: () => activeRef.current,
            shortcuts,
        };
        ShortcutManager.register(handler);
        return () => ShortcutManager.unregister(handler);
    }, []);

    // Esc closes the options
    useEffect(() => {
        if (!open) {
            return undefined;
        }
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                setOpen(null);
            }
        };
        // a click outside the options and the switch closes them
        const onMouseDown = (event: MouseEvent) => {
            const target = event.target as Element;
            if (!target?.closest?.(`.${styles.options}, [data-rail="${open}"]`)) {
                setOpen(null);
            }
        };
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('mousedown', onMouseDown, true);
        return () => {
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('mousedown', onMouseDown, true);
        };
    }, [open]);

    return (
        <>
            {SWITCHES.map(entry => (
                <Popover
                    key={entry.name}
                    open={open === entry.name}
                    trigger={[]}
                    placement="rightTop"
                    content={(
                        <div className={styles.options} role="dialog" aria-label={optionTitles[entry.name]()}>
                            <span className={styles['options-title']}>{optionTitles[entry.name]()}</span>
                            {entry.options(helpers)}
                        </div>
                    )}
                >
                    <div>
                        <RailButton
                            name={entry.name}
                            title={entry.title()}
                            on={helpers[entry.name].on}
                            disabled={!editable}
                            hasOptions
                            hideTooltip={open === entry.name}
                            onClick={() => toggleHelper(entry.name)}
                            onContextMenu={(event) => {
                                event.preventDefault();
                                setOpen(entry.name);
                            }}
                        >
                            {entry.icon}
                        </RailButton>
                    </div>
                </Popover>
            ))}
        </>
    );
};

export default RailSwitches;
