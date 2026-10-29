/**
 * Show a BrowserWindow once its content is ready, but never leave it
 * invisible: if the page fails to load, or neither event fires within
 * `fallbackDelay` ms, show the window anyway so failures are visible
 * instead of the app appearing dead.
 */
const installShowOnReady = (window, { fallbackDelay = 5000 } = {}) => {
    let shown = false;

    const showOnce = () => {
        if (shown || window.isDestroyed()) {
            return;
        }
        shown = true;
        window.show();
    };

    const timer = setTimeout(showOnce, fallbackDelay);

    const showAndClearTimer = () => {
        clearTimeout(timer);
        showOnce();
    };

    window.on('ready-to-show', showAndClearTimer);
    window.webContents.on('did-fail-load', showAndClearTimer);
};

export default installShowOnReady;
