import test from 'tape';
import './fixtures/stub-document';
import CompoundOperation from '../src/app/core/CompoundOperation';
import ModelGroup2D from '../src/app/models/ModelGroup2D';
import SvgModel from '../src/app/models/SvgModel';
import GroupSvgOperation from '../src/app/scene/operations/GroupSvgOperation';
import UngroupSvgOperation from '../src/app/scene/operations/UngroupSvgOperation';
import { pushOriginRebind } from '../src/app/flux/editor/ungroup-origin';
import { createGroupOrigin, workpieceOrigin } from '../src/app/lib/work-origin';

const setup = (names) => {
    const parentNode = { appendChild: () => {} };
    const modelGroup = new ModelGroup2D('cnc');
    modelGroup.models = names.map((name) => {
        const model = Object.create(SvgModel.prototype);
        model.modelID = name;
        model.transformation = { positionZ: 0 };
        model.updateTransformation = (tr) => Object.assign(model.transformation, tr);
        model.elem = { id: name, parentNode };
        return model;
    });
    const byName = (name) => modelGroup.models.find((m) => m.modelID === name);
    const grouping = new GroupSvgOperation({ modelGroup, targetModels: [byName('a'), byName('b')] });
    grouping.redo();
    const group = modelGroup.models.find((m) => m.type === '2d-group');
    return { modelGroup, group };
};

test('ungroup with the origin on the group: one compound, undo restores both', (t) => {
    const { modelGroup, group } = setup(['a', 'b', 'c']);
    let current = createGroupOrigin('top-right', group.modelID, ['a', 'b']);
    const compound = new CompoundOperation();
    compound.push(new UngroupSvgOperation({ modelGroup, target: group }));
    const pushed = pushOriginRebind(compound, {
        origin: current, groupID: group.modelID, memberIDs: ['a', 'b'], apply: (o) => { current = o; },
    });
    t.equal(pushed, true);
    compound.redo();
    t.deepEqual(current.referenceMetadata, { modelIDs: ['a', 'b'] });
    t.equal(modelGroup.getModel(group.modelID), null, 'group gone');
    compound.undo();
    t.equal(current.referenceMetadata.groupID, group.modelID, 'origin back on the group');
    t.equal(modelGroup.getModel(group.modelID).children.length, 2, 'group back');
    t.end();
});

test('ungroup of another group pushes nothing', (t) => {
    const { modelGroup, group } = setup(['a', 'b', 'c']);
    const compound = new CompoundOperation();
    compound.push(new UngroupSvgOperation({ modelGroup, target: group }));
    const other = createGroupOrigin('top-right', 'other', ['x']);
    t.equal(pushOriginRebind(compound, { origin: other, groupID: group.modelID, memberIDs: ['a', 'b'], apply: () => {} }), false);
    t.equal(pushOriginRebind(compound, { origin: workpieceOrigin('center'), groupID: group.modelID, memberIDs: ['a', 'b'], apply: () => {} }), false);
    t.equal(compound.operations.length, 1);
    t.end();
});
