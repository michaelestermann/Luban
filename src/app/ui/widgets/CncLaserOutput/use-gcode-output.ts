import { shallowEqual, useSelector } from 'react-redux';

import { RootState } from '../../../flux/index.def';
import { SnapmakerRayMachine } from '../../../machines';

/**
 * Whether the generated G-code may be loaded to the workspace or exported: the rule of the
 * former Output Export menu (visible toolpaths, a model, no running job, not generating,
 * a G-code file). `isOnABPosition` additionally disabled the Export button.
 */
export function useGcodeOutputAvailability(headType: 'laser' | 'cnc') {
    const isOnABPosition = useSelector((state: RootState) => state.laser.isOnABPosition);
    const gcodeFile = useSelector((state: RootState) => state[headType]?.gcodeFile);
    const hasModel = useSelector((state: RootState) => state[headType]?.modelGroup.hasModel(), shallowEqual);
    const toolPathGroup = useSelector((state: RootState) => state[headType]?.toolPathGroup);
    const workflowState = useSelector((state: RootState) => state.machine?.workflowState);
    const isGcodeGenerating = useSelector((state: RootState) => state[headType]?.isGcodeGenerating);
    // toolPathGroup is mutable: re-evaluate the toolpath check on every render tick
    useSelector((state: RootState) => state[headType]?.renderingTimestamp);

    const noVisibleToolPath = toolPathGroup.toolPaths.every(toolPath => {
        return !toolPath.visible || !toolPath.hasVisibleModels();
    });
    const canUseGcode = !noVisibleToolPath && !!hasModel && workflowState !== 'running' && !isGcodeGenerating && !!gcodeFile;

    return { canUseGcode, isOnABPosition: !!isOnABPosition };
}

/** Ray renders the G-code right away when it is loaded to the workspace. */
export function useRenderImmediately(): boolean {
    const identifier = useSelector((state: RootState) => state.machine.activeMachine?.identifier);
    return identifier === SnapmakerRayMachine.identifier;
}
