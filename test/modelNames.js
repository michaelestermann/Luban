import test from 'tape';
import './fixtures/stub-document';
import ModelGroup2D from '../src/app/models/ModelGroup2D';

const svg = (originalName) => ({ sourceType: 'svg', originalName, mode: 'vector', config: { svgNodeName: 'image' } });

test('a project opened again after removing all models keeps its object names (no "(2)")', (t) => {
    const modelGroup = new ModelGroup2D('cnc');
    t.equal(modelGroup._createNewModelName(svg('umriss.svg')).name, 'umriss.svg');
    t.equal(modelGroup._createNewModelName(svg('umriss.svg')).name, 'umriss.svg (2)', 'second in one project');
    modelGroup.removeAllModels();
    t.equal(modelGroup._createNewModelName(svg('umriss.svg')).name, 'umriss.svg', 'next project starts the numbering again');
    t.end();
});

test('re-adding a model whose name counter was reset does not throw', (t) => {
    const modelGroup = new ModelGroup2D('cnc');
    modelGroup.removeAllModels();
    t.doesNotThrow(() => modelGroup.updateModelNameMap('umriss.svg (3)', 'umriss.svg', 'add'));
    t.deepEqual(modelGroup.namesMap.get('umriss.svg'), { count: 1, number: 3 });
    t.end();
});
