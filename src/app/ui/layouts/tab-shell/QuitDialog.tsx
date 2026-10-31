import React, { useEffect, useRef, useState } from 'react';

import { EDITOR_HEAD_TYPES, EditorHeadType, isEditorHeadType } from '../../../flux/project/tabs-model';
import i18n from '../../../lib/i18n';
import { QuitAnswer, QuitDocument } from '../../../lib/tab-dialogs';
import { HeadIcon } from './TabStrip';
import styles from './tab-shell.styl';

const MODE_LABELS: Record<EditorHeadType, string> = {
    printing: 'key-Tabs/3D Printing',
    laser: 'key-Tabs/Laser',
    cnc: 'key-Tabs/CNC',
};

function folderOf(path: string | null | undefined): string {
    if (!path) {
        return i18n._('key-Tabs/never saved');
    }
    const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return slash > 0 ? path.slice(0, slash) : path;
}

interface QuitDialogProps {
    docs: QuitDocument[];
    onAnswer: (answer: QuitAnswer) => void;
}

/**
 * Quit with several unsaved projects (design D, board 9): one list grouped by mode, all checked.
 * "Save selected and quit" / "Don’t save any" / "Cancel"; Esc = Cancel. Tabs come back on the next start either way.
 */
const QuitDialog: React.FC<QuitDialogProps> = ({ docs, onAnswer }) => {
    const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(docs.map((d) => [d.id, true])));
    const primaryRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        primaryRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onAnswer({ action: 'cancel', ids: [] });
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onAnswer]);

    const groups = EDITOR_HEAD_TYPES
        .map((head) => ({ head, items: docs.filter((d) => d.headType === head) }))
        .filter((g) => g.items.length > 0);
    const others = docs.filter((d) => !isEditorHeadType(d.headType));

    const renderItem = (d: QuitDocument) => (
        <label key={d.id} className={styles['quit-item']} data-quit-doc={d.id}>
            <input
                type="checkbox"
                checked={!!checked[d.id]}
                onChange={(e) => setChecked({ ...checked, [d.id]: e.target.checked })}
            />
            {isEditorHeadType(d.headType) && <HeadIcon headType={d.headType} />}
            <span className={styles['row-name']}>{d.name}</span>
            <span className={styles['row-path']}>{folderOf(d.path)}</span>
        </label>
    );

    return (
        <div className={styles.backdrop} role="presentation">
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="tabs-quit-title"
                aria-describedby="tabs-quit-text"
                className={`${styles.dialog} ${styles['quit-dialog']}`}
                data-dialog="quit-selection"
            >
                <b id="tabs-quit-title" className={styles['dialog-title']}>
                    {i18n._('key-Tabs/{{count}} projects have unsaved changes', { count: docs.length })}
                </b>
                <span id="tabs-quit-text" className={styles['dialog-text']}>
                    {i18n._('key-Tabs/Pick what to save. Untitled projects ask for a name. All open tabs come back on next start.')}
                </span>
                <div className={styles['quit-list']}>
                    {groups.map((g) => (
                        <React.Fragment key={g.head}>
                            <div className={styles.label}>{i18n._(MODE_LABELS[g.head])}</div>
                            {g.items.map(renderItem)}
                        </React.Fragment>
                    ))}
                    {others.map(renderItem)}
                </div>
                <div className={styles['dialog-actions']}>
                    <button type="button" className={styles.secondary} data-answer="discard" onClick={() => onAnswer({ action: 'discard', ids: [] })}>
                        {i18n._('key-Tabs/Don’t save any')}
                    </button>
                    <span className={styles.spacer} />
                    <button type="button" className={styles.secondary} data-answer="cancel" onClick={() => onAnswer({ action: 'cancel', ids: [] })}>
                        {i18n._('key-Tabs/Cancel')}
                    </button>
                    <button
                        type="button"
                        ref={primaryRef}
                        className={styles.primary}
                        data-answer="save"
                        onClick={() => onAnswer({ action: 'save', ids: docs.filter((d) => checked[d.id]).map((d) => d.id) })}
                    >
                        {i18n._('key-Tabs/Save selected and quit')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuitDialog;
