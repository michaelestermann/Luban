type AttributeElement = Pick<Element, 'removeAttribute'>;

/**
 * Prepares the clone of a model element for the model's source SVG file.
 *
 * The editor hides the original element with visibility="hidden" while it shows a stand-in,
 * e.g. during point editing. If the source file is written in that moment, the hidden flag
 * would end up in the file and the toolpath engine would skip the element (empty toolpath).
 * Only a model the user hid on purpose keeps its visibility in the source file.
 */
export function cleanSourceClone<T extends AttributeElement>(clone: T, modelVisible: boolean): T {
    if (modelVisible !== false) {
        clone.removeAttribute('visibility');
    }
    return clone;
}
