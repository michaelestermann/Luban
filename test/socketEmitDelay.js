import test from 'tape';
import { emitDelay } from '../src/app/lib/socket-emit-delay';

test('socket emit delay: background tasks are committed at once', (t) => {
    t.equal(emitDelay('taskCommit:generateToolPath'), 0, 'toolpaths');
    t.equal(emitDelay('taskCommit:generateGcode'), 0, 'G-code');
    t.equal(emitDelay('taskCommit:processImage'), 0, 'image processing');
    t.equal(emitDelay('taskCancel:cutModel'), 0, 'cancel');
    t.end();
});

test('socket emit delay: other events keep the 200 ms delay', (t) => {
    t.equal(emitDelay('writeln'), 200, 'machine commands');
    t.equal(emitDelay('connection:open'), 200, 'connections');
    t.end();
});
