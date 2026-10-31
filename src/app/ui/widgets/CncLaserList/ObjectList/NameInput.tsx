import React, { useEffect, useRef } from 'react';

import i18n from '../../../../lib/i18n';
import { MAX_OBJECT_NAME_LENGTH } from '../../../../models/object-name';
import styles from '../styles.styl';

interface NameInputProps {
    value: string;
    // the typed text; empty or unchanged keeps the old name
    onCommit: (name: string) => void;
    onCancel: () => void;
}

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

/**
 * Inline name field of the object list (rename): opens with the name selected, Enter or a click
 * elsewhere keeps the new name, Esc keeps the old one. The row can't be dragged from it.
 */
const NameInput: React.FC<NameInputProps> = ({ value, onCommit, onCancel }) => {
    const ref = useRef<HTMLInputElement>(null);
    // Enter / Esc end it once (the blur that follows does nothing)
    const done = useRef(false);

    useEffect(() => {
        ref.current?.focus();
        ref.current?.select();
    }, []);

    const finish = (commit: boolean) => {
        if (done.current) {
            return;
        }
        done.current = true;
        if (commit) {
            onCommit(ref.current?.value ?? '');
        } else {
            onCancel();
        }
    };

    return (
        <input
            ref={ref}
            type="text"
            className={styles['name-input']}
            defaultValue={value}
            maxLength={MAX_OBJECT_NAME_LENGTH}
            aria-label={i18n._('key-CncLaser/ObjectList-Name')}
            spellCheck={false}
            draggable={false}
            onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Enter') {
                    event.preventDefault();
                    finish(true);
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    finish(false);
                }
            }}
            onBlur={() => finish(true)}
            onClick={stop}
            onDoubleClick={stop}
            onMouseDown={stop}
            onDragStart={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
        />
    );
};

export default NameInput;
