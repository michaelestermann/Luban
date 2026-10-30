import test from 'tape';
import { resolveObjectClick, groupMemberChips } from '../src/app/models/group-selection';
import {
    takeMembershipSnapshot,
    describeMembershipLoss,
    restoreMembershipSnapshot,
    removeModelFromAllToolPaths
} from '../src/app/toolpaths/membership-snapshot';
import GroupSvgOperation from '../src/app/scene/operations/GroupSvgOperation';

test('click on a free object selects it and leaves the member selection', (t) => {
    t.deepEqual(resolveObjectClick(null, null), { expandToGroup: false, enteredGroupId: null });
    t.deepEqual(resolveObjectClick(null, 'g1'), { expandToGroup: false, enteredGroupId: null });
    t.end();
});

test('click on a group member selects the whole group', (t) => {
    t.deepEqual(resolveObjectClick('g1', null), { expandToGroup: true, enteredGroupId: null });
    t.end();
});

test('click on a sibling while a member is selected keeps selecting members', (t) => {
    t.deepEqual(resolveObjectClick('g1', 'g1'), { expandToGroup: false, enteredGroupId: 'g1' });
    t.end();
});

test('click on a member of another group selects that group', (t) => {
    t.deepEqual(resolveObjectClick('g2', 'g1'), { expandToGroup: true, enteredGroupId: null });
    t.end();
});

const group = (modelID, name, ids) => ({ modelID, name, children: ids.map(id => ({ modelID: id })) });

test('a group whose members are all in the operation shows as one chip', (t) => {
    const chips = groupMemberChips(['x', 'a', 'b'], [group('g1', 'Group 1', ['a', 'b'])]);
    t.deepEqual(chips, [
        { kind: 'model', id: 'x' },
        { kind: 'group', id: 'g1', name: 'Group 1', ids: ['a', 'b'] }
    ]);
    t.end();
});

test('a group with only some members in the operation shows its members', (t) => {
    const chips = groupMemberChips(['a', 'x'], [group('g1', 'Group 1', ['a', 'b'])]);
    t.deepEqual(chips, [{ kind: 'model', id: 'a' }, { kind: 'model', id: 'x' }]);
    t.end();
});

const toolPath = (id, name, ids) => ({
    id,
    name,
    status: 'success',
    object: { parent: {} },
    modelMap: new Map(ids.map(i => [i, { meshObj: { name: `mesh-${i}` }, status: 'success' }]))
});

test('membership loss names removed and reduced operations', (t) => {
    const iso = toolPath('t1', 'Isolation', ['a']);
    const bohr = toolPath('t2', 'Bohrungen', ['b', 'c']);
    const umr = toolPath('t3', 'Umriss', ['d']);
    const snapshot = takeMembershipSnapshot([iso, bohr, umr]);
    bohr.modelMap.delete('b');
    t.deepEqual(describeMembershipLoss(snapshot, [bohr, umr]), { removed: ['Isolation'], reduced: ['Bohrungen'] });
    t.end();
});

test('restoring a snapshot brings back deleted operations and members', (t) => {
    const iso = toolPath('t1', 'Isolation', ['a']);
    const bohr = toolPath('t2', 'Bohrungen', ['b', 'c']);
    const snapshot = takeMembershipSnapshot([iso, bohr]);
    const added = [];
    let updated = 0;
    const toolPathGroup = {
        toolPaths: [bohr],
        toolPathObjects: { add: (o) => added.push(o) },
        _updated: () => { updated++; }
    };
    iso.object.parent = null;
    bohr.modelMap.delete('b');

    restoreMembershipSnapshot(toolPathGroup, snapshot);

    t.deepEqual(toolPathGroup.toolPaths, [iso, bohr], 'order restored');
    t.deepEqual([...bohr.modelMap.keys()], ['b', 'c'], 'member restored in order');
    t.equal(bohr.modelMap.get('b').meshObj, null, 'restored member needs a new preview');
    t.equal(bohr.modelMap.get('c').meshObj.name, 'mesh-c', 'kept member keeps its preview');
    t.equal(bohr.status, 'warning');
    t.deepEqual(added, [iso.object], 'deleted operation is shown again');
    t.equal(updated, 1);
    t.end();
});

test('undo of grouping restores the operations the grouping removed objects from', (t) => {
    const a = { modelID: 'a' };
    const b = { modelID: 'b' };
    const iso = toolPath('t1', 'Isolation', ['a']);
    const toolPathGroup = {
        toolPaths: [iso],
        toolPathObjects: { add: () => {} },
        _updated: () => {}
    };
    const newGroup = { modelID: 'g1', children: [a, b] };
    const modelGroup = {
        selectedGroupID: null,
        selectedModelArray: [],
        group: () => {
            toolPathGroup.toolPaths = [];
            return { newGroup };
        },
        ungroup: () => {}
    };
    const op = new GroupSvgOperation({ modelGroup, targetModels: [a, b], toolPathGroup });
    op.redo();
    t.deepEqual(op.getMembershipLoss(), { removed: ['Isolation'], reduced: [] });
    op.undo();
    t.deepEqual(toolPathGroup.toolPaths, [iso]);
    t.end();
});

test('grouping takes the objects out of the toolpath members, not only the visible list', (t) => {
    const keep = toolPath('t1', 'Bohrungen', ['a', 'b']);
    keep.visibleModelIDs = ['a', 'b'];
    keep.deleteModel = (id) => { keep.modelMap.delete(id); keep.visibleModelIDs = keep.visibleModelIDs.filter(v => v !== id); };
    const gone = toolPath('t2', 'Isolation', ['a']);
    gone.visibleModelIDs = ['a'];
    gone.deleteModel = (id) => { gone.modelMap.delete(id); gone.visibleModelIDs = []; };
    const deleted = [];
    const fake = {
        toolPaths: [keep, gone],
        deleteToolPath: (id) => deleted.push(id),
        _updated: () => {}
    };
    const result = removeModelFromAllToolPaths(fake, 'a');
    t.deepEqual([...keep.modelMap.keys()], ['b']);
    t.equal(keep.status, 'warning', 'needs a new preview');
    t.deepEqual(deleted, ['t2']);
    t.deepEqual(result.deletedToolPathIDs, ['t2']);
    t.end();
});

test('group row shows the operations of the whole group, member rows the rest', (t) => {
    // eslint-disable-next-line global-require
    const { getGroupOperationColors } = require('../src/app/toolpaths/operations-panel');
    const tp = ids => ({ type: 'vector', modelMap: new Map(ids.map(i => [i, {}])) });
    const colors = getGroupOperationColors([tp(['a', 'b']), tp(['b']), tp(['x'])], ['a', 'b']);
    t.deepEqual(colors.group, ['#1d4ed8']);
    t.deepEqual(colors.members.get('a'), []);
    t.deepEqual(colors.members.get('b'), ['#d97706']);
    t.end();
});
