import { test } from 'tape';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { migrateEnvDir, recoverEnvDir, replaceDir } from '../src/server/lib/env-swap';

const ID = '3b241101-e2bb-4255-8caf-4136c566a962';

const tmpBase = () => fs.mkdtempSync(path.join(os.tmpdir(), 'luban-env-swap-'));
const read = (p) => fs.readFileSync(p, 'utf8');
const writeOld = (dir) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), '{"old":true}');
    fs.writeFileSync(path.join(dir, 'model.stl'), 'old model');
};

test('replaceDir: an interrupted write keeps the old auto-save (final review I-5)', async (t) => {
    const base = tmpBase();
    const dir = path.join(base, 'docs', ID);
    writeOld(dir);
    try {
        await replaceDir(dir, (staging) => {
            fs.writeFileSync(path.join(staging, 'model.stl'), 'new model');
            throw new Error('killed half-way');
        });
        t.fail('the failed fill must reject');
    } catch (e) {
        t.ok(/killed half-way/.test(String(e)), 'the failure is passed on');
    }
    t.equal(read(path.join(dir, 'config.json')), '{"old":true}', 'old config.json is still there');
    t.equal(read(path.join(dir, 'model.stl')), 'old model', 'old model file is still there');
    t.deepEqual(fs.readdirSync(path.join(base, 'docs')), [ID], 'no staging folder is left');
    t.end();
});

test('replaceDir: a finished write replaces the folder completely', async (t) => {
    const base = tmpBase();
    const dir = path.join(base, 'docs', ID);
    writeOld(dir);
    await replaceDir(dir, (staging) => {
        fs.writeFileSync(path.join(staging, 'other.stl'), 'new model');
        fs.writeFileSync(path.join(staging, 'config.json'), '{"new":true}');
    });
    t.equal(read(path.join(dir, 'config.json')), '{"new":true}', 'new config.json');
    t.notOk(fs.existsSync(path.join(dir, 'model.stl')), 'old files are gone');
    t.deepEqual(fs.readdirSync(path.join(base, 'docs')), [ID], 'nothing else is left');
    // first write of a new document
    const fresh = path.join(base, 'docs', 'fresh');
    await replaceDir(fresh, (staging) => fs.writeFileSync(path.join(staging, 'config.json'), '{}'));
    t.ok(fs.existsSync(path.join(fresh, 'config.json')), 'a new folder is created');
    t.end();
});

test('recoverEnvDir: a swap cut off between its two renames is repaired at the next read', (t) => {
    const base = tmpBase();
    const dir = path.join(base, 'docs', ID);
    // the old folder was moved aside, the staging folder was not renamed yet
    writeOld(`${dir}.previous`);
    fs.mkdirSync(`${dir}.writing`);
    fs.writeFileSync(path.join(`${dir}.writing`, 'config.json'), '{"new":true}');
    recoverEnvDir(dir);
    t.equal(read(path.join(dir, 'config.json')), '{"old":true}', 'the old, complete auto-save is back');
    t.deepEqual(fs.readdirSync(path.join(base, 'docs')), [ID], 'leftovers are removed');
    // only a staging folder of a first write (no old one): kept when it is complete
    const other = path.join(base, 'docs', 'b');
    fs.mkdirSync(`${other}.writing`);
    fs.writeFileSync(path.join(`${other}.writing`, 'config.json'), '{}');
    recoverEnvDir(other);
    t.ok(fs.existsSync(path.join(other, 'config.json')), 'a complete first write is kept');
    // the swap was done, only the backup was not removed
    writeOld(`${other}.previous`);
    recoverEnvDir(other);
    t.equal(read(path.join(other, 'config.json')), '{}', 'the newer folder stays');
    t.notOk(fs.existsSync(`${other}.previous`), 'the stale backup is removed');
    t.end();
});

test('migrateEnvDir: a 4.16 auto-save is copied into its document folder before env/{head} is emptied (final review I-3)', async (t) => {
    const base = tmpBase();
    const legacy = path.join(base, 'cnc');
    writeOld(legacy);
    const docDir = path.join(base, 'docs', ID);
    t.equal(await migrateEnvDir(legacy, docDir), true, 'migrated');
    t.equal(read(path.join(docDir, 'config.json')), '{"old":true}', 'config.json copied');
    t.equal(read(path.join(docDir, 'model.stl')), 'old model', 'resource files copied');
    t.ok(fs.existsSync(legacy), 'env/{head} stays (4.16 keeps the folder)');
    t.deepEqual(fs.readdirSync(legacy), [], 'env/{head} is emptied');
    t.equal(await migrateEnvDir(legacy, path.join(base, 'docs', 'x')), false, 'nothing to migrate without config.json');
    t.notOk(fs.existsSync(path.join(base, 'docs', 'x')), 'no empty document folder');
    t.end();
});
