import { test } from 'tape';
import {
    ORIGIN_TARGET_RANK,
    buildOriginTargets,
    canvasToModel,
    modelToCanvas,
    originTolerance,
    pickOriginTarget,
    selectionTargets,
    targetOrigin,
} from '../src/app/ui/SVGEditor/snap/origin-targets';

const box = (minX, minY, maxX, maxY) => ({ min: { x: minX, y: minY }, max: { x: maxX, y: maxY } });
const logo = box(70, 140, 170, 240);
const text = box(180, 150, 300, 190);
const plate = box(60, 40, 350, 120);
const wp = box(0, 0, 400, 300);

const obj = (modelID, b, extra = {}) => ({
    modelID, name: modelID[0].toUpperCase() + modelID.slice(1), box: b, visible: true, selected: false, groupID: null, ...extra,
});
const input = (over = {}) => ({
    objects: [obj('logo', logo), obj('text', text), obj('plate', plate)],
    groups: [],
    selection: null,
    workpiece: wp,
    insideGroups: false,
    ...over,
});
const twoSelected = () => input({
    objects: [obj('logo', logo, { selected: true }), obj('text', text, { selected: true }), obj('plate', plate)],
    selection: { modelIDs: ['logo', 'text'], groupID: null, box: box(70, 140, 300, 240) },
});

test('buildOriginTargets: 9 points per visible object and the workpiece', (t) => {
    t.equal(buildOriginTargets(input()).length, 36);
    t.equal(buildOriginTargets(input({ objects: [obj('logo', logo), obj('text', text, { visible: false }), obj('plate', plate)] })).length, 27);
    t.end();
});

test('selection of two adds the selection frame first', (t) => {
    const targets = buildOriginTargets(twoSelected());
    t.equal(targets.length, 45);
    const sel = targets.filter(x => x.source.kind === 'selection');
    t.equal(sel.length, 9);
    t.ok(sel.every(x => x.rank === 0), 'rank 0');
    t.deepEqual(sel.find(x => x.reference === 'center').point, { x: 185, y: 190 });
    t.end();
});

test('single selected object adds no selection frame', (t) => {
    const targets = buildOriginTargets(input({
        objects: [obj('logo', logo, { selected: true }), obj('text', text), obj('plate', plate)],
        selection: { modelIDs: ['logo'], groupID: null, box: logo },
    }));
    t.equal(targets.length, 36);
    t.ok(targets.filter(x => x.source.kind === 'object' && x.source.modelID === 'logo').every(x => x.rank === ORIGIN_TARGET_RANK.selectedObject));
    t.end();
});

test('group frame, members only with Ctrl', (t) => {
    const objects = [obj('logo', logo, { groupID: 'g' }), obj('text', text, { groupID: 'g' }), obj('plate', plate)];
    const groups = [{ groupID: 'g', name: 'Badge', memberIDs: ['logo', 'text'], box: box(70, 140, 300, 240), selected: false }];
    t.equal(buildOriginTargets(input({ objects, groups })).length, 27);
    t.equal(buildOriginTargets(input({ objects, groups, insideGroups: true })).length, 45);
    const selected = buildOriginTargets(input({
        objects,
        groups: [{ ...groups[0], selected: true }],
        selection: { modelIDs: ['logo', 'text'], groupID: 'g', box: box(70, 140, 300, 240) },
    }));
    t.equal(selected.length, 27, 'no extra selection frame for a selected group');
    t.ok(selected.filter(x => x.source.kind === 'group').every(x => x.rank === 0));
    t.end();
});

test('buildOriginTargets: rotationZ passed through for single objects', (t) => {
    const targets = buildOriginTargets(input({ objects: [obj('logo', logo, { rotationZ: 0.349 })] }));
    t.ok(targets.filter(x => x.source.kind === 'object').every(x => x.rotationZ === 0.349));
    t.end();
});

test('pickOriginTarget: within tolerance', (t) => {
    const targets = buildOriginTargets(input());
    const hit = pickOriginTarget(targets, { x: 70.5, y: 140.3 }, 1);
    t.equal(hit.source.modelID, 'logo');
    t.equal(hit.reference, 'bottom-left');
    t.equal(pickOriginTarget(targets, { x: 72, y: 140 }, 1), null);
    t.end();
});

test('pickOriginTarget: coincident points, rank wins', (t) => {
    t.equal(pickOriginTarget(buildOriginTargets(twoSelected()), { x: 70, y: 140 }, 1).source.kind, 'selection');
    const t2 = buildOriginTargets(input({ objects: [obj('small', box(0, 0, 50, 50))] }));
    t.equal(pickOriginTarget(t2, { x: 0, y: 0 }, 1).source.kind, 'object');
    t.end();
});

test('pickOriginTarget: nearer beats rank', (t) => {
    const targets = [
        { point: { x: 10, y: 0 }, reference: 'center', source: { kind: 'workpiece' }, rank: 4, name: '' },
        { point: { x: 10.6, y: 0 }, reference: 'center', source: { kind: 'selection', modelIDs: [] }, rank: 0, name: '' },
    ];
    t.equal(pickOriginTarget(targets, { x: 10.1, y: 0 }, 1).rank, 4);
    t.end();
});

test('targetOrigin', (t) => {
    const targets = buildOriginTargets(input());
    const logoBL = targets.find(x => x.source.kind === 'object' && x.source.modelID === 'logo' && x.reference === 'bottom-left');
    t.deepEqual(targetOrigin(logoBL, 'bottom-left'), { type: 1, reference: 'bottom-left', referenceMetadata: { modelIDs: ['logo'] } });
    const sel = { point: { x: 0, y: 0 }, reference: 'center', source: { kind: 'selection', modelIDs: ['logo', 'text'] }, rank: 0, name: '' };
    t.deepEqual(targetOrigin(sel, 'bottom-left').referenceMetadata.modelIDs, ['logo', 'text']);
    const grp = { point: { x: 300, y: 240 }, reference: 'top-right', source: { kind: 'group', groupID: 'g', memberIDs: ['logo', 'text'], selected: false }, rank: 2, name: 'Badge' };
    t.deepEqual(targetOrigin(grp, 'bottom-left'), { type: 1, reference: 'top-right', referenceMetadata: { groupID: 'g', modelIDs: ['logo', 'text'] } });
    const wpBL = targets.find(x => x.source.kind === 'workpiece' && x.reference === 'bottom-left');
    t.deepEqual(targetOrigin(wpBL, 'bottom-left'), { type: 0, reference: 'bottom-left', referenceMetadata: {} });
    const wpTR = targets.find(x => x.source.kind === 'workpiece' && x.reference === 'top-right');
    t.deepEqual(targetOrigin(wpTR, 'bottom-left'), { type: 1, reference: 'top-right', referenceMetadata: { workpiece: true } });
    t.end();
});

test('modelToCanvas / canvasToModel round trip', (t) => {
    t.deepEqual(modelToCanvas({ x: 70, y: 140 }, { x: 200, y: 200 }), { x: 270, y: 60 });
    t.deepEqual(canvasToModel({ x: 270, y: 60 }, { x: 200, y: 200 }), { x: 70, y: 140 });
    t.end();
});

test('originTolerance', (t) => {
    t.equal(originTolerance(2), 4);
    t.equal(originTolerance(-0.5), 16);
    t.end();
});

test('selectionTargets: the 9 points of the union frame', (t) => {
    const s = selectionTargets(buildOriginTargets(twoSelected()));
    t.equal(s.length, 9);
    t.deepEqual(s.find(x => x.reference === 'top-left').point, { x: 70, y: 240 });
    t.deepEqual(s.find(x => x.reference === 'center').point, { x: 185, y: 190 });
    const one = selectionTargets(buildOriginTargets(input({
        objects: [obj('logo', logo, { selected: true }), obj('text', text), obj('plate', plate)],
        selection: { modelIDs: ['logo'], groupID: null, box: logo },
    })));
    t.equal(one.length, 9);
    t.ok(one.every(x => x.source.kind === 'object' && x.source.modelID === 'logo'));
    t.end();
});
