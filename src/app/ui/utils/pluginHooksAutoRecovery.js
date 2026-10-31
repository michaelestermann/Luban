import { useState, useEffect } from 'react';
import { shallowEqual, useSelector } from 'react-redux';
import renderRecoveryModal from './renderRecoveryModal';

// this is an example of hooks plugin
export function useRecoveringProject(headType) {
    // 4.17 tabs: open tabs (restored session) replace the 4.16 recovery prompt
    const hasTabs = useSelector(state => (state?.project?.tabs?.order?.length || 0) > 0);
    const findLastEnvironment = useSelector(state => state?.project[headType].findLastEnvironment, shallowEqual) && !hasTabs;

    const [recoveringProject, setRecoveringProject] = useState(findLastEnvironment);

    useEffect(() => {
        if (findLastEnvironment) {
            setRecoveringProject(true);
        }
    }, [findLastEnvironment]);

    return [recoveringProject, setRecoveringProject];
}
export function useRenderRecoveryModal(page) {
    const [recoveringProject, setRecoveringProject] = useRecoveringProject(page);
    const returnModal = renderRecoveryModal(page, () => { setRecoveringProject(false); });
    if (recoveringProject) {
        return returnModal;
    } else {
        return null;
    }
}

export default {
    useRecoveringProject,
    useRenderRecoveryModal
};
