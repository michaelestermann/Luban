import { useEffect, useRef } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';

import { PAGE_EDITOR } from '../../../constants';
import { ObjectReference } from '../../../constants/coordinate';
import { originActions } from '../../../flux/editor/actions-origin';
import { ShortcutHandlerPriority, ShortcutManager } from '../../../lib/shortcut';
import { sameOrigin } from '../../../lib/work-origin';
import { buildOriginTargets, selectionTargets, targetOrigin } from '../snap/origin-targets';
import { canSetOriginOnSelection } from '../../widgets/CncLaserShared/shape-actions';
import { buildOriginTargetInput, ModelGroupLike } from './origin-input';

interface OriginKeysProps {
    headType: 'laser' | 'cnc';
    mode: string;
    // point editing runs
    editing: boolean;
    isActive: boolean;
}

/**
 * Keys of the work origin in step 1 (user ruling: Offset keeps O): 0 starts pick mode on the selection with
 * the keyboard (arrows walk the points, Enter sets, Esc cancels); with nothing selected it grabs the marker
 * over all targets (Tab: next owner). Shift+O opens the details ("Origin…").
 */
const OriginKeys = ({ headType, mode, editing, isActive }: OriginKeysProps) => {
    const dispatch = useDispatch();
    const store = useStore();
    const page = useSelector(state => state[headType]?.page);
    const ref = useRef({ mode, editing, isActive, page });
    ref.current = { mode, editing, isActive, page };

    useEffect(() => {
        const usable = () => {
            const state = store.getState()[headType];
            return ref.current.mode === 'select' && !ref.current.editing && !state?.materials?.isRotate;
        };
        const handler = {
            title: 'WorkOrigin',
            priority: ShortcutHandlerPriority.Widget,
            isActive: () => ref.current.isActive && ref.current.page === PAGE_EDITOR,
            shortcuts: {
                'ORIGIN-PICK': {
                    keys: ['0'],
                    callback: () => {
                        const state = store.getState()[headType];
                        if (!usable()) {
                            return;
                        }
                        if (state.originPick) {
                            dispatch(originActions.endOriginPick(headType));
                            return;
                        }
                        const { coordinateMode, coordinateSize, modelGroup, origin } = state;
                        const input = buildOriginTargetInput(modelGroup as ModelGroupLike, coordinateSize, coordinateMode?.setting?.sizeMultiplyFactor, false);
                        const own = selectionTargets(buildOriginTargets(input));
                        if (own.length) {
                            // the active point: the current origin when it is on the selection, else the centre
                            const current = own.find(target => sameOrigin(targetOrigin(target, coordinateMode.value), origin));
                            dispatch(originActions.startOriginPick(headType, 'key', { reference: current ? current.reference : ObjectReference.Center, scope: 'selection' }));
                        } else {
                            const all = buildOriginTargets(input);
                            const current = all.find(target => sameOrigin(targetOrigin(target, coordinateMode.value), origin));
                            dispatch(originActions.startOriginPick(headType, 'key', { reference: current ? current.reference : ObjectReference.Center, scope: 'all' }));
                        }
                    },
                },
                'ORIGIN-DETAILS': {
                    keys: ['shift+o'],
                    callback: () => {
                        // phase 1: the details are the point picker of the selection bar (needs a selection)
                        if (usable() && canSetOriginOnSelection(store.getState(), headType)) {
                            dispatch(originActions.openOriginDialog(headType, 'key'));
                        }
                    },
                },
            },
        };
        ShortcutManager.register(handler);
        return () => ShortcutManager.unregister(handler);
    }, [dispatch, store, headType]);

    return null;
};

export default OriginKeys;
