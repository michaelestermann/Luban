import { test } from 'tape';
import { isActionForOtherHead } from '../src/app/flux/head-type-action';

test('isActionForOtherHead: the laser reducer skips updates meant for CNC', (t) => {
    t.equal(isActionForOtherHead({ type: 'ACTION_UPDATE_STATE', headType: 'cnc' }, 'laser'), true, 'CNC update is for another head');
    t.equal(isActionForOtherHead({ type: 'ACTION_UPDATE_STATE', headType: 'laser' }, 'laser'), false, 'laser update is for the laser');
    t.equal(isActionForOtherHead({ type: 'ACTION_UPDATE_STATE' }, 'laser'), false, 'laser-only action without headType applies');
    t.end();
});
