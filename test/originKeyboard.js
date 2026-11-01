import { test } from 'tape';
import { announceTarget, groupTargetsByOwner, nextTargetGroupIndex, stepReference } from '../src/app/ui/SVGEditor/origin/origin-keyboard';
import { buildOriginTargets } from '../src/app/ui/SVGEditor/snap/origin-targets';

const box = (minX, minY, maxX, maxY) => ({ min: { x: minX, y: minY }, max: { x: maxX, y: maxY } });

test('stepReference', (t) => {
    t.equal(stepReference('bottom-left', 'ArrowUp'), 'center-left');
    t.equal(stepReference('top-left', 'ArrowUp'), 'top-left');
    t.equal(stepReference('center', 'ArrowRight'), 'center-right');
    t.equal(stepReference('bottom-right', 'ArrowRight'), 'bottom-right');
    t.equal(stepReference('center', 'ArrowDown'), 'bottom-center');
    t.equal(stepReference('top-center', 'ArrowLeft'), 'top-left');
    t.end();
});

test('nextTargetGroupIndex', (t) => {
    t.equal(nextTargetGroupIndex(2, 3, false), 0);
    t.equal(nextTargetGroupIndex(0, 3, true), 2);
    t.equal(nextTargetGroupIndex(0, 0, false), -1);
    t.equal(nextTargetGroupIndex(0, 3, false), 1);
    t.end();
});

test('groupTargetsByOwner', (t) => {
    const obj = (modelID, b) => ({ modelID, name: modelID, box: b, visible: true, selected: false, groupID: null });
    const targets = buildOriginTargets({
        objects: [obj('logo', box(70, 140, 170, 240)), obj('text', box(180, 150, 300, 190)), obj('plate', box(60, 40, 350, 120))],
        groups: [],
        selection: null,
        workpiece: box(0, 0, 400, 300),
        insideGroups: false,
    });
    const groups = groupTargetsByOwner(targets);
    t.equal(groups.length, 4);
    t.ok(groups.every(g => g.length === 9));
    t.equal(groups[3][0].source.kind, 'workpiece', 'workpiece last');
    t.end();
});

test('announceTarget', (t) => {
    const target = { point: { x: 120, y: 240 }, reference: 'top-center', source: { kind: 'object', modelID: 'logo', selected: true }, rank: 1, name: 'Logo' };
    t.equal(announceTarget(target, 'Logo · top centre'), 'Logo, top centre, X 120.0, Y 240.0');
    t.end();
});
