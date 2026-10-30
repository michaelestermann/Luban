/**
 * Pure helpers for the step-2 (toolpaths) layout: the status shown on a toolpath card and the
 * CNC method tiles.
 */

export type ToolPathCardStatus = 'up-to-date' | 'needs-preview' | 'generating' | 'failed' | 'hidden';

interface ToolPathStatusLike {
    // ToolPath.status: idle, running, success, warning, failed (see toolpaths/utils)
    status?: string;
    visible?: boolean;
}

/**
 * Status of one toolpath card. A toolpath is up to date when its last generation succeeded
 * and nothing changed since (`needToPreview` is the page-wide "preview is stale" flag, set
 * e.g. when an object moves). Hidden toolpaths are not generated, so they show no status.
 */
export function getToolPathCardStatus(toolPath: ToolPathStatusLike | null | undefined, needToPreview: boolean): ToolPathCardStatus {
    if (toolPath && toolPath.visible === false) {
        return 'hidden';
    }
    const status = toolPath?.status;
    if (status === 'running') {
        return 'generating';
    }
    if (status === 'failed') {
        return 'failed';
    }
    if (status === 'success' && !needToPreview) {
        return 'up-to-date';
    }
    return 'needs-preview';
}

export interface CncMethodTile {
    // gcodeConfig.pathType value, the same values as the former method select
    value: 'path' | 'outline' | 'pocket' | 'drill';
    icon: 'path' | 'outline' | 'fill' | 'drill';
    labelKey: string;
}

const CNC_METHOD_TILES: CncMethodTile[] = [
    { value: 'path', icon: 'path', labelKey: 'key-Cnc/ToolpathParameters-On the Path' },
    { value: 'outline', icon: 'outline', labelKey: 'key-Cnc/ToolpathParameters-Outline' },
    { value: 'pocket', icon: 'fill', labelKey: 'key-Cnc/ToolpathParameters-Fill' },
    { value: 'drill', icon: 'drill', labelKey: 'key-Cnc/ToolpathParameters-Drill' },
];

/** CNC vector method tiles; drilling is not supported on rotary material. */
export function getCncMethodTiles(isRotate: boolean): CncMethodTile[] {
    return isRotate ? CNC_METHOD_TILES.filter(tile => tile.value !== 'drill') : CNC_METHOD_TILES.slice();
}
