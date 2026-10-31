import { test } from 'tape';
import { checkIsGCodeFile, checkIsSnapmakerProjectFile } from '../src/app/lib/check-name';

test('project files are recognised by extension, ignoring case', (t) => {
    t.ok(checkIsSnapmakerProjectFile('pcb.snapcnc'));
    t.ok(checkIsSnapmakerProjectFile('ruler.snaplzr'));
    t.ok(checkIsSnapmakerProjectFile('pen.snap3dp'));
    t.ok(checkIsSnapmakerProjectFile('PCB.SNAPCNC'), 'upper case');
    t.ok(checkIsSnapmakerProjectFile('Ruler.SnapLzr'), 'mixed case');
    t.ok(checkIsSnapmakerProjectFile('C:/Users/x/PEN.SNAP3DP'), 'path');
    t.notOk(checkIsSnapmakerProjectFile('pcb.snapcnc.bak'));
    t.notOk(checkIsSnapmakerProjectFile('pcb.gcode'));
    t.end();
});

test('G-code files are recognised by extension, ignoring case', (t) => {
    t.ok(checkIsGCodeFile('a.gcode'));
    t.ok(checkIsGCodeFile('a.nc'));
    t.ok(checkIsGCodeFile('a.cnc'));
    t.ok(checkIsGCodeFile('A.GCODE'), 'upper case');
    t.ok(checkIsGCodeFile('a.NC'), 'upper case nc');
    t.notOk(checkIsGCodeFile('a.snapcnc'));
    t.notOk(checkIsGCodeFile('a.gcode.txt'));
    t.end();
});
