import Operation from '../../core/Operation';
import type ModelGroup2D from '../../models/ModelGroup2D';
import type SvgGroup from '../../models/SvgGroup';
import type SvgModel from '../../models/SvgModel';

type State = {
    modelGroup: ModelGroup2D;
    target: SvgGroup;
};

type GroupSnapshot = {
    groupID: string;
    name: string;
    baseName: string;
    childModelIDs: string[];
    index: number;
};

/**
 * UngroupSvgOperation mirrors `ModelGroup2D.ungroup()` and rebuilds the
 * original group on undo from a captured snapshot.
 */
export default class UngroupSvgOperation extends Operation<State> {
    private modelGroup: ModelGroup2D;
    private snapshot: GroupSnapshot;
    private previousSelectedGroupID: string | null;

    public constructor(state: State) {
        super();
        this.modelGroup = state.modelGroup;
        this.snapshot = {
            groupID: state.target.modelID,
            name: state.target.name,
            baseName: state.target.baseName,
            childModelIDs: state.target.children.map((c) => c.modelID),
            index: state.modelGroup.models.indexOf(state.target),
        };
        this.previousSelectedGroupID = state.modelGroup.selectedGroupID ?? null;
    }

    public redo() {
        const mg = this.modelGroup;
        mg.selectedGroupID = this.snapshot.groupID;
        mg.ungroup();
    }

    public undo() {
        const mg = this.modelGroup;
        // Resolve the released children (now back in models[]) and
        // re-run group() on them. The resulting SvgGroup gets a fresh
        // uuid, so we immediately rewrite it to the snapshot id and
        // name so any external reference (e.g. a tool path's
        // visibleModelIDs) keeps resolving.
        const children = this.snapshot.childModelIDs
            .map((id) => mg.getModel(id) as SvgModel | undefined)
            .filter((m): m is SvgModel => !!m);
        if (children.length < 2) return;
        mg.selectedModelArray = children;
        mg.selectedGroupID = null;
        const { newGroup } = mg.group();
        if (newGroup) {
            newGroup.modelID = this.snapshot.groupID;
            newGroup.name = this.snapshot.name;
            newGroup.baseName = this.snapshot.baseName;
            if (newGroup.elem) {
                newGroup.elem.setAttribute('id', this.snapshot.groupID);
            }
            mg.selectedGroupID = this.snapshot.groupID;
        }
    }
}
