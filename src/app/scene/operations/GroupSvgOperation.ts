import Operation from '../../core/Operation';
import type ModelGroup2D from '../../models/ModelGroup2D';
import type SvgGroup from '../../models/SvgGroup';
import type SvgModel from '../../models/SvgModel';
import {
    describeMembershipLoss,
    MembershipSnapshot,
    restoreMembershipSnapshot,
    takeMembershipSnapshot
} from '../../toolpaths/membership-snapshot';

type State = {
    modelGroup: ModelGroup2D;
    /** The leaf children that should end up inside the new group. */
    targetModels: SvgModel[];
    /** Grouping removes the objects from their toolpaths; undo puts them back. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toolPathGroup?: any;
};

/**
 * GroupSvgOperation wraps `ModelGroup2D.group()` with an inverse undo
 * step that fully reverses the operation, including any tool-path
 * mutations triggered by the "Model leaves Tool Path" rule: the toolpaths
 * are snapshotted before grouping and restored on undo.
 */
export default class GroupSvgOperation extends Operation<State> {
    private modelGroup: ModelGroup2D;
    private targetModels: SvgModel[];
    private newGroup: SvgGroup | null = null;
    private previousSelectedGroupID: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private toolPathGroup: any;
    private snapshot: MembershipSnapshot | null = null;

    public constructor(state: State) {
        super();
        this.modelGroup = state.modelGroup;
        this.targetModels = state.targetModels;
        this.toolPathGroup = state.toolPathGroup ?? null;
    }

    /** Operations the last grouping deleted (no objects left) or took objects from. */
    public getMembershipLoss(): { removed: string[]; reduced: string[] } {
        if (!this.snapshot || !this.toolPathGroup) {
            return { removed: [], reduced: [] };
        }
        return describeMembershipLoss(this.snapshot, this.toolPathGroup.toolPaths);
    }

    public redo() {
        const mg = this.modelGroup;
        this.previousSelectedGroupID = mg.selectedGroupID ?? null;
        // Restore the target selection exactly as it was when the
        // operation was initially performed.
        mg.selectedModelArray = this.targetModels.slice();
        mg.selectedGroupID = null;
        this.snapshot = this.toolPathGroup ? takeMembershipSnapshot(this.toolPathGroup.toolPaths) : null;
        const { newGroup } = mg.group();
        this.newGroup = newGroup;
    }

    public undo() {
        if (!this.newGroup) return;
        const mg = this.modelGroup;
        // Select the group we created, then ungroup it. The children
        // will be placed back at the group's old index in models[].
        mg.selectedGroupID = this.newGroup.modelID;
        mg.selectedModelArray = this.newGroup.children.slice();
        mg.ungroup();
        this.newGroup = null;
        if (this.snapshot && this.toolPathGroup) {
            restoreMembershipSnapshot(this.toolPathGroup, this.snapshot);
        }
        mg.selectedGroupID = this.previousSelectedGroupID;
    }
}
