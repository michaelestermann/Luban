import React, { useState } from 'react';

import { reorderIndex } from '../../../toolpaths/reorder';

interface DragState {
    from: number;
    over: number;
    after: boolean;
}

export type DropSide = 'before' | 'after' | null;

/**
 * Drag and drop sorting for the operation cards (step 1 operations, step 2 toolpaths).
 * `cardProps(index)` goes on each card; `dropSide(index)` tells where the drop line is
 * drawn; `onMove(from, to)` is called once on drop when the order changes.
 */
export const useCardReorder = (onMove: (from: number, to: number) => void, disabled = false) => {
    const [drag, setDrag] = useState<DragState | null>(null);

    const finishDrop = () => {
        if (drag) {
            const to = reorderIndex(drag.from, drag.over, drag.after);
            if (to !== drag.from) {
                onMove(drag.from, to);
            }
        }
        setDrag(null);
    };
    const cardProps = (index: number) => {
        if (disabled) {
            return {};
        }
        return {
            draggable: true,
            onDragStart: (e: React.DragEvent<HTMLElement>) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(index));
                setDrag({ from: index, over: index, after: false });
            },
            onDragOver: (e: React.DragEvent<HTMLElement>) => {
                if (!drag) {
                    return;
                }
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = e.currentTarget.getBoundingClientRect();
                const after = e.clientY > rect.top + rect.height / 2;
                if (drag.over !== index || drag.after !== after) {
                    setDrag({ ...drag, over: index, after });
                }
            },
            onDrop: (e: React.DragEvent<HTMLElement>) => {
                e.preventDefault();
                e.stopPropagation();
                finishDrop();
            },
            onDragEnd: () => setDrag(null)
        };
    };

    // the list itself also accepts the drag, so the cursor stays "move" between and over cards
    const containerProps = disabled ? {} : {
        onDragOver: (e: React.DragEvent<HTMLElement>) => {
            if (drag) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            }
        },
        onDrop: (e: React.DragEvent<HTMLElement>) => {
            if (drag) {
                e.preventDefault();
                finishDrop();
            }
        }
    };

    const dropSide = (index: number): DropSide => {
        if (!drag || drag.over !== index || reorderIndex(drag.from, index, drag.after) === drag.from) {
            return null;
        }
        return drag.after ? 'after' : 'before';
    };

    return { cardProps, containerProps, dropSide, draggingIndex: drag ? drag.from : -1 };
};
