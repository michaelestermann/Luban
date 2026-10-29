import { EventEmitter } from 'events';
import { test } from 'tape';
import installShowOnReady from '../src/electron-app/window-show-fallback';

class FakeWindow extends EventEmitter {
    constructor() {
        super();
        this.showCount = 0;
        this.destroyed = false;
        this.webContents = new EventEmitter();
    }

    show() {
        this.showCount++;
    }

    isDestroyed() {
        return this.destroyed;
    }
}

test('shows the window on ready-to-show', (t) => {
    const window = new FakeWindow();
    installShowOnReady(window, { fallbackDelay: 1000 });

    window.emit('ready-to-show');

    t.equal(window.showCount, 1, 'window shown once');
    t.end();
});

test('shows the window when the page fails to load', (t) => {
    const window = new FakeWindow();
    installShowOnReady(window, { fallbackDelay: 1000 });

    window.webContents.emit('did-fail-load');

    t.equal(window.showCount, 1, 'window shown so failure is visible');
    t.end();
});

test('shows the window after the fallback delay if no event fires', (t) => {
    const window = new FakeWindow();
    installShowOnReady(window, { fallbackDelay: 20 });

    setTimeout(() => {
        t.equal(window.showCount, 1, 'window shown by fallback timer');
        t.end();
    }, 60);
});

test('shows the window only once across multiple triggers', (t) => {
    const window = new FakeWindow();
    installShowOnReady(window, { fallbackDelay: 20 });

    window.emit('ready-to-show');
    window.webContents.emit('did-fail-load');
    window.emit('ready-to-show');

    setTimeout(() => {
        t.equal(window.showCount, 1, 'no duplicate show calls');
        t.end();
    }, 60);
});

test('does not show a destroyed window', (t) => {
    const window = new FakeWindow();
    installShowOnReady(window, { fallbackDelay: 20 });

    window.destroyed = true;

    setTimeout(() => {
        t.equal(window.showCount, 0, 'destroyed window left alone');
        t.end();
    }, 60);
});
