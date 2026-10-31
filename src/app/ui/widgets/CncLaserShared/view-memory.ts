/**
 * 4.17 tabs: the edit page of a document is mounted again on every tab switch. The canvas is fitted to the
 * workpiece only the first time a document is shown; later mounts keep its zoom and pan (slice scale / target).
 */
const shownDocuments = new WeakSet<object>();

/** True the first time it is called for this model group (= document). */
export function isFirstView(modelGroup: object | null | undefined): boolean {
    if (!modelGroup) {
        return true;
    }
    if (shownDocuments.has(modelGroup)) {
        return false;
    }
    shownDocuments.add(modelGroup);
    return true;
}
