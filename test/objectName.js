import { test } from 'tape';
import {
    cleanObjectName,
    getEntityName,
    setEntityName,
    renameTargetID,
    MAX_OBJECT_NAME_LENGTH,
} from '../src/app/models/object-name';

test('cleanObjectName trims and keeps the old name for empty input', (t) => {
    t.equal(cleanObjectName('  Lid  ', 'Shape 1'), 'Lid', 'trimmed');
    t.equal(cleanObjectName('', 'Shape 1'), null, 'empty keeps the old name');
    t.equal(cleanObjectName('   \t ', 'Shape 1'), null, 'whitespace only keeps the old name');
    t.equal(cleanObjectName('Shape 1', 'Shape 1'), null, 'unchanged is no rename');
    t.equal(cleanObjectName(' Shape 1 ', 'Shape 1'), null, 'unchanged after trimming');
    t.equal(cleanObjectName(null, 'Shape 1'), null, 'no input');
    t.end();
});

test('cleanObjectName turns line breaks into spaces and limits the length', (t) => {
    t.equal(cleanObjectName('a\nb', 'x'), 'a b');
    const long = 'x'.repeat(MAX_OBJECT_NAME_LENGTH + 20);
    t.equal(cleanObjectName(long, 'y').length, MAX_OBJECT_NAME_LENGTH);
    t.end();
});

test('getEntityName / setEntityName: groups use name, objects modelName', (t) => {
    const group = { type: '2d-group', name: 'Group 1' };
    const model = { modelName: 'Shape 2' };
    t.equal(getEntityName(group), 'Group 1');
    t.equal(getEntityName(model), 'Shape 2');
    setEntityName(group, 'Front');
    setEntityName(model, 'Hole');
    t.equal(group.name, 'Front');
    t.equal(model.modelName, 'Hole');
    t.equal(model.name, undefined, 'objects get no name field');
    t.equal(getEntityName(null), '');
    t.end();
});

test('renameTargetID: the selected group, one object or nothing', (t) => {
    const a = { modelID: 'a' };
    const b = { modelID: 'b' };
    t.equal(renameTargetID([a], null), 'a', 'one object');
    t.equal(renameTargetID([a, b], 'g1'), 'g1', 'the whole group');
    t.equal(renameTargetID([a, b], null), null, 'several objects');
    t.equal(renameTargetID([], null), null, 'nothing selected');
    t.equal(renameTargetID(undefined, null), null);
    t.end();
});
