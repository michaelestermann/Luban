import { IDLE, WARNING } from './utils';

interface ToolPathLike {
    name: string;
    status: string;
    object?: { parent?: unknown };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    modelMap: Map<string, any>;
}

interface ToolPathGroupLike {
    toolPaths: ToolPathLike[];
    toolPathObjects?: { add: (object: unknown) => void };
    _updated: () => void;
}

export interface MembershipSnapshot {
    toolPaths: ToolPathLike[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    members: Map<ToolPathLike, [string, any][]>;
}

/** Order of the toolpaths and the objects of each, taken before an edit that may remove objects. */
export function takeMembershipSnapshot(toolPaths: ToolPathLike[]): MembershipSnapshot {
    return {
        toolPaths: toolPaths.slice(),
        members: new Map(toolPaths.map(toolPath => [toolPath, [...toolPath.modelMap.entries()]]))
    };
}

/** Operations that were deleted (no objects left) or lost objects since the snapshot. */
export function describeMembershipLoss(snapshot: MembershipSnapshot, toolPathsAfter: ToolPathLike[]) {
    const removed = [];
    const reduced = [];
    for (const toolPath of snapshot.toolPaths) {
        if (!toolPathsAfter.includes(toolPath)) {
            removed.push(toolPath.name);
        } else if (toolPath.modelMap.size < snapshot.members.get(toolPath).length) {
            reduced.push(toolPath.name);
        }
    }
    return { removed, reduced };
}

/**
 * Put the toolpaths back as they were in the snapshot: deleted ones return at their place,
 * removed objects return to their toolpath. Changed toolpaths need a new preview.
 */
export function restoreMembershipSnapshot(toolPathGroup: ToolPathGroupLike, snapshot: MembershipSnapshot) {
    for (const toolPath of snapshot.toolPaths) {
        const entries = snapshot.members.get(toolPath);
        const current = toolPath.modelMap;
        const changed = current.size !== entries.length || entries.some(([id]) => !current.has(id));
        if (changed) {
            // Mutate in place: other code keeps references to the map
            const kept = new Map(current);
            current.clear();
            for (const [id, value] of entries) {
                current.set(id, kept.get(id) || { ...value, meshObj: null, status: IDLE, toolPathFile: null });
            }
            toolPath.status = WARNING;
        }
        if (toolPath.object && !toolPath.object.parent && toolPathGroup.toolPathObjects) {
            toolPathGroup.toolPathObjects.add(toolPath.object);
        }
    }
    toolPathGroup.toolPaths = snapshot.toolPaths.slice();
    toolPathGroup._updated();
}

/**
 * "Model leaves Tool Path" rule (grouping): take the object out of every toolpath. A toolpath
 * left without objects is deleted, the others need a new preview.
 */
export function removeModelFromAllToolPaths(
    toolPathGroup: ToolPathGroupLike & { deleteToolPath: (id: string) => void },
    modelID: string
): { deletedToolPathIDs: string[] } {
    const deleted: string[] = [];
    for (const toolPath of toolPathGroup.toolPaths.slice() as (ToolPathLike & { id: string; deleteModel: (id: string) => void })[]) {
        if (!toolPath.modelMap.has(modelID)) continue;
        toolPath.deleteModel(modelID);
        if (toolPath.modelMap.size === 0) {
            toolPathGroup.deleteToolPath(toolPath.id);
            deleted.push(toolPath.id);
        } else {
            toolPath.status = WARNING;
        }
    }
    if (deleted.length === 0) {
        // No toolpath was deleted, but membership still changed: refresh the UI
        toolPathGroup._updated();
    }
    return { deletedToolPathIDs: deleted };
}
