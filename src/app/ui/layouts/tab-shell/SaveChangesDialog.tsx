import React, { useEffect, useRef } from 'react';

import i18n from '../../../lib/i18n';
import { pushModal } from '../../../lib/modal-keyboard';
import { SaveChangesAnswer, SaveChangesContext } from '../../../lib/tab-dialogs';
import styles from './tab-shell.styl';

interface SaveChangesDialogProps {
    name: string;
    context?: SaveChangesContext;
    onAnswer: (answer: SaveChangesAnswer) => void;
}

/**
 * "Save changes to {{name}}?" (design D): Save is focused, Esc = Cancel. Closing a tab discards the changes,
 * quitting keeps them as autosave and the tab comes back on the next start, so the body text differs.
 */
const SaveChangesDialog: React.FC<SaveChangesDialogProps> = ({ name, context = 'close', onAnswer }) => {
    const saveRef = useRef<HTMLButtonElement | null>(null);

    // a blocking dialog (lib/modal-keyboard): the primary button has the focus, Enter runs it, Esc = Cancel,
    // no key reaches the page behind it
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const answerRef = useRef(onAnswer);
    answerRef.current = onAnswer;
    useEffect(() => {
        saveRef.current?.focus();
        return pushModal({
            element: () => dialogRef.current,
            cancel: () => answerRef.current('cancel'),
        });
    }, []);

    return (
        <div className={styles.backdrop} role="presentation">
            <div
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="tabs-save-title"
                aria-describedby="tabs-save-text"
                className={styles.dialog}
                data-dialog="save-changes"
            >
                <b id="tabs-save-title" className={styles['dialog-title']}>
                    {i18n._('key-Tabs/Save changes to {{name}}?', { name })}
                </b>
                <span id="tabs-save-text" className={styles['dialog-text']}>
                    {context === 'quit'
                        ? i18n._('key-Tabs/This project has changes that are not saved. If you quit without saving, they are kept as autosave and the tab comes back on next start. Undo history is not kept.')
                        : i18n._('key-Tabs/This tab has changes that are not saved. If you close it without saving, they are lost. Undo history of this tab is also cleared.')}
                </span>
                <div className={styles['dialog-actions']}>
                    <button type="button" className={styles.secondary} data-answer="discard" onClick={() => onAnswer('discard')}>
                        {i18n._('key-Tabs/Don\'t save')}
                    </button>
                    <span className={styles.spacer} />
                    <button type="button" className={styles.secondary} data-answer="cancel" onClick={() => onAnswer('cancel')}>
                        {i18n._('key-Tabs/Cancel')}
                    </button>
                    <button type="button" ref={saveRef} data-modal-default className={styles.primary} data-answer="save" onClick={() => onAnswer('save')}>
                        {i18n._('key-Tabs/Save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SaveChangesDialog;
