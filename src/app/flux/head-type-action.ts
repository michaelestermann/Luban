/**
 * The laser and CNC reducers share the action type ACTION_UPDATE_STATE / ACTION_UPDATE_CONFIG
 * (editor actions pass the headType). An action with a different headType must not change
 * this head's state; laser-only actions without a headType still apply.
 */
export const isActionForOtherHead = (action: { headType?: string }, headType: string): boolean => {
    return !!action.headType && action.headType !== headType;
};
