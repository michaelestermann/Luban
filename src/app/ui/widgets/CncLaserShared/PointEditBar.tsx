import { Tooltip } from 'antd';
import classNames from 'classnames';
import React from 'react';

import i18n from '../../../lib/i18n';
import type DrawGroup from '../../SVGEditor/svg-content/DrawGroup';
import usePointEditState from '../../SVGEditor/path-edit/usePointEditState';
import styles from './selection-bar.styl';

interface PointEditBarProps {
    drawGroup: DrawGroup;
    // SVGActions of the editor (model name, leaving the mode)
    SVGActions: {
        getSVGModelByElement: (elem: Element) => { modelName?: string } | null;
        svgContentGroup: { exitModelEditing: (exitCompletely: boolean) => void };
    };
}

const stroke = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    'aria-hidden': true,
} as const;

/**
 * Mode bar of the point editing mode: replaces the selection bar while the points of a path are
 * edited. Name of the object and its point count, "Add point" (insert on click), "Delete point"
 * and "Done · Esc".
 */
const PointEditBar: React.FC<PointEditBarProps> = ({ drawGroup, SVGActions }) => {
    const state = usePointEditState(drawGroup);
    if (!state.active) {
        return null;
    }
    const model = state.elem ? SVGActions?.getSVGModelByElement?.(state.elem) : null;
    const label = i18n._('key-CncLaser/PointEdit-{{name}} · {{count}} points', { name: model?.modelName || '', count: state.pointCount });
    const addTitle = i18n._('key-CncLaser/PointEdit-Click on a line to add a point. Alt + click on a line splits the path.');

    return (
        <div className={styles['selection-bar']} role="toolbar" aria-label={i18n._('key-CncLaser/PointEdit-Point editing actions')}>
            <span className={styles['mode-title']}>{i18n._('key-CncLaser/PointEdit-Editing points')}</span>
            <span className={styles.label} title={label}>{label}</span>
            <Tooltip title={addTitle}>
                <button
                    type="button"
                    className={classNames(styles['mode-button'], { [styles.on]: state.insertMode })}
                    aria-pressed={state.insertMode}
                    onClick={() => drawGroup.setInsertMode(!state.insertMode)}
                >
                    <svg {...stroke}><circle cx="12" cy="12" r="3" /><path d="M3 12h4M17 12h4M19 5v4M17 7h4" /></svg>
                    {i18n._('key-CncLaser/PointEdit-Add point')}
                </button>
            </Tooltip>
            <Tooltip title={i18n._('key-CncLaser/PointEdit-Delete the selected point (Del)')}>
                <span className={styles['tip-wrapper']}>
                    <button
                        type="button"
                        className={styles['mode-button']}
                        disabled={!state.selected?.canDelete}
                        onClick={() => drawGroup.deleteSelectedPoint()}
                    >
                        <svg {...stroke}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
                        {i18n._('key-CncLaser/PointEdit-Delete point')}
                    </button>
                </span>
            </Tooltip>
            <Tooltip title={i18n._('key-CncLaser/PointEdit-Leave point editing (Esc)')}>
                <button
                    type="button"
                    className={styles['done-button']}
                    onClick={() => SVGActions.svgContentGroup.exitModelEditing(true)}
                >
                    {i18n._('key-CncLaser/PointEdit-Done · Esc')}
                </button>
            </Tooltip>
        </div>
    );
};

export default PointEditBar;
