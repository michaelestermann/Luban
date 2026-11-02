/**
 * Scene toasts open at the top centre of the window, where the floating bars of the laser / CNC canvas
 * (selection bar, point edit bar, measure bar) sit. While such a bar is shown the toasts move below it
 * (class on <body>, see styles/vendor.styl), so a toast never covers the bar's buttons (e.g. the origin
 * split button right after "Origin set on …").
 */
export const TOAST_CLEARANCE_CLASS = 'toasts-below-canvas-bar';

interface ClassTarget {
    classList: { add: (name: string) => void; remove: (name: string) => void };
}

export function createToastClearance(getTarget: () => ClassTarget | null) {
    let count = 0;
    return {
        /** A bar is shown; call the returned function when it is gone. */
        claim(): () => void {
            count++;
            getTarget()?.classList.add(TOAST_CLEARANCE_CLASS);
            let released = false;
            return () => {
                if (released) {
                    return;
                }
                released = true;
                count--;
                if (count <= 0) {
                    count = 0;
                    getTarget()?.classList.remove(TOAST_CLEARANCE_CLASS);
                }
            };
        },
    };
}

export const toastClearance = createToastClearance(() => (typeof document === 'undefined' ? null : document.body));
