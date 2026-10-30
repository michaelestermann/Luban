import classNames from 'classnames';
import React, { useCallback, useState } from 'react';

import styles from './styles/panel-chrome.styl';

export interface RailItem {
    key: string;
    label: string;
    icon: React.ReactNode;
}

interface PanelChromeProps {
    side: 'left' | 'right';
    title: string;
    collapsed: boolean;
    onToggle: () => void;
    // left panel: icon buttons on the collapsed rail, each re-opens the panel
    railItems?: RailItem[];
    collapseLabel: string;
    expandLabel: string;
    className?: string;
    bodyClassName?: string;
    children: React.ReactNode;
}

const stroke = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    'aria-hidden': true,
} as const;

// panel icon with an arrow: left side panel collapse / expand
const LeftPanelIcon: React.FC<{ expand: boolean; size?: number }> = ({ expand, size = 16 }) => (
    <svg {...stroke} width={size} height={size}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d={expand ? 'M9 4v16M13 10l2 2-2 2' : 'M9 4v16M15 10l-2 2 2 2'} />
    </svg>
);

const RightPanelIcon: React.FC = () => (
    <svg {...stroke}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M15 4v16M9 10l2 2-2 2" />
    </svg>
);

/**
 * Side panel frame of the Laser/CNC editor: header with title and collapse button.
 *
 * Collapsed, the left panel becomes a 44px rail with icon buttons that re-open it, the right
 * panel becomes an edge tab on the canvas. The children stay mounted while collapsed (the
 * right panel holds the Output widget whose effects generate G-code and handle the export
 * menu event).
 */
const PanelChrome: React.FC<PanelChromeProps> = ({
    side, title, collapsed, onToggle, railItems = [], collapseLabel, expandLabel, className, bodyClassName, children
}) => {
    return (
        <div
            className={classNames(
                styles.panel,
                styles[side],
                { [styles.collapsed]: collapsed },
            )}
        >
            {collapsed && side === 'left' && (
                <nav className={styles.rail} aria-label={title}>
                    <button type="button" className={styles['icon-button']} aria-label={expandLabel} title={expandLabel} onClick={onToggle}>
                        <LeftPanelIcon expand size={18} />
                    </button>
                    {railItems.map(item => (
                        <button
                            key={item.key}
                            type="button"
                            className={styles['icon-button']}
                            aria-label={item.label}
                            title={item.label}
                            onClick={onToggle}
                        >
                            {item.icon}
                        </button>
                    ))}
                </nav>
            )}
            {collapsed && side === 'right' && (
                <button type="button" className={styles['edge-tab']} aria-label={expandLabel} title={expandLabel} onClick={onToggle}>
                    <svg {...stroke} width={14} height={14} strokeWidth={2}><path d="M15 6l-6 6 6 6" /></svg>
                </button>
            )}
            <section
                className={classNames(styles.expanded, className)}
                aria-label={title}
                hidden={collapsed}
            >
                <header className={styles.header}>
                    <span className={styles.label}>{title}</span>
                    <button
                        type="button"
                        className={classNames(styles['icon-button'], styles.small)}
                        aria-label={collapseLabel}
                        title={collapseLabel}
                        onClick={onToggle}
                    >
                        {side === 'left' ? <LeftPanelIcon expand={false} /> : <RightPanelIcon />}
                    </button>
                </header>
                <div className={classNames(styles.body, bodyClassName)}>
                    {children}
                </div>
            </section>
        </div>
    );
};

export default PanelChrome;

/**
 * Collapse state of one side panel, kept in component state (not persisted).
 */
export function usePanelCollapse(initial = false): [boolean, () => void] {
    const [collapsed, setCollapsed] = useState(initial);
    const toggle = useCallback(() => setCollapsed(value => !value), []);
    return [collapsed, toggle];
}
