/**
 * Keyboard handling of open confirm dialogs (components/Modal and dialogs
 * that register themselves):
 *
 * - Enter runs the default (primary) action, Esc cancels;
 * - while a dialog is open no key reaches what is behind it (canvas,
 *   selection bar, shortcut manager).
 *
 * The pure decision is `modalKeyAction`; `installModalKeyboard` adds one
 * window capture listener (installed before the pages register theirs, so it
 * runs first) that applies it to the topmost open dialog.
 */

export type ModalKeyAction = 'confirm' | 'cancel' | 'block' | 'pass';

export interface ModalKeyEvent {
    key: string;
    isComposing?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
}

export interface ModalKeyTarget {
    /** the event target is inside the dialog */
    inside: boolean;
    /** tag name of the target (upper case, as in the DOM) */
    tagName?: string;
    /** type attribute of an <input> */
    inputType?: string | null;
    isContentEditable?: boolean;
    /** the target controls an open popup (aria-expanded="true", e.g. an open select) */
    expanded?: boolean;
}

// Inputs where Enter is not text editing: Enter runs the default action there too.
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'range', 'color']);

/** Whether the focused element handles Enter itself (a button clicks, a text field commits or breaks a line). */
function handlesEnterItself(target: ModalKeyTarget): boolean {
    const tag = (target.tagName || '').toUpperCase();
    if (target.isContentEditable || tag === 'BUTTON' || tag === 'A' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return true;
    }
    if (tag === 'INPUT') {
        return !NON_TEXT_INPUTS.has((target.inputType || 'text').toLowerCase());
    }
    return false;
}

/**
 * What a key press does while a dialog is open:
 * - 'confirm': run the default action (Enter, unless the focused element in the dialog handles Enter itself:
 *   a focused button is clicked by the browser, a text field keeps its Enter);
 * - 'cancel': close the dialog (Esc, unless it closes an open popup inside the dialog);
 * - 'pass': the key goes to the element in the dialog (typing, Tab, arrows, …);
 * - 'block': the key is dropped (it was aimed at something behind the dialog).
 */
export function modalKeyAction(event: ModalKeyEvent, target: ModalKeyTarget): ModalKeyAction {
    const plain = !event.ctrlKey && !event.altKey && !event.metaKey;
    if (event.isComposing) {
        return target.inside ? 'pass' : 'block';
    }
    if (event.key === 'Escape' && plain) {
        return target.inside && target.expanded ? 'pass' : 'cancel';
    }
    if (event.key === 'Enter' && plain && !event.shiftKey) {
        if (target.inside && (target.expanded || handlesEnterItself(target))) {
            return 'pass';
        }
        return 'confirm';
    }
    return target.inside ? 'pass' : 'block';
}

/** Keys that are never dropped (F1–F12: dev tools, reload in development). */
export function isUntouchableKey(key: string): boolean {
    return /^F\d{1,2}$/.test(key);
}

// --- registry of open dialogs ----------------------------------------------

export interface OpenModal {
    /** root element of the dialog (everything inside belongs to it) */
    element: () => HTMLElement | null;
    /** default action; when missing the primary button of the dialog is clicked */
    confirm?: () => void;
    cancel?: () => void;
}

const openModals: OpenModal[] = [];

/** Registers an open dialog (it becomes the topmost one). Returns the function that unregisters it. */
export function pushModal(modal: OpenModal): () => void {
    openModals.push(modal);
    return () => {
        const index = openModals.indexOf(modal);
        if (index !== -1) {
            openModals.splice(index, 1);
        }
    };
}

export function isModalOpen(): boolean {
    return openModals.length > 0;
}

export function topModal(): OpenModal | null {
    return openModals.length ? openModals[openModals.length - 1] : null;
}

/**
 * Index of the default button among the buttons of a dialog footer: the last enabled primary one (Luban puts
 * it right-most); a footer with one single button (an info dialog's "Close" / "OK") has that one;
 * otherwise none (-1), Enter then does nothing (a disabled primary never falls back to Cancel).
 */
export function defaultButtonIndex(buttons: Array<{ primary: boolean; disabled: boolean }>): number {
    for (let i = buttons.length - 1; i >= 0; i--) {
        if (buttons[i].primary && !buttons[i].disabled) {
            return i;
        }
    }
    return buttons.length === 1 && !buttons[0].primary && !buttons[0].disabled ? 0 : -1;
}

/** The default button of a dialog (see `defaultButtonIndex`); `data-modal-default` marks one explicitly. */
export function findDefaultButton(root: HTMLElement | null): HTMLElement | null {
    if (!root) {
        return null;
    }
    const marked = root.querySelector<HTMLElement>('[data-modal-default]:not([disabled])');
    if (marked) {
        return marked;
    }
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('.ant-modal-footer button'));
    const index = defaultButtonIndex(buttons.map((b) => ({ primary: b.classList.contains('ant-btn-primary'), disabled: b.disabled })));
    return index === -1 ? null : buttons[index];
}

/** Focuses the default button of a dialog unless the focus is already on a field inside it. */
export function focusDefaultButton(root: HTMLElement | null): boolean {
    if (!root) {
        return false;
    }
    const active = document.activeElement as HTMLElement | null;
    if (active && root.contains(active) && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(active.tagName)) {
        return true;
    }
    const button = findDefaultButton(root);
    if (!button) {
        return false;
    }
    button.focus();
    return document.activeElement === button;
}

function runConfirm(modal: OpenModal): void {
    if (modal.confirm) {
        modal.confirm();
        return;
    }
    findDefaultButton(modal.element())?.click();
}

let installed = false;

/** Installs the window/body listeners once (browser only). */
export function installModalKeyboard(): void {
    if (installed || typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }
    installed = true;
    // keys pressed while a dialog was open: their keyup is dropped too, also when the dialog closed on keydown
    const pressedInDialog = new Set<string>();
    const swallow = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopImmediatePropagation();
    };

    // capture on window: runs before every other key listener of the page
    const onKey = (e: KeyboardEvent) => {
        if (isUntouchableKey(e.key)) {
            return;
        }
        const modal = topModal();
        if (!modal) {
            if (e.type === 'keyup' && pressedInDialog.delete(e.key)) {
                swallow(e);
            }
            return;
        }
        if (e.type === 'keydown') {
            pressedInDialog.add(e.key);
        } else {
            pressedInDialog.delete(e.key);
        }
        const root = modal.element();
        const target = e.target as HTMLElement | null;
        const inside = !!(root && target && root.contains(target));
        const action = modalKeyAction(e, {
            inside,
            tagName: target?.tagName,
            inputType: target?.getAttribute?.('type'),
            isContentEditable: !!target?.isContentEditable,
            expanded: target?.getAttribute?.('aria-expanded') === 'true',
        });
        if (action === 'pass') {
            return;
        }
        swallow(e);
        if (e.type !== 'keydown' || e.repeat) {
            return;
        }
        if (action === 'confirm') {
            runConfirm(modal);
        } else if (action === 'cancel') {
            modal.cancel?.();
        }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);

    // bubble on body: a key handled inside the dialog (its fields and buttons got it) stops here, so it never
    // reaches the listeners of the page on document / window (shortcut manager, canvas)
    const stopAtBody = (e: KeyboardEvent) => {
        const modal = topModal();
        const root = modal?.element();
        if (root && e.target instanceof Node && root.contains(e.target)) {
            e.stopPropagation();
        }
    };
    const listenOnBody = () => {
        document.body.addEventListener('keydown', stopAtBody);
        document.body.addEventListener('keyup', stopAtBody);
        document.body.addEventListener('keypress', stopAtBody);
    };
    if (document.body) {
        listenOnBody();
    } else {
        document.addEventListener('DOMContentLoaded', listenOnBody, { once: true });
    }
}
