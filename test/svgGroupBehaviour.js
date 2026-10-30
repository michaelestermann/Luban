import test from 'tape';
import { resolveObjectClick, groupMemberChips } from '../src/app/models/group-selection';

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
