import Operation from '../../core/Operation';
import { IDLE, WARNING } from '../../toolpaths/utils';

/**
 * Change which models belong to a tool path (add / remove objects).
 * Stores the member ids before and after; undo and redo restore them.
 */
export default class UpdateToolPathMembershipOperation extends Operation {
    state = {};

    constructor(state) {
        super();
        this.state = {
            toolPath: null,
            toolPathGroup: null,
            before: [], // member model ids before the change
            after: [], // member model ids after the change
            onChange: null, // called after every undo / redo (e.g. mark preview stale)
            ...state
        };
    }

    /**
     * Sets the members of several tool paths, then checks them (models taken out of one tool path and
     * put into another must not be checked half done).
     */
    static applyAll(changes, toolPathGroup, onChange = null) {
        const operations = changes.map(({ toolPath }) => new UpdateToolPathMembershipOperation({ toolPath, toolPathGroup, onChange }));
        operations.forEach((operation, i) => operation.setMembers(changes[i].ids));
        operations.forEach((operation) => operation.refresh());
    }

    apply(ids) {
        this.setMembers(ids);
        this.refresh();
    }

    setMembers(ids) {
        const { toolPath } = this.state;
        const old = toolPath.modelMap;
        const next = new Map();
        for (const id of ids) {
            next.set(id, old.get(id) || { meshObj: null, status: IDLE, toolPathFile: null });
        }
        // Mutate in place: other code keeps references to the map
        for (const id of [...old.keys()]) {
            if (!next.has(id)) {
                const meshObj = old.get(id)?.meshObj;
                if (meshObj && toolPath.object) toolPath.object.remove(meshObj);
                old.delete(id);
            }
        }
        // in the order of ids: the member order is the machining order (an undone removal goes back to its place)
        old.clear();
        for (const [id, value] of next) {
            old.set(id, value);
        }
    }

    refresh() {
        const { toolPath, toolPathGroup } = this.state;
        toolPath.status = WARNING; // needs a new preview
        toolPathGroup.checkoutToolPathStatus();
        toolPath.status = WARNING;
        toolPathGroup._updated();
        this.state.onChange?.();
    }

    redo() {
        this.apply(this.state.after);
    }

    undo() {
        this.apply(this.state.before);
    }
}
