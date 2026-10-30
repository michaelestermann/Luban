const IMAGE_MODES = ['greyscale', 'bw', 'halftone'];

/**
 * Whether a model may be a member of a toolpath of the given type:
 * vector toolpaths take vector models, image toolpaths take raster
 * (greyscale / bw / halftone) models, sculpt toolpaths take mesh models.
 */
export function canAddToToolPath(
    toolPath: { type: string },
    model: { mode: string; sourceType: string }
): boolean {
    switch (toolPath.type) {
        case 'vector':
            return model.mode === 'vector';
        case 'image':
            return IMAGE_MODES.includes(model.mode);
        case 'sculpt':
            return model.mode === 'mesh';
        default:
            return false;
    }
}

export function withModelAdded(ids: string[], id: string): string[] {
    return ids.includes(id) ? [...ids] : [...ids, id];
}

export function withModelRemoved(ids: string[], id: string): string[] {
    return ids.filter((item) => item !== id);
}
