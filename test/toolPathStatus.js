/* eslint-disable no-console */
import test from 'tape';
import ToolPath from '../src/app/toolpaths/ToolPath';

const model = (id) => ({
    modelID: id,
    visible: true,
    getTaskInfo: () => ({ modelID: id, visible: true, headType: 'cnc', sourceType: 'svg', mode: 'vector', transformation: { width: 1, height: 1 } })
});

test('the status check sees the members as they are now, not as of the last getState()', (t) => {
    const models = [model('a'), model('b')];
    const modelGroup = { getModels: () => models };
    const toolPath = new ToolPath({ name: 'Op', headType: 'cnc', type: 'vector', modelMode: 'vector', visibleModelIDs: ['a'], modelGroup });
    const errors = [];
    const error = console.error;
    console.error = (message) => errors.push(message);
    // combine / offset: a is replaced by b, the membership change swaps a for b in the map only
    models.shift();
    toolPath.modelMap.delete('a');
    toolPath.modelMap.set('b', { meshObj: null });
    toolPath.checkoutToolPathStatus();
    console.error = error;
    t.deepEqual(toolPath.visibleModelIDs, ['b']);
    t.deepEqual(errors, [], 'no "empty" error');
    t.end();
});
