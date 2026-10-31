/**
 * Names of the objects and groups of the laser / CNC object list (pure, no DOM): what a rename
 * keeps, where the name is stored (groups: `name`, objects: `modelName`) and what F2 renames.
 */

export const MAX_OBJECT_NAME_LENGTH = 120;

interface NamedEntity {
    type?: string;
    name?: string;
    modelName?: string;
}

const isGroup = (entity: NamedEntity) => entity?.type === '2d-group';

/**
 * The new name of a rename: trimmed, line breaks as spaces, at most MAX_OBJECT_NAME_LENGTH
 * characters. null keeps the old name (empty, only spaces or unchanged).
 */
export function cleanObjectName(input: string | null | undefined, previous: string): string | null {
    if (typeof input !== 'string') {
        return null;
    }
    const name = input.replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX_OBJECT_NAME_LENGTH).trim();
    if (!name || name === previous) {
        return null;
    }
    return name;
}

export function getEntityName(entity: NamedEntity | null | undefined): string {
    if (!entity) {
        return '';
    }
    return (isGroup(entity) ? entity.name : entity.modelName) || '';
}

export function setEntityName(entity: NamedEntity, name: string): void {
    if (isGroup(entity)) {
        entity.name = name;
    } else {
        entity.modelName = name;
    }
}

/** What F2 renames: the selected group, else the one selected object; null for several objects or none. */
export function renameTargetID(selectedModels: { modelID: string }[] | null | undefined, selectedGroupID: string | null): string | null {
    if (selectedGroupID) {
        return selectedGroupID;
    }
    if (selectedModels && selectedModels.length === 1) {
        return selectedModels[0].modelID;
    }
    return null;
}
