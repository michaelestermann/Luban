import test from 'tape';
import DecomposeOperation2D from '../src/app/flux/operation-history/DecomposeOperation2D';

// Fake world: models list, tool paths with modelMap, and add/delete operations
// that behave like AddOperation2D / DeleteOperation2D on that world.
const setup = ({ inGroup = false } = {}) => {
    const log = [];
    const original = { modelID: 'orig' };
    const other = { modelID: 'other' };
    const parts = [{ modelID: 'p1' }, { modelID: 'p2' }];
    const group = inGroup ? {
        modelID: 'grp',
        children: [other, original],
        addChild(child) { if (!this.children.includes(child)) this.children.push(child); },
    } : null;
    const modelGroup = {
        models: inGroup ? [group] : [other, original],
        modelChanged: () => {},
    };
    const toolPath = { id: 'tp', modelMap: new Map([['orig', {}]]) };
    const toolPathGroup = {
        toolPaths: [toolPath],
        deleted: [],
        checkoutToolPathStatus: () => {},
        _updated: () => {},
    };
    const container = () => (inGroup ? group.children : modelGroup.models);
    const remove = (model) => {
        modelGroup.models = modelGroup.models.filter((m) => m !== model);
        if (group) group.children = group.children.filter((m) => m !== model);
        const had = toolPath.modelMap.delete(model.modelID);
        if (had && toolPath.modelMap.size === 0) toolPathGroup.deleted.push(toolPath.id);
    };
    const addOperations = parts.map((part) => ({
        redo() { log.push(`add ${part.modelID}`); modelGroup.models.push(part); },
        undo() { log.push(`remove ${part.modelID}`); remove(part); },
    }));
    const deleteOperation = {
        redo() { log.push('delete orig'); remove(original); },
        undo() {
            log.push('restore orig');
            toolPath.modelMap.set('orig', {});
            if (group) group.children.push(original); else modelGroup.models.push(original);
        },
    };
    const operation = new DecomposeOperation2D({
        original,
        parts,
        addOperations,
        deleteOperation,
        modelGroup,
        toolPathGroup,
        toolPaths: [toolPath],
        parentGroup: group,
        index: container().indexOf(original),
    });
    return { operation, log, modelGroup, toolPath, toolPathGroup, group, container, parts, original };
};

const ids = (list) => list.map((m) => m.modelID);

test('DecomposeOperation2D: placeParts puts parts into the tool paths and the original\'s slot', (t) => {
    const { operation, modelGroup, toolPath, parts } = setup();
    modelGroup.models.push(...parts); // as generateModel does
    operation.placeParts();
    t.deepEqual(ids(modelGroup.models), ['other', 'p1', 'p2', 'orig'], 'parts before the original, in document order');
    t.ok(toolPath.modelMap.has('p1') && toolPath.modelMap.has('p2'), 'parts are in the original\'s tool path');
    t.equal(toolPath.modelMap.get('p1').status, 'idle', 'membership entry has idle status');
    t.end();
});

test('DecomposeOperation2D: undo restores the original first and keeps the tool path', (t) => {
    const { operation, log, modelGroup, toolPath, toolPathGroup, parts } = setup();
    modelGroup.models.push(...parts);
    operation.placeParts();
    operation.state.deleteOperation.redo();
    log.length = 0;

    operation.undo();
    t.deepEqual(log, ['restore orig', 'remove p2', 'remove p1'], 'original restored before parts removed');
    t.deepEqual(ids(modelGroup.models), ['other', 'orig'], 'original back at its old index');
    t.deepEqual([...toolPath.modelMap.keys()], ['orig'], 'tool path holds only the original again');
    t.deepEqual(toolPathGroup.deleted, [], 'tool path never ran empty');
    t.end();
});

test('DecomposeOperation2D: redo adds parts before deleting the original', (t) => {
    const { operation, log, modelGroup, toolPath, toolPathGroup, parts } = setup();
    modelGroup.models.push(...parts);
    operation.placeParts();
    operation.state.deleteOperation.redo();
    operation.undo();
    log.length = 0;

    operation.redo();
    t.deepEqual(log, ['add p1', 'add p2', 'delete orig'], 'parts first, then original');
    t.deepEqual(ids(modelGroup.models), ['other', 'p1', 'p2'], 'parts in the original\'s slot');
    t.deepEqual([...toolPath.modelMap.keys()].sort(), ['p1', 'p2'], 'parts in the tool path');
    t.deepEqual(toolPathGroup.deleted, [], 'tool path never ran empty');
    t.end();
});

test('DecomposeOperation2D: parts join the original\'s 2D group', (t) => {
    const { operation, modelGroup, group, parts } = setup({ inGroup: true });
    modelGroup.models.push(...parts);
    operation.placeParts();
    t.deepEqual(ids(modelGroup.models), ['grp'], 'parts are not top-level');
    t.deepEqual(ids(group.children), ['other', 'p1', 'p2', 'orig'], 'parts in the group at the original\'s place');

    operation.state.deleteOperation.redo();
    operation.undo();
    t.deepEqual(ids(group.children), ['other', 'orig'], 'undo leaves the group as before');
    t.end();
});
