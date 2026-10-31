import { useEffect, useState } from 'react';

import type DrawGroup from '../svg-content/DrawGroup';
import { PointEditState } from './point-edit';

export const INACTIVE_POINT_EDIT: PointEditState = {
    active: false,
    elem: null,
    pointCount: 0,
    selected: null,
    cardOpen: false,
    insertMode: false,
};

/** Point editing state of a draw group, re-renders on every change. */
export default function usePointEditState(drawGroup: DrawGroup | null | undefined): PointEditState {
    const [state, setState] = useState<PointEditState>(() => (drawGroup ? drawGroup.getPointEditState() : INACTIVE_POINT_EDIT));
    useEffect(() => {
        if (!drawGroup) {
            setState(INACTIVE_POINT_EDIT);
            return undefined;
        }
        setState(drawGroup.getPointEditState());
        return drawGroup.subscribePointEdit(setState);
    }, [drawGroup]);
    return state;
}
