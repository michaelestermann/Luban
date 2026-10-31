import { useEffect, useRef } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';

import { PAGE_EDITOR } from '../../../constants';
import { ShortcutHandlerPriority, ShortcutManager } from '../../../lib/shortcut';
import { COMBINE_ACTIONS, MORE_ACTIONS } from '../../widgets/CncLaserShared/shape-actions';

interface ShapeActionKeysProps {
    headType: 'laser' | 'cnc';
    mode: string;
    // point editing runs
    editing: boolean;
    isActive: boolean;
}

// key → action id (the keys are shown in the menus)
const KEYS: { keys: string[]; id: string }[] = [
    { keys: ['mod+w'], id: 'weld' },
    { keys: ['o'], id: 'offset' },
    { keys: ['a'], id: 'array' },
];

/** Keys of the selection actions (Ctrl+W weld, O offset, A array), active in step 1 in select mode. */
const ShapeActionKeys = ({ headType, mode, editing, isActive }: ShapeActionKeysProps) => {
    const dispatch = useDispatch();
    const store = useStore();
    const page = useSelector(state => state[headType]?.page);
    const ref = useRef({ mode, editing, isActive, page });
    ref.current = { mode, editing, isActive, page };

    useEffect(() => {
        const shortcuts = {};
        for (const { keys, id } of KEYS) {
            shortcuts[`SHAPE-ACTION-${id}`] = {
                keys,
                callback: () => {
                    const action = [...COMBINE_ACTIONS, ...MORE_ACTIONS].find(a => a.id === id);
                    if (action && ref.current.mode === 'select' && !ref.current.editing && action.fits(store.getState(), headType)) {
                        action.run(dispatch, headType);
                    }
                }
            };
        }
        const handler = {
            title: 'ShapeActions',
            priority: ShortcutHandlerPriority.Widget,
            isActive: () => ref.current.isActive && ref.current.page === PAGE_EDITOR,
            shortcuts,
        };
        ShortcutManager.register(handler);
        return () => ShortcutManager.unregister(handler);
    }, [dispatch, store, headType]);

    return null;
};

export default ShapeActionKeys;
