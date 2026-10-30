import classNames from 'classnames';
import React from 'react';

import i18n from '../../../../lib/i18n';
import { CncMethodTile, getCncMethodTiles } from '../../../../toolpaths/toolpath-step';
import styles from './cnc-method-tiles.styl';

interface CncMethodTilesProps {
    // gcodeConfig.pathType
    value: string;
    isRotate: boolean;
    disabled?: boolean;
    onChange: (value: CncMethodTile['value']) => void;
}

// Method pictures from the redesign mockup StepToolpaths (stroke follows the tile colour)
const TileImage: React.FC<{ icon: CncMethodTile['icon'] }> = ({ icon }) => (
    <svg width="44" height="32" viewBox="0 0 44 32" aria-hidden="true">
        <rect x="2" y="2" width="40" height="28" rx="4" fill="#ffffff" />
        {icon === 'path' && (
            <path d="M8 22c6-14 12-14 16-6s10 8 12-4" fill="none" stroke="currentColor" strokeWidth="2.4" />
        )}
        {icon === 'outline' && (
            <g>
                <rect x="12" y="9" width="20" height="14" rx="2" fill="#e3e6ec" />
                <rect x="9" y="6" width="26" height="20" rx="4" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
            </g>
        )}
        {icon === 'fill' && (
            <g fill="none" stroke="currentColor">
                <rect x="10" y="7" width="24" height="18" rx="2" strokeWidth="1.6" />
                <path d="M12 11h20M12 15h20M12 19h20M12 23h20" strokeWidth="1.2" />
            </g>
        )}
        {icon === 'drill' && (
            <g fill="currentColor">
                <circle cx="12" cy="11" r="2.5" />
                <circle cx="22" cy="21" r="2.5" />
                <circle cx="32" cy="11" r="2.5" />
            </g>
        )}
    </svg>
);

/**
 * CNC vector method as image tiles (Path / Outline / Fill / Drill). Writes the same
 * `pathType` values as the former method select; Drill is left out on rotary material.
 */
const CncMethodTiles: React.FC<CncMethodTilesProps> = ({ value, isRotate, disabled = false, onChange }) => {
    const tiles = getCncMethodTiles(isRotate);
    return (
        <div
            className={styles['method-tiles']}
            role="radiogroup"
            aria-label={i18n._('key-Cnc/ToolpathParameters-Method')}
            style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}
        >
            {tiles.map((tile) => {
                const selected = tile.value === value;
                return (
                    <button
                        key={tile.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={disabled}
                        className={classNames(styles.tile, { [styles.selected]: selected })}
                        onClick={() => {
                            if (!selected) {
                                onChange(tile.value);
                            }
                        }}
                    >
                        <TileImage icon={tile.icon} />
                        <span className={styles['tile-label']}>{i18n._(tile.labelKey)}</span>
                    </button>
                );
            })}
        </div>
    );
};

export default CncMethodTiles;
