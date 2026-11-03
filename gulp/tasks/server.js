import gulp from 'gulp';
import nodemon from 'gulp-nodemon';
import log from 'fancy-log';
import PluginError from 'plugin-error';
import webpack from 'webpack';

//
// Development Copy
//
export function serverCopyDevelopment() {
    const files = ['src/server/{i18n,views}/**/*'];
    return gulp
        .src(files, { base: 'src/server' })
        .pipe(gulp.dest('output/src/server'));
}

//
// Development Build
//
export function serverBuildDevelopment(cb) {
    const exec = require('child_process').exec;
    // Build TypeScript server code and transpile Electron main process files for development
    const child = exec('npm run build:server && npm run build:main && npm run build:server-worker', cb);
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
}

//
// Development Start
//
export function serverStartDevelopment(cb) {
    const args = (process.env.ARGS && process.env.ARGS.split(' ')) || [];

    nodemon({
        restartable: 'rs',
        script: './output/src/main',
        // script: './bin/cli',
        args: args,
        ignore: ['.git', 'node_modules/**/node_modules', 'output/src/app/**'],
        delay: 8000,
        verbose: true,
        exec: 'electron --inspect --trace-warnings',
        // exec: 'electron --inspect-brk',
        execMap: {
            js: 'node --harmony',
        },
        watch: [
            'output/src/',
        ],
        env: {
            NODE_ENV: 'development',
        },
        ext: 'js json ts',
        done: cb,
        stdout: false,
    })
        .once('quit', (code) => {
            log('nodedmon has quit with code', code);
            process.exit(code || 0);
        })
        .on('restart', (files) => {
            log('App restarted due to: ', files);
        })
        .on('readable', function handleReadable() {
            this.stdout.pipe(process.stdout);
            this.stderr.pipe(process.stderr);
        });
}

//
// Production Copy
//
export function serverCopyProduction() {
    const files = ['src/server/{i18n,views}/**/*'];

    return gulp
        .src(files, { base: 'src/server' })
        .pipe(gulp.dest('dist/Luban/src/server'));
}

//
// Production Build
//
export function serverBuildProduction() {
    return new Promise((resolve, reject) => {
        const webpackConfig = require('../../webpack.config.server.production');
        webpack(webpackConfig, (err, stats) => {
            if (err) {
                reject(new PluginError('server:build', err));
                return;
            }
            log('[server:build]', stats.toString({ colors: true }));
            if (stats.hasErrors()) {
                reject(new PluginError('server:build', 'Webpack compilation failed'));
                return;
            }
            resolve();
        });
    });
}
