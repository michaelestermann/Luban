import React from 'react';

import i18n from '../../../lib/i18n';

/** Six-dot handle shown on sortable operation cards. */
const DragGrip: React.FC<{ className?: string }> = ({ className }) => (
    <span className={className} title={i18n._('key-CncLaser/Operations-Drag to change the order')} aria-hidden="true">
        <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="2.5" cy="3" r="1.4" />
            <circle cx="7.5" cy="3" r="1.4" />
            <circle cx="2.5" cy="8" r="1.4" />
            <circle cx="7.5" cy="8" r="1.4" />
            <circle cx="2.5" cy="13" r="1.4" />
            <circle cx="7.5" cy="13" r="1.4" />
        </svg>
    </span>
);

export default DragGrip;
