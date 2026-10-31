import { useEffect } from 'react';
import { useDispatch } from 'react-redux';

import { tabsActions } from '../../../flux/project/actions-tabs';

interface ListenableHistory {
    location: { pathname: string };
    listen: (cb: (location: { pathname: string }) => void) => () => void;
}

/**
 * Legacy navigation (`history.push('/laser')`, menu entries, the 4.16 flows) keeps the strip in sync:
 * every route change activates the tab of that route.
 */
export function useTabRouteSync(history: ListenableHistory): void {
    const dispatch = useDispatch();
    useEffect(() => {
        dispatch(tabsActions.syncTabWithPath(history.location.pathname));
        return history.listen((location) => {
            dispatch(tabsActions.syncTabWithPath(location.pathname));
        });
    }, [dispatch, history]);
}

export default useTabRouteSync;
