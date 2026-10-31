import { test } from 'tape';
import { panelKeysActive } from '../src/app/ui/widgets/CncLaserShared/panel-keys';

test('panelKeysActive: Offset / Array keys only in the plain select mode', (t) => {
    t.equal(panelKeysActive(true, 'select', false), true, 'panel open, select mode');
    t.equal(panelKeysActive(false, 'select', false), false, 'panel closed');
    t.equal(panelKeysActive(true, 'measure', false), false, 'measure tool on: its Esc wins');
    t.equal(panelKeysActive(true, 'select', true), false, 'point editing: its Esc / Enter win');
    t.equal(panelKeysActive(true, 'draw', false), false, 'drawing');
    t.end();
});
