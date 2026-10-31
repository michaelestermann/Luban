import Operation from '../../core/Operation';
import UpdateToolPathMembershipOperation from './UpdateToolPathMembershipOperation';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Model = any;

export interface MembershipChange {
    toolPath: any;
    before: string[];
    after: string[];
}

type ReplaceModelsProp = {
    removed: Model[]; // models taken out (combine inputs, offset originals not kept)
    added: Model[]; // new models (combine result, offset results)
    modelGroup: any;
    svgActions: any;
    toolPathGroup: any;
    layerBefore: Model[]; // modelGroup.models (back to front) before
    layerAfter: Model[]; // and after
    membership: MembershipChange[];
    onChange?: () => void;
};

/**
 * Takes models out and puts new ones in as one undo step (combine and offset): restores the layer
 * order and the toolpath membership on undo.
 */
export default class ReplaceModelsOperation2D extends Operation<ReplaceModelsProp> {
    public constructor(props: ReplaceModelsProp) {
        super();
        this.state = { ...props };
    }

    private attach(model: Model) {
        const { modelGroup, svgActions } = this.state;
        if (modelGroup.getModels().includes(model)) {
            return;
        }
        model.setParent(svgActions.svgContentGroup.group);
        model.setPreSelection(svgActions.svgContentGroup.preSelectionGroup);
        modelGroup.object.add(model.meshObject);
        model.meshObject.addEventListener('update', modelGroup.onModelUpdate);
        modelGroup.models = [...modelGroup.models, model];
        modelGroup.updateModelNameMap(model.modelName, model.baseName, 'add');
    }

    private detach(model: Model) {
        const { modelGroup, svgActions } = this.state;
        if (!modelGroup.getModels().includes(model)) {
            return;
        }
        svgActions.svgContentGroup.deleteElement(model.elem);
        modelGroup.removeModel(model);
    }

    private applyMembership(which: 'before' | 'after') {
        const { toolPathGroup, membership, onChange } = this.state;
        for (const change of membership) {
            new UpdateToolPathMembershipOperation({ toolPath: change.toolPath, toolPathGroup, onChange }).apply(change[which]);
        }
    }

    public redo() {
        const { removed, added, modelGroup, svgActions, layerAfter } = this.state;
        svgActions.clearSelection();
        removed.forEach(model => this.detach(model));
        added.forEach(model => this.attach(model));
        modelGroup.applyLayerOrder(layerAfter.slice());
        this.applyMembership('after');
    }

    public undo() {
        const { removed, added, modelGroup, svgActions, layerBefore } = this.state;
        svgActions.clearSelection();
        added.forEach(model => this.detach(model));
        removed.forEach(model => this.attach(model));
        modelGroup.applyLayerOrder(layerBefore.slice());
        this.applyMembership('before');
    }
}
