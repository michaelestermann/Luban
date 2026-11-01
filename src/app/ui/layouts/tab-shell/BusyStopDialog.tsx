import React, { useEffect, useRef } from 'react';

import i18n from '../../../lib/i18n';
import { pushModal } from '../../../lib/modal-keyboard';
import { BusyStopAnswer, BusyStopContext } from '../../../lib/tab-dialogs';
import styles from './tab-shell.styl';

interface BusyStopDialogProps {
    names: string[];
    context: BusyStopContext;
    onAnswer: (answer: BusyStopAnswer) => void;
}

/**
 * Busy guard escape hatch: a document whose calculation still runs (or hangs) can be stopped to close the
 * tab or quit. "Wait" is focused (Esc = Wait), so Enter never throws away a calculation by accident.
 */
const BusyStopDialog: React.FC<BusyStopDialogProps> = ({ names, context, onAnswer }) => {
    const waitRef = useRef<HTMLButtonElement | null>(null);
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const answerRef = useRef(onAnswer);
    answerRef.current = onAnswer;
    useEffect(() => {
        waitRef.current?.focus();
        return pushModal({
            element: () => dialogRef.current,
            cancel: () => answerRef.current('wait'),
        });
    }, []);

    const name = names.join(', ');
    return (
        <div className={`${styles.backdrop} ${styles['backdrop-over-progress']}`} role="presentation">
            <div
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="tabs-busy-title"
                aria-describedby="tabs-busy-text"
                className={styles.dialog}
                data-dialog="busy-stop"
            >
                <b id="tabs-busy-title" className={styles['dialog-title']}>
                    {names.length > 1
                        ? i18n._('key-Tabs/{{name}} are still busy.', { name })
                        : i18n._('key-Tabs/{{name}} is still busy.', { name })}
                </b>
                <span id="tabs-busy-text" className={styles['dialog-text']}>
                    {context === 'quit'
                        ? i18n._('key-Tabs/A calculation is still running. Wait until it is done, or stop it and quit. Stopped results are not kept.')
                        : i18n._('key-Tabs/A calculation is still running. Wait until it is done, or stop it and close the tab. Stopped results are not kept.')}
                </span>
                <div className={styles['dialog-actions']}>
                    <span className={styles.spacer} />
                    <button type="button" ref={waitRef} data-modal-default className={styles.secondary} data-answer="wait" onClick={() => onAnswer('wait')}>
                        {i18n._('key-Tabs/Wait')}
                    </button>
                    <button type="button" className={styles.primary} data-answer="stop" onClick={() => onAnswer('stop')}>
                        {context === 'quit' ? i18n._('key-Tabs/Stop and quit') : i18n._('key-Tabs/Stop and close')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BusyStopDialog;
