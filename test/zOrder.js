import test from 'tape';
import { moveToEdge, orderedMemberIds } from '../src/app/models/z-order';

const e = id => ({ modelID: id });

test('bring to front moves the selected entities to the end (front), keeping their order', (t) => {
    const list = [e('a'), e('b'), e('c'), e('d')];
    t.deepEqual(moveToEdge(list, [list[2], list[0]], 'front').map(x => x.modelID), ['b', 'd', 'a', 'c']);
    t.end();
});

test('send to back moves the selected entities to the start (back), keeping their order', (t) => {
    const list = [e('a'), e('b'), e('c'), e('d')];
    t.deepEqual(moveToEdge(list, [list[3], list[1]], 'back').map(x => x.modelID), ['b', 'd', 'a', 'c']);
    t.end();
});

test('moving entities that are not in the list changes nothing', (t) => {
    const list = [e('a'), e('b')];
    t.deepEqual(moveToEdge(list, [e('x')], 'front').map(x => x.modelID), ['a', 'b']);
    t.end();
});

test('an operation cuts its objects in the order of its chips, not of the object list', (t) => {
    const memberIds = ['c', 'a', 'b'];
    const leafs = [{ modelID: 'a', visible: true }, { modelID: 'b', visible: false }, { modelID: 'c', visible: true }];
    t.deepEqual(orderedMemberIds(memberIds, leafs), ['c', 'a'], 'chip order, hidden and missing objects left out');
    t.end();
});
