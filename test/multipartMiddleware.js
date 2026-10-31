import fs from 'fs';
import http from 'http';
import { test } from 'tape';
import multipart from '../src/server/lib/middleware/multipart';

const BOUNDARY = '----lubantestboundary';

const multipartBody = (parts) => {
    const chunks = parts.map((p) => {
        const disposition = p.filename
            ? `form-data; name="${p.name}"; filename="${p.filename}"`
            : `form-data; name="${p.name}"`;
        const type = p.contentType ? `\r\nContent-Type: ${p.contentType}` : '';
        return `--${BOUNDARY}\r\nContent-Disposition: ${disposition}${type}\r\n\r\n${p.value}\r\n`;
    });
    return `${chunks.join('')}--${BOUNDARY}--\r\n`;
};

// Runs the middleware on a real HTTP request and resolves with what it produced
const run = (options, { method = 'POST', headers = {}, body = '' }) => new Promise((resolve, reject) => {
    const middleware = multipart(options);
    const server = http.createServer((req, res) => {
        middleware(req, res, (err) => {
            resolve({ err, body: req.body, files: req.files });
            res.end();
            server.close();
        });
    });
    server.listen(0, '127.0.0.1', () => {
        const req = http.request({ host: '127.0.0.1', port: server.address().port, method, headers });
        req.on('error', reject);
        req.on('response', (res) => res.resume());
        req.end(body);
    });
});

const removeUploads = (files) => {
    Object.values(files).flat().forEach((f) => f && f.path && fs.rmSync(f.path, { force: true }));
};

test('multipart parses fields and files into req.body and req.files', async (t) => {
    const body = multipartBody([
        { name: 'headType', value: 'cnc' },
        { name: 'tag', value: 'a' },
        { name: 'tag', value: 'b' },
        { name: 'opt.depth', value: '2' },
        { name: 'file', filename: 'shape.svg', contentType: 'image/svg+xml', value: '<svg></svg>' },
    ]);
    const { err, body: fields, files } = await run({}, {
        headers: { 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}`, 'Content-Length': Buffer.byteLength(body) },
        body,
    });

    t.equal(err, undefined, 'no error');
    t.equal(fields.headType, 'cnc', 'single field');
    t.deepEqual(fields.tag, ['a', 'b'], 'repeated field becomes an array');
    t.deepEqual(fields.opt, { depth: '2' }, 'dotted field names are expanded');
    t.equal(files.file.name, 'shape.svg', 'file gets the original name');
    t.equal(files.file.originalFilename, 'shape.svg', 'multiparty fields are kept');
    t.equal(files.file.type, 'image/svg+xml', 'file gets the content type');
    t.equal(fs.readFileSync(files.file.path, 'utf8'), '<svg></svg>', 'file content is written to disk');
    removeUploads(files);
    t.end();
});

test('multipart ignores a __proto__ field name', async (t) => {
    const body = multipartBody([{ name: '__proto__', value: 'x' }, { name: 'ok', value: '1' }]);
    const { err, body: fields } = await run({}, {
        headers: { 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}`, 'Content-Length': Buffer.byteLength(body) },
        body,
    });

    t.equal(err, undefined, 'no error');
    t.equal(fields.ok, '1', 'other fields are parsed');
    t.equal(Object.getPrototypeOf(fields), Object.prototype, 'prototype is untouched');
    t.equal({}.x, undefined, 'Object.prototype is not polluted');
    t.end();
});

test('multipart passes non-multipart and GET requests through untouched', async (t) => {
    const json = await run({}, { headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' });
    t.equal(json.err, undefined, 'no error for json');
    t.deepEqual(json.body, {}, 'json body is left to the json parser');
    t.deepEqual(json.files, {}, 'no files');

    const get = await run({}, { method: 'GET' });
    t.equal(get.err, undefined, 'no error for GET');
    t.deepEqual(get.files, {}, 'no files for GET');
    t.end();
});

test('multipart reports a 400 error when a limit is exceeded', async (t) => {
    const body = multipartBody([{ name: 'a', value: '1' }, { name: 'b', value: '2' }, { name: 'c', value: '3' }]);
    const { err } = await run({ maxFields: 2 }, {
        headers: { 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}`, 'Content-Length': Buffer.byteLength(body) },
        body,
    });

    t.ok(err instanceof Error, 'next is called with an error');
    t.equal(err && err.status, 400, 'error has status 400');
    t.end();
});
