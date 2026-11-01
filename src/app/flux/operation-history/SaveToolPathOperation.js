// Not use now
import Operation from '../../core/Operation';
import log from '../../lib/log';

export default class SaveToolPathOperation extends Operation {
    state = {};

    constructor(state) {
        super();
        this.state = {
            target: null,
            toolPathGroup: null,
            newToolPathState: null,
            prevToolPath: null,
            prevToolPathState: null,
            ...state
        };
    }

    redo() {
        const target = this.state.target;
        const newToolPathState = this.state.newToolPathState;
        const prevToolPath = this.state.prevToolPath;
        const toolPathGroup = this.state.toolPathGroup;
        if (prevToolPath) {
            toolPathGroup.saveToolPath(newToolPathState, null, false);
        } else {
            toolPathGroup.toolPaths.push(target);
            toolPathGroup.toolPathObjects.add(target.object);
        }
    }

    undo() {
        const target = this.state.target;
        const toolPathGroup = this.state.toolPathGroup;
        const prevToolPath = this.state.prevToolPath;
        const prevToolPathState = this.state.prevToolPathState;
        log.debug('undo prevToolPath', prevToolPath, prevToolPath && prevToolPath.getState().gcodeConfig);
        if (prevToolPath) {
            toolPathGroup.saveToolPath(prevToolPathState, null, false);
        } else {
            toolPathGroup.deleteToolPath(target.id);
        }
    }
}
