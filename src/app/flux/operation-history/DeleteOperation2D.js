import Operation from '../../core/Operation';
import { indexWithout, insertAt } from '../../models/z-order';

export default class DeleteOperation2D extends Operation {
    state = {};

    constructor(state) {
        super();
        this.state = {
            target: null, // SvgModel
            svgActions: null, // SVGActionsFactory instance
            toolPathGroup: null, // keep a reference for undo & redo manipulate
            toolPaths: [], // save object related toolPaths, which may includes one or more object
            parentGroup: null, // SvgGroup the model belonged to (if any)
            place: null, // where the model was (layer order, group, operation members), see capturePlace
            ...state
        };
    }

    /**
     * Remembers where the model is, so undo puts it back there: its index in the layer order (or in
     * its group), and in the member order of its operations. A compound undo runs in the step's
     * order, so the models deleted later in the same step (putBackLater) are left out.
     */
    capturePlace(putBackLater = [], membersBefore = null) {
        const model = this.state.target;
        const modelGroup = model.modelGroup;
        const parent = modelGroup.getParentGroup(model.modelID);
        const removedTop = modelGroup.models.filter(entity => putBackLater.includes(entity)
            || (entity.children && entity.children.every(child => putBackLater.includes(child))));
        const removedIds = putBackLater.map(item => item.modelID);
        const members = [];
        for (const toolPath of this.state.toolPathGroup.toolPaths) {
            const ids = membersBefore?.get(toolPath) || [...toolPath.modelMap.keys()];
            if (ids.includes(model.modelID)) {
                members.push({ toolPath, index: indexWithout(ids, model.modelID, removedIds) });
            }
        }
        this.state.parentGroup = parent;
        this.state.place = {
            index: parent ? indexWithout(parent.children, model, putBackLater) : indexWithout(modelGroup.models, model, removedTop),
            groupIndex: parent ? indexWithout(modelGroup.models, parent, removedTop) : -1,
            members
        };
    }

    redo() {
        const model = this.state.target;
        const modelGroup = model.modelGroup;
        const svgActions = this.state.svgActions;
        const toolPathGroup = this.state.toolPathGroup;
        // the state before this step is the same on every redo: the place is captured once
        if (!this.state.place) {
            this.capturePlace();
        }

        const id = model.modelID;
        toolPathGroup.toolPaths.forEach((item) => {
            if (item.modelMap.get(id)) {
                this.state.toolPaths.push(item);
                item.modelMap.delete(id);
            }
        });
        for (const toolPath of this.state.toolPaths) {
            if (toolPath.modelMap.size === 0) {
                toolPathGroup.deleteToolPath(toolPath.id);
            }
        }
        svgActions.svgContentGroup.deleteElement(model.elem);
        // removeModel handles detaching from parent group and cleaning up empty groups
        modelGroup.removeModel(model);
        modelGroup.selectedGroupID = null;
        svgActions.clearSelection();
    }

    undo() {
        const model = this.state.target;
        const modelGroup = model.modelGroup;
        const svgActions = this.state.svgActions;
        const toolPathGroup = this.state.toolPathGroup;
        const place = this.state.place;

        const id = model.modelID;
        this.state.toolPaths.forEach((item) => {
            if (!toolPathGroup.toolPaths.includes(item)) {
                toolPathGroup.toolPaths.push(item);
                toolPathGroup.toolPathObjects.add(item.object);
            }
            if (id) {
                item.modelMap.set(id, model);
                const index = place?.members.find(member => member.toolPath === item)?.index ?? -1;
                const entries = new Map(item.modelMap);
                item.modelMap.clear();
                insertAt([...entries.keys()], id, index).forEach(key => item.modelMap.set(key, entries.get(key)));
            }
        });
        this.state.toolPaths = [];

        model.setParent(svgActions.svgContentGroup.group);
        model.setPreSelection(svgActions.svgContentGroup.preSelectionGroup);
        modelGroup.object.add(model.meshObject);
        model.meshObject.addEventListener('update', modelGroup.onModelUpdate);

        // Restore group membership if the model belonged to a group
        const parentGroup = this.state.parentGroup;
        // back to its place in the layer order (or its group)
        if (parentGroup) {
            parentGroup.addChild(model);
            const children = insertAt(parentGroup.children, model, place ? place.index : -1);
            parentGroup.children.splice(0, parentGroup.children.length, ...children);
            // Re-add the group to models[] if it was removed
            if (!modelGroup.models.includes(parentGroup)) {
                modelGroup.models = insertAt(modelGroup.models, parentGroup, place ? place.groupIndex : -1);
            }
        } else {
            modelGroup.models = insertAt(modelGroup.models, model, place ? place.index : -1);
        }
        // the SVG elements and positionZ follow the layer order
        modelGroup.applyLayerOrder([...modelGroup.models]); // a new array triggers <ModelItem> to show the model
        modelGroup.updateModelNameMap(model.modelName, model.baseName, 'add');
        modelGroup.modelChanged();
        svgActions.clearSelection();

        toolPathGroup.addSelectedToolpathColor();
        toolPathGroup._updated();
    }
}
