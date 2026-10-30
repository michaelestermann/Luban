/**
 * Selection rules for object groups in the Laser/CNC editor (one level of groups):
 * a click selects the whole group, a double-click selects the clicked member. While a
 * member is selected (`enteredGroupId`), clicks on its siblings select single members too;
 * a click anywhere else leaves the member selection.
 */
export function resolveObjectClick(
    parentGroupID: string | null,
    enteredGroupId: string | null
): { expandToGroup: boolean; enteredGroupId: string | null } {
    if (parentGroupID && parentGroupID === enteredGroupId) {
        return { expandToGroup: false, enteredGroupId };
    }
    return { expandToGroup: !!parentGroupID, enteredGroupId: null };
}

interface GroupLike {
    modelID: string;
    name: string;
    children: { modelID: string }[];
}

export type MemberChip =
    | { kind: 'model'; id: string }
    | { kind: 'group'; id: string; name: string; ids: string[] };

/**
 * Chips of an operation card: a group whose members are all in the operation is one chip
 * (at the position of its first member), everything else one chip per object.
 */
export function groupMemberChips(memberIds: string[], groups: GroupLike[]): MemberChip[] {
    const members = new Set(memberIds);
    const groupOf = new Map<string, GroupLike>();
    for (const group of groups) {
        const ids = group.children.map(child => child.modelID);
        if (ids.length > 0 && ids.every(id => members.has(id))) {
            ids.forEach(id => groupOf.set(id, group));
        }
    }
    const chips: MemberChip[] = [];
    const shown = new Set<string>();
    for (const id of memberIds) {
        const group = groupOf.get(id);
        if (!group) {
            chips.push({ kind: 'model', id });
        } else if (!shown.has(group.modelID)) {
            shown.add(group.modelID);
            chips.push({ kind: 'group', id: group.modelID, name: group.name, ids: group.children.map(child => child.modelID) });
        }
    }
    return chips;
}
