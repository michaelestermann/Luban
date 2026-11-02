import { test } from 'tape';
import {
    dialogPreviewOrigin,
    dialogReferences,
    dialogStateFromTarget,
    dialogToOrigin,
    initialDialogState,
    previewBoxes,
    previewFit,
} from '../src/app/ui/SVGEditor/origin/origin-dialog-model';
import { createObjectOrigin } from '../src/app/lib/object-origin';
import { createFreeOrigin, createGroupOrigin, createWorkpieceFrameOrigin, withOffset, workpieceOrigin } from '../src/app/lib/work-origin';

const interpolate = (s, o = {}) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in o ? String(o[k]) : m));
const t = (k, o) => interpolate(k.replace(/^key-[^-]+-/, ''), o);
const box = (minX, minY, maxX, maxY) => ({ min: { x: minX, y: minY }, max: { x: maxX, y: maxY } });
const boxes = { logo: box(70, 140, 170, 240), text: box(180, 150, 300, 190), plate: box(60, 40, 350, 120) };
const names = { logo: 'Logo', text: 'Text', plate: 'Plate', g: 'Badge' };

const ctx = (selection = null, extra = {}) => ({
    getBox: id => boxes[id] || null,
    getGroupMemberIds: id => (id === 'g' ? ['logo', 'text'] : null),
    allBoxes: () => Object.values(boxes),
    workpieceBox: box(0, 0, 400, 300),
    selection,
    groups: [{ groupID: 'g', name: 'Badge', memberIDs: ['logo', 'text'] }],
    objectCount: 3,
    coordinateModeValue: 'bottom-left',
    getName: id => names[id] || null,
    t,
    ...extra,
});
const sel = (ids, groupID = null) => ({ modelIDs: ids, groupID, name: ids.length === 1 ? names[ids[0]] : null });
const logoBL = createObjectOrigin('bottom-left', ['logo']);

test('dialogReferences: nothing selected', (tt) => {
    const rows = dialogReferences(workpieceOrigin('bottom-left'), ctx());
    tt.deepEqual(rows.map(r => r.kind), ['workpiece', 'selection', 'all']);
    const s = rows.find(r => r.kind === 'selection');
    tt.equal(s.disabled, true);
    tt.equal(s.label, 'Selection');
    const all = rows.find(r => r.kind === 'all');
    tt.equal(all.label, 'All objects (3)');
    tt.deepEqual(all.size, { w: 290, h: 200 });
    tt.equal(rows.find(r => r.kind === 'workpiece').current, true);
    tt.deepEqual(rows.find(r => r.kind === 'workpiece').size, { w: 400, h: 300 });
    tt.end();
});

test('dialogReferences: one object selected and current', (tt) => {
    const rows = dialogReferences(logoBL, ctx(sel(['logo'])));
    const s = rows.find(r => r.kind === 'selection');
    tt.equal(s.label, 'Selection · Logo');
    tt.equal(s.current, true);
    tt.deepEqual(s.size, { w: 100, h: 100 });
    tt.equal(rows.find(r => r.kind === 'workpiece').current, false);
    tt.equal(rows.some(r => r.kind === 'bound'), false);
    tt.end();
});

test('dialogReferences: several selected', (tt) => {
    const rows = dialogReferences(workpieceOrigin('bottom-left'), ctx(sel(['logo', 'text'])));
    tt.equal(rows.find(r => r.kind === 'selection').label, 'Selection · 2 objects');
    tt.end();
});

test('dialogReferences: bound to objects that are not selected', (tt) => {
    const rows = dialogReferences(createObjectOrigin('bottom-center', ['plate']), ctx(sel(['logo'])));
    const bound = rows.find(r => r.kind === 'bound');
    tt.ok(bound);
    tt.equal(bound.current, true);
    tt.deepEqual(bound.modelIDs, ['plate']);
    tt.equal(bound.label, 'Plate');
    tt.equal(rows.find(r => r.kind === 'selection').current, false);
    tt.end();
});

test('dialogReferences: group', (tt) => {
    const rows = dialogReferences(workpieceOrigin('bottom-left'), ctx(sel(['logo', 'text'], 'g')));
    const g = rows.find(r => r.kind === 'group');
    tt.equal(g.label, 'Group “Badge”');
    tt.equal(g.groupID, 'g');
    tt.equal(rows.some(r => r.kind === 'selection'), false);
    tt.end();
});

test('initialDialogState', (tt) => {
    tt.deepEqual(initialDialogState(withOffset(logoBL, { x: 5, y: 0 }), ctx(sel(['logo']))),
        { reference: 'selection', point: 'bottom-left', offset: { x: 5, y: 0 }, follow: true });
    tt.deepEqual(initialDialogState(createFreeOrigin('bottom-left', { x: 12.5, y: -3 }), ctx()),
        { reference: 'workpiece', point: 'bottom-left', offset: { x: 12.5, y: -3 }, follow: false });
    tt.equal(initialDialogState({ type: 1, reference: 'center', referenceMetadata: {} }, ctx()).reference, 'all');
    const bound = initialDialogState(createObjectOrigin('top-left', ['plate']), ctx(sel(['logo'])));
    tt.equal(bound.reference, 'bound');
    tt.deepEqual(bound.referenceIDs, ['plate']);
    tt.equal(initialDialogState(createWorkpieceFrameOrigin('top-right'), ctx()).point, 'top-right');
    tt.end();
});

test('dialogToOrigin', (tt) => {
    const c = ctx(sel(['logo']));
    const base = { reference: 'selection', point: 'bottom-left', offset: { x: 5, y: 0 }, follow: true };
    tt.deepEqual(dialogToOrigin(base, c), withOffset(createObjectOrigin('bottom-left', ['logo']), { x: 5, y: 0 }));
    tt.deepEqual(dialogToOrigin({ ...base, follow: false }, c), { type: 0, reference: 'bottom-left', referenceMetadata: { offset: { x: 75, y: 140 } } });
    tt.deepEqual(dialogToOrigin({ reference: 'workpiece', point: 'top-right', offset: { x: 0, y: 0 }, follow: false }, c), createWorkpieceFrameOrigin('top-right'));
    tt.deepEqual(dialogToOrigin({ reference: 'workpiece', point: 'bottom-left', offset: { x: 5, y: 5 }, follow: false }, c), createFreeOrigin('bottom-left', { x: 5, y: 5 }));
    tt.deepEqual(dialogToOrigin({ reference: 'all', point: 'center', offset: { x: 0, y: 0 }, follow: true }, c), { type: 1, reference: 'center', referenceMetadata: {} });
    const g = ctx(sel(['logo', 'text'], 'g'));
    tt.deepEqual(dialogToOrigin({ reference: 'group', point: 'top-right', offset: { x: 0, y: 0 }, follow: true }, g), createGroupOrigin('top-right', 'g', ['logo', 'text']));
    tt.end();
});

test('dialogPreviewOrigin extent', (tt) => {
    const c = ctx(sel(['logo']), { allBoxes: () => [boxes.logo] });
    const p = dialogPreviewOrigin({ reference: 'selection', point: 'bottom-left', offset: { x: 5, y: 0 }, follow: true }, c);
    tt.deepEqual(p.extent, { minX: -5, maxX: 95, minY: 0, maxY: 100 });
    tt.deepEqual(p.zero, { x: 75, y: 140 });
    tt.deepEqual(p.reference, boxes.logo);
    tt.end();
});

test('previewFit', (tt) => {
    const f = previewFit([box(0, 0, 400, 300)], { w: 440, h: 300 }, 16);
    tt.equal(Math.round(f.scale * 10000) / 10000, 0.8933);
    // the box centre (200, 150) maps to the view centre; y goes down in the preview
    tt.ok(Math.abs(200 * f.scale + f.tx - 220) < 1e-9);
    tt.ok(Math.abs(-150 * f.scale + f.ty - 150) < 1e-9);
    tt.end();
});

test('previewBoxes zooms out for an outside zero', (tt) => {
    const wp = box(0, 0, 400, 300);
    const b = previewBoxes('workpiece', { workpiece: wp, reference: boxes.logo, zero: { x: -50, y: 10 } });
    tt.equal(Math.min(...b.map(x => x.min.x)), -50);
    const r = previewBoxes('reference', { workpiece: wp, reference: boxes.logo, zero: { x: 75, y: 140 } });
    tt.equal(Math.min(...r.map(x => x.min.x)), 70);
    tt.end();
});

test('dialogStateFromTarget: an unselected object becomes a bound row', (tt) => {
    const c = ctx(sel(['logo']));
    const state = { reference: 'selection', point: 'bottom-left', offset: { x: 5, y: 0 }, follow: true };
    const target = { point: { x: 205, y: 40 }, reference: 'bottom-center', source: { kind: 'object', modelID: 'plate', selected: false }, rank: 3, name: 'Plate' };
    const next = dialogStateFromTarget(state, target, c);
    tt.deepEqual(next, { reference: 'bound', point: 'bottom-center', offset: { x: 5, y: 0 }, follow: true, referenceIDs: ['plate'] });
    tt.deepEqual(dialogToOrigin(next, c), withOffset(createObjectOrigin('bottom-center', ['plate']), { x: 5, y: 0 }));
    // the selected object itself: the selection row
    const own = dialogStateFromTarget(state, { ...target, reference: 'top-left', source: { kind: 'object', modelID: 'logo', selected: true }, name: 'Logo' }, c);
    tt.equal(own.reference, 'selection');
    // a workpiece point: the workpiece row, follow off
    const wpT = dialogStateFromTarget(state, { point: { x: 400, y: 300 }, reference: 'top-right', source: { kind: 'workpiece' }, rank: 4, name: '' }, c);
    tt.deepEqual(wpT, { reference: 'workpiece', point: 'top-right', offset: { x: 5, y: 0 }, follow: false });
    tt.end();
});
