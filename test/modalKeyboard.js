import test from 'tape';
import { defaultButtonIndex, isModalOpen, isUntouchableKey, modalKeyAction, pushModal, topModal } from '../src/app/lib/modal-keyboard';

const outside = { inside: false, tagName: 'CANVAS' };
const onDialog = { inside: true, tagName: 'DIV' };

test('modalKeyboard: Enter runs the default action', (t) => {
    t.equal(modalKeyAction({ key: 'Enter' }, outside), 'confirm', 'focus still behind the dialog (canvas, selection bar button)');
    t.equal(modalKeyAction({ key: 'Enter' }, onDialog), 'confirm', 'focus on the dialog itself');
    t.equal(modalKeyAction({ key: 'Enter' }, { inside: false, tagName: 'BUTTON' }), 'confirm', 'a button behind the dialog is not clicked');
    t.equal(modalKeyAction({ key: 'Enter' }, { inside: true, tagName: 'INPUT', inputType: 'checkbox' }), 'confirm', 'checkbox in the dialog');
    t.end();
});

test('modalKeyboard: Enter on an element of the dialog that handles Enter itself passes', (t) => {
    t.equal(modalKeyAction({ key: 'Enter' }, { inside: true, tagName: 'BUTTON' }), 'pass', 'focused button: the browser clicks it (the default button has the focus)');
    t.equal(modalKeyAction({ key: 'Enter' }, { inside: true, tagName: 'INPUT', inputType: 'text' }), 'pass', 'text field');
    t.equal(modalKeyAction({ key: 'Enter' }, { inside: true, tagName: 'INPUT' }), 'pass', 'input without type is text');
    t.equal(modalKeyAction({ key: 'Enter' }, { inside: true, tagName: 'INPUT', inputType: 'number' }), 'pass', 'number field commits');
    t.equal(modalKeyAction({ key: 'Enter' }, { inside: true, tagName: 'TEXTAREA' }), 'pass', 'textarea');
    t.equal(modalKeyAction({ key: 'Enter' }, { inside: true, tagName: 'DIV', isContentEditable: true }), 'pass', 'contenteditable');
    t.equal(modalKeyAction({ key: 'Enter' }, { inside: true, tagName: 'DIV', expanded: true }), 'pass', 'open select picks its option');
    t.equal(modalKeyAction({ key: 'Enter', isComposing: true }, onDialog), 'pass', 'IME composition');
    t.end();
});

test('modalKeyboard: Esc cancels', (t) => {
    t.equal(modalKeyAction({ key: 'Escape' }, outside), 'cancel', 'from behind');
    t.equal(modalKeyAction({ key: 'Escape' }, onDialog), 'cancel', 'in the dialog');
    t.equal(modalKeyAction({ key: 'Escape' }, { inside: true, tagName: 'INPUT' }), 'cancel', 'from a text field');
    t.equal(modalKeyAction({ key: 'Escape' }, { inside: true, tagName: 'DIV', expanded: true }), 'pass', 'an open select closes first');
    t.end();
});

test('modalKeyboard: no key reaches what is behind the dialog', (t) => {
    ['Delete', 'Backspace', 'a', 'ArrowLeft', ' ', 'Tab', 'z'].forEach((key) => {
        t.equal(modalKeyAction({ key }, outside), 'block', `${JSON.stringify(key)} from behind is dropped`);
    });
    t.equal(modalKeyAction({ key: 'z', ctrlKey: true }, outside), 'block', 'Ctrl+Z (undo) from behind');
    t.equal(modalKeyAction({ key: 'Enter', ctrlKey: true }, outside), 'block', 'Ctrl+Enter is not Enter');
    t.equal(modalKeyAction({ key: 'Enter', shiftKey: true }, outside), 'block', 'Shift+Enter is not Enter');
    t.equal(modalKeyAction({ key: 'a', isComposing: true }, outside), 'block', 'composition behind the dialog');
    t.end();
});

test('modalKeyboard: keys inside the dialog go to its elements', (t) => {
    t.equal(modalKeyAction({ key: 'Tab' }, onDialog), 'pass', 'Tab moves the focus');
    t.equal(modalKeyAction({ key: 'a' }, { inside: true, tagName: 'INPUT' }), 'pass', 'typing');
    t.equal(modalKeyAction({ key: 'Delete' }, { inside: true, tagName: 'BUTTON' }), 'pass', 'Delete on a dialog button (stopped at body later)');
    t.end();
});

test('modalKeyboard: F-keys are never touched', (t) => {
    t.equal(isUntouchableKey('F12'), true, 'F12');
    t.equal(isUntouchableKey('F5'), true, 'F5');
    t.equal(isUntouchableKey('Enter'), false, 'Enter');
    t.equal(isUntouchableKey('f'), false, 'f');
    t.end();
});

test('modalKeyboard: the last opened dialog is the topmost', (t) => {
    t.equal(isModalOpen(), false, 'none open');
    const a = { element: () => null };
    const b = { element: () => null };
    const closeA = pushModal(a);
    const closeB = pushModal(b);
    t.equal(topModal(), b, 'nested dialog on top');
    closeB();
    t.equal(topModal(), a, 'back to the first');
    closeB();
    t.equal(topModal(), a, 'closing twice is harmless');
    closeA();
    t.equal(isModalOpen(), false, 'all closed');
    t.equal(topModal(), null, 'no top');
    t.end();
});

test('modalKeyboard: the default button is the last enabled primary one, or the only button', (t) => {
    const b = (primary, disabled = false) => ({ primary, disabled });
    t.equal(defaultButtonIndex([b(false), b(true)]), 1, 'Cancel, Delete (primary)');
    t.equal(defaultButtonIndex([b(true), b(false), b(true)]), 2, 'two primary: the right-most');
    t.equal(defaultButtonIndex([b(false), b(true, true)]), -1, 'primary disabled, two buttons: none');
    t.equal(defaultButtonIndex([b(true), b(true, true)]), 0, 'right-most primary disabled: the enabled one');
    t.equal(defaultButtonIndex([b(false)]), 0, 'single "Close" button of an info dialog');
    t.equal(defaultButtonIndex([b(false), b(false)]), -1, 'two plain buttons: no default');
    t.equal(defaultButtonIndex([b(false), b(false, true)]), -1, 'two plain buttons, one disabled: none');
    t.equal(defaultButtonIndex([b(false, true)]), -1, 'single disabled button');
    t.equal(defaultButtonIndex([]), -1, 'no footer');
    t.end();
});
