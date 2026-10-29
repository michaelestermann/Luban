import test from 'tape';
import SvgGroup from '../src/app/models/SvgGroup';

test('SvgGroup: constructor assigns core fields', (t) => {
    const fakeModelGroup = {};
    const group = new SvgGroup(
        { name: 'Group 1', baseName: 'group', headType: 'laser' },
        fakeModelGroup
    );

    t.equal(group.type, '2d-group', 'type is 2d-group');
    t.equal(group.name, 'Group 1', 'name is set');
    t.equal(group.baseName, 'group', 'baseName is set');
    t.equal(group.headType, 'laser', 'headType is set');
    t.equal(group.visible, true, 'visible defaults to true');
    t.equal(typeof group.modelID, 'string', 'modelID is generated');
    t.ok(group.modelID.length > 0, 'modelID is non-empty');
    t.deepEqual(group.children, [], 'children starts empty');
    t.equal(group.modelGroup, fakeModelGroup, 'modelGroup back-reference set');
    t.end();
});

test('SvgGroup: addChild appends and sets parent', (t) => {
    const group = new SvgGroup(
        { name: 'G', baseName: 'g', headType: 'laser' },
        {}
    );
    const fakeChild = { modelID: 'm1', parent: null };

    group.addChild(fakeChild);

    t.deepEqual(group.children.map(c => c.modelID), ['m1'], 'child added');
    t.equal(fakeChild.parent, group, 'parent set on child');
    t.end();
});

test('SvgGroup: removeChild drops the child and clears parent', (t) => {
    const group = new SvgGroup(
        { name: 'G', baseName: 'g', headType: 'laser' },
        {}
    );
    const fakeA = { modelID: 'a', parent: null };
    const fakeB = { modelID: 'b', parent: null };
    group.addChild(fakeA);
    group.addChild(fakeB);

    group.removeChild(fakeA);

    t.deepEqual(group.children.map(c => c.modelID), ['b'], 'only b remains');
    t.equal(fakeA.parent, null, 'parent cleared on removed child');
    t.end();
});

test('SvgGroup: removeChild is a no-op for unknown children', (t) => {
    const group = new SvgGroup(
        { name: 'G', baseName: 'g', headType: 'laser' },
        {}
    );
    const known = { modelID: 'known', parent: null };
    const unknown = { modelID: 'unknown', parent: null };
    group.addChild(known);

    group.removeChild(unknown);

    t.deepEqual(group.children.map(c => c.modelID), ['known'], 'known still there');
    t.equal(known.parent, group, 'known parent untouched');
    t.end();
});
