import { test } from 'tape';
import { isWorkerStartFailure, WORKER_START_TIMEOUT } from '../src/app/lib/manager/worker-task';

test('a worker that never sent its init message is a start failure (the pool is broken)', (t) => {
    t.ok(isWorkerStartFailure(new Error('Timeout: Did not receive an init message from worker after 10000ms. Make sure the worker calls expose().')));
    t.ok(isWorkerStartFailure(new Error('Worker exited before initialization')), 'exited worker');
    t.notOk(isWorkerStartFailure(new Error('Failed to load toolpath file x.json')), 'a failing job is not a start failure');
    t.notOk(isWorkerStartFailure(undefined));
    t.end();
});

test('workers get far more than 10 s to start (a 1.8 MB worker script can load slowly)', (t) => {
    t.ok(WORKER_START_TIMEOUT >= 60000);
    t.end();
});
