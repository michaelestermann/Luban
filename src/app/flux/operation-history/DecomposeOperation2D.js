import Operation from '../../core/Operation';
import { IDLE } from '../../toolpaths/utils';

/**
 * One decompose step as a single undoable operation: adds all parts and
 * removes the original.
 *
 * Order matters for tool paths: parts are added (and put into every tool
 * path of the original) before the original is removed, and the original is
 * restored before the parts are removed, so a tool path never runs empty and
 * never gets deleted on the way.
 */
export default class DecomposeOperation2D extends Operation {
    state = {};

    constructor(state) {
        super();
        this.state = {
            original: null, // SvgModel that was decomposed
            parts: [], // SvgModel[] in document order
            addOperations: [], // AddOperation2D per part
            deleteOperation: null, // DeleteOperation2D of the original
            modelGroup: null,
            toolPathGroup: null,
            toolPaths: [], // tool paths the original belonged to
            parentGroup: null, // SvgGroup the original belonged to (if any)
            index: 0, // original's index in its container (models[] or group children)
            ...state
        };
    }

    /**
     * Put freshly added parts where the original is: into its tool paths,
     * its 2D group and its place in the object list.
     */
    placeParts() {
        const { original, parts, modelGroup, toolPathGroup, toolPaths, parentGroup } = this.state;

        for (const part of parts) {
            for (const toolPath of toolPaths) {
                if (!toolPath.modelMap.has(part.modelID)) {
                    toolPath.modelMap.set(part.modelID, { meshObj: null, status: IDLE, toolPathFile: null });
                }
            }
        }

        let container;
        if (parentGroup) {
            modelGroup.models = modelGroup.models.filter((item) => !parts.includes(item));
            for (const part of parts) {
                parentGroup.addChild(part);
            }
            container = parentGroup.children;
        } else {
            container = modelGroup.models;
        }
        const others = container.filter((item) => !parts.includes(item));
        const index = others.indexOf(original);
        others.splice(index === -1 ? others.length : index, 0, ...parts);
        container.splice(0, container.length, ...others);

        modelGroup.models = [...modelGroup.models];
        modelGroup.modelChanged();
        toolPathGroup.checkoutToolPathStatus();
        toolPathGroup._updated();
    }

    redo() {
        const { addOperations, deleteOperation } = this.state;
        for (const operation of addOperations) {
            operation.redo();
        }
        this.placeParts();
        deleteOperation.redo();
        this.state.toolPathGroup.checkoutToolPathStatus();
    }

    undo() {
        const { addOperations, deleteOperation, original, modelGroup, parentGroup, index, toolPathGroup } = this.state;
        deleteOperation.undo();
        for (let i = addOperations.length - 1; i >= 0; i--) {
            addOperations[i].undo();
        }

        // Put the original back at its old place in the object list
        const container = parentGroup ? parentGroup.children : modelGroup.models;
        const current = container.indexOf(original);
        if (current !== -1 && current !== index) {
            container.splice(current, 1);
            container.splice(Math.min(index, container.length), 0, original);
        }
        modelGroup.models = [...modelGroup.models];
        modelGroup.modelChanged();
        toolPathGroup.checkoutToolPathStatus();
        toolPathGroup._updated();
    }
}
