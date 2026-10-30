import test from 'tape';
import { reorderIndex, moveItem } from '../src/app/toolpaths/reorder';

test('dropping below a later card moves to that card', (t) => {
    // [a b c d]: drag a (0) below c (2) -> [b c a d]
    t.equal(reorderIndex(0, 2, true), 2);
    t.deepEqual(moveItem(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
    t.end();
});

test('dropping above an earlier card moves to that card', (t) => {
    // drag d (3) above b (1) -> [a d b c]
    t.equal(reorderIndex(3, 1, false), 1);
    t.deepEqual(moveItem(['a', 'b', 'c', 'd'], 3, 1), ['a', 'd', 'b', 'c']);
    t.end();
});

test('dropping next to itself keeps the order', (t) => {
    t.equal(reorderIndex(1, 1, false), 1);
    t.equal(reorderIndex(1, 1, true), 1);
    t.equal(reorderIndex(1, 0, true), 1);
    t.equal(reorderIndex(1, 2, false), 1);
    t.end();
});

test('dropping on the edges moves to first and last place', (t) => {
    t.equal(reorderIndex(2, 0, false), 0);
    t.equal(reorderIndex(0, 3, true), 3);
    t.end();
});

test('moveItem does not change the input and ignores invalid indices', (t) => {
    const list = ['a', 'b', 'c'];
    t.deepEqual(moveItem(list, 0, 2), ['b', 'c', 'a']);
    t.deepEqual(list, ['a', 'b', 'c']);
    t.deepEqual(moveItem(list, -1, 2), ['a', 'b', 'c']);
    t.deepEqual(moveItem(list, 0, 5), ['a', 'b', 'c']);
    t.end();
});
