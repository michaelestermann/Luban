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
            ...state
        };
    }

    apply(ids) {
        const { toolPath, toolPathGroup } = this.state;
        const old = toolPath.modelMap;
        const next = new Map();
        for (const id of ids) {
            next.set(id, old.get(id) || { meshObj: null, status: IDLE, toolPathFile: null });
        }
        // Mutate in place: other code keeps references to the map
        for (const id of [...old.keys()]) {
            if (!next.has(id)) old.delete(id);
        }
        for (const [id, value] of next) {
            if (!old.has(id)) old.set(id, value);
        }
        toolPath.status = WARNING; // needs a new preview
        toolPathGroup.checkoutToolPathStatus();
        toolPath.status = WARNING;
        toolPathGroup._updated();
    }

    redo() {
        this.apply(this.state.after);
    }

    undo() {
        this.apply(this.state.before);
    }
}
