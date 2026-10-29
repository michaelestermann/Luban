/**
 * Front-end rules for the CNC "Drill" method (generated in JS, see DrillToolPathGenerator).
 */

const DRILL_HIDDEN_KEYS = ['workSpeed', 'stepOver'];

/** Quick-edit setting keys: drilling only plunges, so no work speed or step over. */
export const cncFastEditKeys = (keys: string[], gcodeConfig: { pathType?: string }): string[] => {
    if (gcodeConfig?.pathType !== 'drill') {
        return keys;
    }
    return keys.filter(key => !DRILL_HIDDEN_KEYS.includes(key));
};

/** Method options: drilling is not supported on rotary material. */
export const cncPathTypeOptions = <T extends Record<string, string>>(options: T, isRotate: boolean): Partial<T> => {
    if (!isRotate) {
        return options;
    }
    const rest: Partial<T> = { ...options };
    delete rest.drill;
    return rest;
};

/** Gcode config change with the settings drilling requires. */
export const withDrillDefaults = <T extends { pathType?: string }>(option: T): T & { enableTab?: boolean } => {
    if (option.pathType !== 'drill') {
        return option;
    }
    return { ...option, enableTab: false };
};

/** Drill failure message to show the user, or null for other failures. */
export const drillFailureMessage = (taskResult: { errorMessage?: string }): string | null => {
    const message = taskResult?.errorMessage;
    return message && message.startsWith('Drill:') ? message : null;
};
