import Operation from '../../core/Operation';
import type ModelGroup2D from '../../models/ModelGroup2D';
import type SvgGroup from '../../models/SvgGroup';
import type SvgModel from '../../models/SvgModel';

type State = {
    modelGroup: ModelGroup2D;
    /** The leaf children that should end up inside the new group. */
    targetModels: SvgModel[];
};

/**
 * GroupSvgOperation wraps `ModelGroup2D.group()` with an inverse undo
 * step that fully reverses the operation, including any tool-path
 * mutations triggered by the "Model leaves Tool Path" rule
 * (Phase 7 extends this operation with tool-path bookkeeping).
 */
export default class GroupSvgOperation extends Operation<State> {
    private modelGroup: ModelGroup2D;
    private targetModels: SvgModel[];
    private newGroup: SvgGroup | null = null;
    private previousSelectedGroupID: string | null = null;

    public constructor(state: State) {
        super();
        this.modelGroup = state.modelGroup;
        this.targetModels = state.targetModels;
    }

    public redo() {
        const mg = this.modelGroup;
        this.previousSelectedGroupID = mg.selectedGroupID ?? null;
        // Restore the target selection exactly as it was when the
        // operation was initially performed.
        mg.selectedModelArray = this.targetModels.slice();
        mg.selectedGroupID = null;
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
        mg.selectedGroupID = this.previousSelectedGroupID;
    }
}
