import React from 'react';

import i18n from '../../../lib/i18n';
import styles from './undo-toast.styl';

interface UndoToastProps {
    text: string;
    onUndo: () => void;
}

/** Toast that reports what an edit changed, with an Undo button (e.g. operations lost by grouping). */
const UndoToast: React.FC<UndoToastProps> = ({ text, onUndo }) => (
    <div className={styles['undo-toast']}>
        <span>{text}</span>
        <button type="button" className={styles['undo-button']} onClick={onUndo}>
            {i18n._('key-CncLaser/Group-Undo')}
        </button>
    </div>
);

export function makeUndoToast(text: string, onUndo: () => void): React.ReactNode {
    return <UndoToast text={text} onUndo={onUndo} />;
}
