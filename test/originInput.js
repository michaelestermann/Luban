import { test } from 'tape';
import { buildOriginTargetInput } from '../src/app/ui/SVGEditor/origin/origin-input';
import { buildOriginTargets, selectionTargets } from '../src/app/ui/SVGEditor/snap/origin-targets';

const model = (modelID, minX, minY, maxX, maxY) => ({
    modelID,
    modelName: modelID,
    visible: true,
    boundingBox: { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } },
});

test('buildOriginTargetInput: a mirrored object (min > max) gives its 9 frame points', (t) => {
    // Plate flipped horizontally: SvgModel.boundingBox keeps min.x 350 / max.x 60
    const plate = model('plate', 350, 40, 60, 120);
    const group = { models: [plate], getModels: () => [plate], getSelectedModelArray: () => [plate], selectedGroupID: null };
    const input = buildOriginTargetInput(group, { x: 400, y: 300 }, { x: 1, y: 1 }, false);
    t.deepEqual(input.objects[0].box, { min: { x: 60, y: 40 }, max: { x: 350, y: 120 } });
    const own = selectionTargets(buildOriginTargets(input));
    t.equal(own.length, 9, 'pick mode shows the 9 points of the mirrored selection');
    t.deepEqual(own.find(p => p.reference === 'bottom-left').point, { x: 60, y: 40 });
    t.end();
});
