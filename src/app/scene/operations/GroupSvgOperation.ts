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
 * step. Grouping does not change the tool paths: the children keep
 * their operations.
 */
export default class GroupSvgOperation extends Operation<State> {
    private modelGroup: ModelGroup2D;
    private targetModels: SvgModel[];
    private newGroup: SvgGroup | null = null;
    private previousSelectedGroupID: string | null = null;
    // layer order and group members before grouping (undo restores them exactly)
    private layerBefore: (SvgModel | SvgGroup)[] = [];
    private membersBefore: { group: SvgGroup, children: SvgModel[] }[] = [];

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
        this.layerBefore = mg.models.slice();
        this.membersBefore = mg.models
            .filter((entity): entity is SvgGroup => entity.type === '2d-group')
            .map((group) => ({ group, children: group.children.slice() }));
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
        // members taken from other groups go back, and every object to its old layer
        for (const { group, children } of this.membersBefore) {
            group.children.splice(0);
            children.forEach((child) => group.addChild(child));
        }
        mg.applyLayerOrder(this.layerBefore.slice());
        this.newGroup = null;
        mg.selectedGroupID = this.previousSelectedGroupID;
    }
}
