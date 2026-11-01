import test from 'tape';
import CompoundOperation from '../src/app/core/CompoundOperation';
import OperationHistory from '../src/app/core/OperationHistory';
import { applySelection, snapshotSelection } from '../src/app/flux/editor/selection-history';

const leaf = (id) => ({ modelID: id, elem: { id } });

// a ModelGroup2D / SVGActionsFactory pair that only knows the selection
const fakeScene = (models, groups = []) => {
    const modelGroup = {
        models: [...models, ...groups],
        selectedModelArray: [],
        selectedGroupID: null,
        getSelectedModelArray: () => modelGroup.selectedModelArray,
        getModels: () => [...models, ...groups.flatMap(g => g.children)],
    };
    const svgActions = {
        clearSelection: () => { modelGroup.selectedModelArray = []; modelGroup.selectedGroupID = null; },
        addSelectedSvgModelsByModels: (list) => { modelGroup.selectedModelArray = [...modelGroup.selectedModelArray, ...list]; },
    };
    return { modelGroup, svgActions };
};

test('snapshotSelection records the selected model IDs and the selected group', (t) => {
    const a = leaf('a'); const b = leaf('b');
    const { modelGroup } = fakeScene([a, b]);
    modelGroup.selectedModelArray = [b, a];
    modelGroup.selectedGroupID = 'g1';
    t.deepEqual(snapshotSelection(modelGroup), { ids: ['b', 'a'], groupID: 'g1' });
    t.end();
});

test('applySelection selects the recorded objects that exist, also group members', (t) => {
    const a = leaf('a'); const c1 = leaf('c1'); const c2 = leaf('c2');
    const group = { modelID: 'g', children: [c1, c2] };
    const { modelGroup, svgActions } = fakeScene([a], [group]);
    applySelection(modelGroup, svgActions, { ids: ['c1', 'c2'], groupID: 'g' });
    t.deepEqual(modelGroup.selectedModelArray.map(m => m.modelID), ['c1', 'c2']);
    t.equal(modelGroup.selectedGroupID, 'g', 'the group is selected again');

    applySelection(modelGroup, svgActions, { ids: ['a', 'gone'], groupID: 'gone-group' });
    t.deepEqual(modelGroup.selectedModelArray.map(m => m.modelID), ['a'], 'removed objects are left out');
    t.equal(modelGroup.selectedGroupID, null, 'a group that no longer exists is not selected');

    applySelection(modelGroup, svgActions, { ids: [], groupID: null });
    t.deepEqual(modelGroup.selectedModelArray, [], 'an empty selection clears');
    t.end();
});

test('a compound operation with a recorded selection restores it on undo and redo', (t) => {
    const log = [];
    const compound = new CompoundOperation();
    compound.push({ undo: () => log.push('undo op'), redo: () => log.push('redo op') });
    compound.registerCallbackAll(() => log.push('callback'));
    compound.recordSelection({ ids: ['a', 'b'], groupID: null }, { ids: ['w'], groupID: null }, (s) => log.push(`select ${s.ids.join(',')}`));
    const history = new OperationHistory();
    history.push(compound);

    history.undo();
    t.deepEqual(log, ['undo op', 'callback', 'select a,b'], 'undo selects what was selected before, after the operation and its callbacks');
    log.length = 0;
    history.redo();
    t.deepEqual(log, ['redo op', 'callback', 'select w'], 'redo selects what was selected after');
    t.end();
});

test('a compound operation without a recorded selection does not touch the selection', (t) => {
    const log = [];
    const compound = new CompoundOperation();
    compound.push({ undo: () => log.push('undo'), redo: () => log.push('redo') });
    compound.undo();
    compound.redo();
    t.deepEqual(log, ['undo', 'redo']);
    t.end();
});
