import { test } from 'tape';
import optionsFallthrough from '../src/server/lib/middleware/options-fallthrough';

const createRes = () => {
    const res = {
        statusCode: null,
        sendStatus: (code) => {
            res.statusCode = code;
        }
    };
    return res;
};

test('optionsFallthrough answers OPTIONS requests with 200', (t) => {
    const res = createRes();
    let nextCalled = false;

    optionsFallthrough({ method: 'OPTIONS' }, res, () => {
        nextCalled = true;
    });

    t.equal(res.statusCode, 200, 'responds 200 to OPTIONS');
    t.false(nextCalled, 'does not call next after responding');
    t.end();
});

test('optionsFallthrough passes non-OPTIONS requests to next middleware', (t) => {
    const res = createRes();
    let nextCalled = false;

    optionsFallthrough({ method: 'GET' }, res, () => {
        nextCalled = true;
    });

    t.equal(res.statusCode, null, 'does not respond to GET');
    t.true(nextCalled, 'calls next so the request does not hang');
    t.end();
});
