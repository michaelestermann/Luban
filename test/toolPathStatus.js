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

test('a toolpath whose objects are all hidden is skipped, not failed', (t) => {
    const a = model('a');
    a.visible = false;
    const modelGroup = { getModels: () => [a] };
    const toolPath = new ToolPath({ name: 'Op', headType: 'cnc', type: 'vector', modelMode: 'vector', visibleModelIDs: ['a'], modelGroup });
    const error = console.error;
    console.error = () => {};
    toolPath.checkoutToolPathStatus();
    console.error = error;
    t.notEqual(toolPath.status, 'failed', 'hidden objects do not fail the toolpath');
    t.equal(toolPath.getGenerateToolPathTask(), null, 'nothing to generate');
    t.notOk(toolPath.hasVisibleModels(), 'left out of the "all toolpaths generated" check');
    t.end();
});

test('a toolpath without any objects still fails', (t) => {
    const modelGroup = { getModels: () => [] };
    const toolPath = new ToolPath({ name: 'Op', headType: 'cnc', type: 'vector', modelMode: 'vector', visibleModelIDs: [], modelGroup });
    const error = console.error;
    console.error = () => {};
    toolPath.checkoutToolPathStatus();
    console.error = error;
    t.equal(toolPath.status, 'failed');
    t.end();
});
