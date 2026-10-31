import { Tooltip } from 'antd';
import classNames from 'classnames';
import React from 'react';

import styles from './rail.styl';

interface RailButtonProps {
    title: string;
    // tool active or switch on
    on: boolean;
    disabled?: boolean;
    // small corner triangle: right-click opens options
    hasOptions?: boolean;
    // name for tests and the switch popover anchor
    name: string;
    onClick: () => void;
    onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
    buttonRef?: React.Ref<HTMLButtonElement>;
    children: React.ReactNode;
}

/**
 * A button of the left tool rail with an inline icon (tools added by the edit tools; the older
 * tools use SvgIcon with the same size and colours).
 */
const RailButton: React.FC<RailButtonProps> = ({ title, on, disabled = false, hasOptions = false, name, onClick, onContextMenu, buttonRef, children }) => (
    <div className="margin-vertical-4">
        <Tooltip title={title} placement="right" mouseEnterDelay={0.4}>
            <button
                ref={buttonRef}
                type="button"
                data-rail={name}
                className={classNames(styles['rail-button'], { [styles.on]: on })}
                aria-label={title}
                aria-pressed={on}
                disabled={disabled}
                onClick={onClick}
                onContextMenu={onContextMenu}
            >
                {children}
                {hasOptions && <span className={styles.corner} aria-hidden="true" />}
            </button>
        </Tooltip>
    </div>
);

export default RailButton;
