import { test } from 'tape';
import { appendPendingFiles, projectPathsFromArgv } from '../src/electron-app/argv-files';

test('projectPathsFromArgv keeps project and G-code paths only', (t) => {
    const argv = [
        'C:\\Program Files\\Snapmaker Luban\\Snapmaker Luban.exe',
        '--allow-file-access-from-files',
        '--remote-debugging-port=9222',
        'D:\\Work\\pcb-a.snapcnc',
        '.',
        'output/main.js',
        'D:\\Work\\Ruler.SNAPLZR',
        'D:\\Work\\vase.snap3dp',
        'D:\\Work\\job.gcode',
        'D:\\Work\\cut.nc',
        'D:\\Work\\mill.cnc',
        'D:\\Work\\image.png',
        '--flag=D:\\Work\\hidden.snapcnc',
    ];
    t.deepEqual(projectPathsFromArgv(argv), [
        'D:\\Work\\pcb-a.snapcnc',
        'D:\\Work\\Ruler.SNAPLZR',
        'D:\\Work\\vase.snap3dp',
        'D:\\Work\\job.gcode',
        'D:\\Work\\cut.nc',
        'D:\\Work\\mill.cnc',
    ]);
    t.deepEqual(projectPathsFromArgv(['Luban.exe']), [], 'only the exe: nothing');
    t.deepEqual(projectPathsFromArgv(['Luban.exe', 'a.snapcnc', 'a.snapcnc']), ['a.snapcnc'], 'duplicates once');
    t.deepEqual(projectPathsFromArgv(undefined), [], 'no argv');
    t.end();
});

test('appendPendingFiles collects files that arrive before the window is ready', (t) => {
    const a = { name: 'a.snapcnc', path: '/x/a.snapcnc' };
    const b = { name: 'b.snaplzr', path: '/x/b.snaplzr' };
    t.deepEqual(appendPendingFiles(null, [a]), [a], 'nothing pending');
    t.deepEqual(appendPendingFiles(a, [b]), [a, b], 'a single 4.16 entry is kept');
    t.deepEqual(appendPendingFiles([a], [b, a]), [a, b], 'same path once');
    t.end();
});
