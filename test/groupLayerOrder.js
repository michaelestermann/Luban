import test from 'tape';
import './fixtures/stub-document';
import ModelGroup2D from '../src/app/models/ModelGroup2D';
import SvgModel from '../src/app/models/SvgModel';
import GroupSvgOperation from '../src/app/scene/operations/GroupSvgOperation';
import UngroupSvgOperation from '../src/app/scene/operations/UngroupSvgOperation';

// leaf models with a fake SVG element in a shared parent, so the DOM order can be checked
const setup = (names) => {
    const dom = [];
    const parentNode = { appendChild: (elem) => { dom.splice(dom.indexOf(elem), 1); dom.push(elem); } };
    const modelGroup = new ModelGroup2D('cnc');
    modelGroup.models = names.map((name) => {
        const model = Object.create(SvgModel.prototype);
        model.modelID = name;
        model.transformation = { positionZ: 0 };
        model.updateTransformation = (t) => Object.assign(model.transformation, t);
        model.elem = { id: name, parentNode };
        dom.push(model.elem);
        return model;
    });
    const byName = (name) => modelGroup.models.find((m) => m.modelID === name);
    const layout = () => modelGroup.models.map((m) => (m.children ? `[${m.children.map((c) => c.modelID).join('')}]` : m.modelID)).join(' ');
    return { modelGroup, byName, layout, dom: () => dom.map((e) => e.id).join('') };
};

test('grouping keeps the members in layer order, the SVG elements follow, and undo restores the layers', (t) => {
    const { modelGroup, byName, layout, dom } = setup(['a', 'b', 'c', 'd']);
    // selected front to back and apart in the layer order
    const operation = new GroupSvgOperation({ modelGroup, targetModels: [byName('d'), byName('b')] });
    operation.redo();
    t.equal(layout(), 'a [bd] c');
    t.equal(dom(), 'abdc', 'the SVG elements are in the layer order');
    operation.undo();
    t.equal(layout(), 'a b c d');
    t.equal(dom(), 'abcd');
    t.end();
});

test('redo of grouping and undo of ungrouping put the same group object back (later steps hold it)', (t) => {
    const { modelGroup, byName } = setup(['a', 'b', 'c']);
    const operation = new GroupSvgOperation({ modelGroup, targetModels: [byName('a'), byName('b')] });
    operation.redo();
    const group = modelGroup.models.find((m) => m.type === '2d-group');
    operation.undo();
    operation.redo();
    t.equal(modelGroup.models.find((m) => m.type === '2d-group'), group, 'redo');
    t.deepEqual(group.children.map((c) => c.modelID), ['a', 'b']);
    const ungroup = new UngroupSvgOperation({ modelGroup, target: group });
    ungroup.redo();
    t.equal(modelGroup.models.includes(group), false);
    ungroup.undo();
    t.equal(modelGroup.models.find((m) => m.type === '2d-group'), group, 'undo of ungroup');
    t.end();
});
