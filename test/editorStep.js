import { test } from 'tape';
import {
    getEditorStep, getStepIndex, EDITOR_STEPS, needsGcodeRegeneration, stateAfterGcodeFailure, stateAfterNewGcode
} from '../src/app/ui/pages/CncLaserShared/editor-step';

const gcodeFile = { uploadName: 'a.nc' };

test('getEditorStep: editor page is the design step', (t) => {
    t.equal(getEditorStep({ page: 'editor', needToPreview: false, gcodeFile }), 'design');
    t.equal(getEditorStep({ page: 'editor', needToPreview: true, gcodeFile: null }), 'design');
    t.end();
});

test('getEditorStep: process page without up-to-date G-code is the toolpaths step', (t) => {
    t.equal(getEditorStep({ page: 'process', needToPreview: true, gcodeFile: null }), 'toolpaths', 'needs preview, no file');
    t.equal(getEditorStep({ page: 'process', needToPreview: true, gcodeFile }), 'toolpaths', 'needs preview, stale file');
    t.equal(getEditorStep({ page: 'process', needToPreview: false, gcodeFile: null }), 'toolpaths', 'previewed, no file');
    t.equal(getEditorStep({ page: 'process', needToPreview: false }), 'toolpaths', 'gcodeFile undefined');
    t.end();
});

test('getEditorStep: process page with generated G-code is the gcode step', (t) => {
    t.equal(getEditorStep({ page: 'process', needToPreview: false, gcodeFile }), 'gcode');
    t.end();
});

test('getEditorStep: viewing the toolpaths keeps a valid G-code file but shows step 2', (t) => {
    t.equal(getEditorStep({ page: 'process', needToPreview: false, gcodeFile, viewingToolpaths: true }), 'toolpaths',
        'process + valid gcodeFile + viewingToolpaths');
    t.equal(getEditorStep({ page: 'process', needToPreview: false, gcodeFile, viewingToolpaths: false }), 'gcode',
        'process + valid gcodeFile + !viewingToolpaths');
    t.equal(getEditorStep({ page: 'editor', needToPreview: false, gcodeFile, viewingToolpaths: true }), 'design',
        'the editor page wins over the flag');
    t.end();
});

test('getEditorStep: missing state falls back to design', (t) => {
    t.equal(getEditorStep(undefined), 'design');
    t.end();
});

test('step order', (t) => {
    t.deepEqual(EDITOR_STEPS, ['design', 'toolpaths', 'gcode']);
    t.equal(getStepIndex('design'), 0);
    t.equal(getStepIndex('gcode'), 2);
    t.end();
});

test('getEditorStep: a requested G-code generation stays on the toolpaths step until the new file arrives', (t) => {
    t.equal(getEditorStep({ page: 'process', needToPreview: false, gcodeFile, gcodeRequested: true }), 'toolpaths',
        'regenerating with an existing gcodeFile -> toolpaths');
    t.equal(getEditorStep({ page: 'editor', needToPreview: false, gcodeFile, gcodeRequested: true }), 'design',
        'the editor page wins over the request');
    t.end();
});

test('stateAfterGcodeFailure: a failed requested generation stays on step 2 and hides the stale files', (t) => {
    const before = { page: 'process', needToPreview: false, gcodeFile, gcodeRequested: true, viewingToolpaths: false };
    const after = { ...before, ...stateAfterGcodeFailure(before) };
    t.equal(after.gcodeRequested, false, 'the request ends');
    t.equal(getEditorStep(after), 'toolpaths', 'generation failed -> toolpaths, stale files not shown');
    t.deepEqual(stateAfterGcodeFailure({ page: 'process', gcodeFile, gcodeRequested: false }), {},
        'an unrequested failure changes no step state');
    t.end();
});

test('stateAfterNewGcode: only a requested generation moves to the G-code step', (t) => {
    const requested = { page: 'process', needToPreview: false, gcodeFile, gcodeRequested: true, viewingToolpaths: true };
    t.equal(getEditorStep({ ...requested, ...stateAfterNewGcode(requested) }), 'gcode', 'requested -> gcode');
    t.equal(stateAfterNewGcode(requested).gcodeRequested, false, 'the request ends');

    const editingInStep2 = { page: 'process', needToPreview: false, gcodeFile, gcodeRequested: false, viewingToolpaths: true };
    t.equal(getEditorStep({ ...editingInStep2, ...stateAfterNewGcode(editingInStep2) }), 'toolpaths',
        'an edit in step 2 regenerates G-code but stays on step 2');

    const firstAutoPreview = { page: 'process', needToPreview: false, gcodeFile: null, gcodeRequested: false, viewingToolpaths: false };
    t.equal(getEditorStep({ ...firstAutoPreview, ...stateAfterNewGcode(firstAutoPreview), gcodeFile }), 'toolpaths',
        'an unrequested first file stays on step 2');

    const inStep3 = { page: 'process', needToPreview: false, gcodeFile, gcodeRequested: false, viewingToolpaths: false };
    t.equal(getEditorStep({ ...inStep3, ...stateAfterNewGcode(inStep3) }), 'gcode', 'step 3 stays step 3');
    t.end();
});

test('needsGcodeRegeneration: stale, missing or changed G-code is regenerated', (t) => {
    t.equal(needsGcodeRegeneration({ needToPreview: true, gcodeFile }), true, 'needs preview');
    t.equal(needsGcodeRegeneration({ needToPreview: false, gcodeFile: null }), true, 'no file');
    t.equal(needsGcodeRegeneration({ needToPreview: false, gcodeFile: null, isGcodeGenerating: true }), false,
        'no file but already generating');
    t.equal(needsGcodeRegeneration({ needToPreview: false, gcodeFile, isChangedAfterGcodeGenerating: true }), true,
        'reordered / visibility toggled after generation');
    t.equal(needsGcodeRegeneration({ needToPreview: false, gcodeFile, isChangedAfterGcodeGenerating: false }), false,
        'up-to-date file');
    t.end();
});
