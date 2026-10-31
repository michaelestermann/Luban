import express from 'express';
import http from 'http';
import { test } from 'tape';
import { createErrorHandler, notFound } from '../src/server/lib/middleware/error-handlers';

const silentLog = { errors: [], error(e) { this.errors.push(e); } };

const request = (app, path) => new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
        http.get({ host: '127.0.0.1', port: server.address().port, path }, (res) => {
            let body = '';
            res.on('data', (d) => { body += d; });
            res.on('end', () => { server.close(); resolve({ status: res.statusCode, body }); });
        }).on('error', reject);
    });
});

const createApp = () => {
    const app = express();
    app.get('/ok', (req, res) => res.send('ok'));
    app.get('/fail', () => { throw new Error('boom'); });
    app.get('/bad', (req, res, next) => next(Object.assign(new Error('bad input'), { status: 400 })));
    app.use(notFound);
    app.use(createErrorHandler(silentLog));
    return app;
};

test('server error handlers answer unknown paths with a JSON 404', async (t) => {
    const res = await request(createApp(), '/data/Tmp/missing.svg');
    t.equal(res.status, 404, 'status 404');
    t.deepEqual(JSON.parse(res.body), { msg: 'Not found' }, 'json body, no TypeError page');
    t.end();
});

test('server error handlers answer thrown errors with a JSON 500 and log them', async (t) => {
    const res = await request(createApp(), '/fail');
    t.equal(res.status, 500, 'status 500');
    t.deepEqual(JSON.parse(res.body), { error: 'boom' }, 'error message in body');
    t.ok(silentLog.errors.some((e) => e.message === 'boom'), 'error is logged');
    t.end();
});

test('server error handlers keep a 4xx status of the error', async (t) => {
    const res = await request(createApp(), '/bad');
    t.equal(res.status, 400, 'status 400');
    const ok = await request(createApp(), '/ok');
    t.equal(ok.body, 'ok', 'normal routes are untouched');
    t.end();
});

test('server error handlers leave a response that was already sent alone', (t) => {
    const calls = [];
    const res = { headersSent: true, status: () => { calls.push('status'); return res; }, send: () => calls.push('send') };
    let forwarded = null;
    const err = new Error('late');
    createErrorHandler(silentLog)(err, {}, res, (e) => { forwarded = e; });
    t.deepEqual(calls, [], 'no second status or body');
    t.equal(forwarded, err, 'error goes on to express, which closes the connection');
    t.end();
});
