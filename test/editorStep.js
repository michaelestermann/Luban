import { test } from 'tape';
import { getEditorStep, getStepIndex, EDITOR_STEPS } from '../src/app/ui/pages/CncLaserShared/editor-step';

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
