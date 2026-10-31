import { Tooltip } from 'antd';
import React from 'react';

import i18n from '../../../lib/i18n';
import styles from './selection-bar.styl';

interface MeasureBarProps {
    onDone: () => void;
}

/**
 * Mode bar of the measure tool: replaces the selection bar while measuring.
 */
const MeasureBar: React.FC<MeasureBarProps> = ({ onDone }) => {
    const help = i18n._('key-CncLaser/Measure-Click an object or two points · Esc to finish');
    return (
        <div className={styles['selection-bar']} role="toolbar" aria-label={i18n._('key-CncLaser/Measure-Measure')}>
            <span className={styles['mode-title']}>{i18n._('key-CncLaser/Measure-Measure')}</span>
            <span className={styles.label} style={{ maxWidth: 'none' }} title={help}>{help}</span>
            <Tooltip title={i18n._('key-CncLaser/Measure-Leave the measure tool (Esc)')}>
                <button type="button" className={styles['done-button']} onClick={onDone}>
                    {i18n._('key-CncLaser/PointEdit-Done · Esc')}
                </button>
            </Tooltip>
        </div>
    );
};

export default MeasureBar;
