import Operation from '../../core/Operation';
import UpdateToolPathMembershipOperation from './UpdateToolPathMembershipOperation';
import type { MembershipChange } from './ReplaceModelsOperation2D';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Model = any;

export interface ArrayGroup {
    group: any; // SvgGroup
    children: Model[];
}

type ArrayProp = {
    added: Model[]; // the copies
    groups: ArrayGroup[]; // new groups (all objects, or the copies of a group)
    modelGroup: any;
    svgActions: any;
    toolPathGroup: any;
    layerBefore: Model[]; // modelGroup.models (back to front) before
    layerAfter: Model[]; // and after (with the new groups)
    membership: MembershipChange[];
};

/**
 * Array: adds the copies, the new groups, their layer order and their toolpath membership as one undo
 * step. Undo takes the copies out and puts the old layer order (and groups) back.
 */
export default class ArrayOperation2D extends Operation<ArrayProp> {
    // group of each grouped model before the array (restored on undo)
    private parentsBefore = new Map<Model, any>();

    public constructor(props: ArrayProp) {
        super();
        this.state = { ...props };
        for (const { children } of props.groups) {
            for (const child of children) {
                if (!this.parentsBefore.has(child)) {
                    this.parentsBefore.set(child, child.parent ?? null);
                }
            }
        }
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
        const { toolPathGroup, membership } = this.state;
        for (const change of membership) {
            new UpdateToolPathMembershipOperation({ toolPath: change.toolPath, toolPathGroup }).apply(change[which]);
        }
    }

    public redo() {
        const { added, groups, modelGroup, svgActions, layerAfter } = this.state;
        svgActions.clearSelection();
        added.forEach(model => this.attach(model));
        for (const { group, children } of groups) {
            // removing a copy on undo takes it out of its group
            group.children = children.slice();
            children.forEach(child => {
                child.parent = group;
            });
        }
        modelGroup.applyLayerOrder(layerAfter.slice());
        modelGroup.childrenChanged?.();
        this.applyMembership('after');
    }

    public undo() {
        const { added, modelGroup, svgActions, layerBefore } = this.state;
        svgActions.clearSelection();
        added.forEach(model => this.detach(model));
        for (const [child, parent] of this.parentsBefore) {
            child.parent = parent;
        }
        modelGroup.applyLayerOrder(layerBefore.slice());
        modelGroup.childrenChanged?.();
        this.applyMembership('before');
    }
}
