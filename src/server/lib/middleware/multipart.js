import multiparty from 'multiparty';
import onFinished from 'on-finished';
import qs from 'qs';
import typeis from 'type-is';

/**
 * Parses multipart/form-data request bodies into `req.body` (fields) and `req.files` (uploaded files).
 *
 * Drop-in replacement for the unmaintained `connect-multiparty` package, built directly on `multiparty`.
 * Behaves the same way: uploaded files are written to the temp directory (or `options.uploadDir`),
 * every file gets `name` (original file name) and `type` (content type), repeated field names become arrays,
 * and dotted names are expanded with `qs` (`a.b` -> `{ a: { b } }`).
 *
 * @param {Object} options passed on to `new multiparty.Form(options)` (e.g. maxFieldsSize, maxFields, uploadDir)
 */
export default function multipart(options = {}) {
    return function multipartMiddleware(req, res, next) {
        if (req._body) {
            next();
            return;
        }
        req.body = req.body || {};
        req.files = req.files || {};

        if (req.method === 'GET' || req.method === 'HEAD') {
            next();
            return;
        }
        if (!typeis(req, 'multipart/form-data')) {
            next();
            return;
        }

        // flag as parsed
        req._body = true;

        const form = new multiparty.Form(options);
        // null-prototype objects, so a field named __proto__ cannot reach Object.prototype
        const fields = Object.create(null);
        const files = Object.create(null);
        let done = false;

        const add = (target, name, value) => {
            if (Array.isArray(target[name])) {
                target[name].push(value);
            } else if (Object.prototype.hasOwnProperty.call(target, name)) {
                target[name] = [target[name], value];
            } else {
                target[name] = value;
            }
        };

        form.on('field', (name, value) => {
            add(fields, name, value);
        });

        form.on('file', (name, file) => {
            file.name = file.originalFilename;
            file.type = file.headers['content-type'] || null;
            add(files, name, file);
        });

        form.on('error', (err) => {
            if (done) {
                return;
            }
            done = true;

            const error = err instanceof Error ? err : new Error(String(err));
            error.status = 400;
            error.statusCode = 400;
            error.expose = true;

            if (!req.readable) {
                next(error);
                return;
            }
            // read off the rest of the request before answering
            req.resume();
            onFinished(req, () => next(error));
        });

        form.on('close', () => {
            if (done) {
                return;
            }
            done = true;

            req.body = qs.parse(fields, { allowDots: true });
            req.files = qs.parse(files, { allowDots: true });
            next();
        });

        form.parse(req);
    };
}
