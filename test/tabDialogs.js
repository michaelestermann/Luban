import { test } from 'tape';
import {
    currentDialogRequest,
    requestQuitSelection,
    requestSaveChanges,
    subscribeDialogRequests,
} from '../src/app/lib/tab-dialogs';
import { saveAsPromise } from '../src/app/lib/save-as-result';

test('requestSaveChanges resolves with the host answer', async (t) => {
    const seen = [];
    const unsubscribe = subscribeDialogRequests((req) => {
        seen.push(req ? `${req.kind}:${req.name}` : null);
        if (req && req.kind === 'save-changes') {
            setTimeout(() => req.respond('discard'), 0);
        }
    });
    const answer = await requestSaveChanges('pcb-a.snapcnc');
    t.equal(answer, 'discard', 'answer of the host');
    t.deepEqual(seen, [null, 'save-changes:pcb-a.snapcnc', null], 'listener sees no request, the request, then none');
    t.equal(currentDialogRequest(), null, 'nothing pending');
    unsubscribe();
    t.end();
});

test('a second request waits until the first is answered', async (t) => {
    const order = [];
    const first = requestSaveChanges('a');
    const second = requestQuitSelection([{ id: 'x', name: 'x.snapcnc', headType: 'cnc' }]);
    first.then((a) => order.push(`first:${a}`));
    second.then((a) => order.push(`second:${a.action}:${a.ids.join(',')}`));
    const req1 = currentDialogRequest();
    t.equal(req1.kind, 'save-changes', 'first request shown first');
    t.equal(req1.name, 'a');
    req1.respond('cancel');
    req1.respond('save'); // a second answer is ignored
    await first;
    const req2 = currentDialogRequest();
    t.equal(req2.kind, 'quit-selection', 'then the second');
    t.deepEqual(req2.docs.map((d) => d.id), ['x']);
    req2.respond({ action: 'save', ids: ['x'] });
    await second;
    t.deepEqual(order, ['first:cancel', 'second:save:x'], 'answered in order');
    t.equal(currentDialogRequest(), null, 'queue empty');
    t.end();
});

test('saveAs cancel resolves false', async (t) => {
    const cancelled = await saveAsPromise((cb) => cb('cancel'));
    t.equal(cancelled.saved, false, 'cancel: not saved');
    const failed = await saveAsPromise(() => { throw new Error('disk full'); });
    t.equal(failed.saved, false, 'error: not saved');
    const done = await saveAsPromise((cb) => cb('electron', 'C:/x/a.snapcnc', { name: 'a.snapcnc', path: 'C:/x/a.snapcnc' }));
    t.equal(done.saved, true, 'saved');
    t.equal(done.file.name, 'a.snapcnc', 'file of the dialog');
    t.end();
});

test('requestSaveChanges tells the dialog whether it asks for a close or a quit', async (t) => {
    const closing = requestSaveChanges('a.snapcnc');
    const closeReq = currentDialogRequest();
    t.equal(closeReq.context, 'close', 'default context is close');
    closeReq.respond('cancel');
    await closing;
    const quitting = requestSaveChanges('b.snapcnc', 'quit');
    const quitReq = currentDialogRequest();
    t.equal(quitReq.context, 'quit', 'quit context passed to the dialog');
    quitReq.respond('discard');
    t.equal(await quitting, 'discard');
    t.end();
});
