import test from 'tape';
import { isMenuUnchanged, menuSignature } from '../src/app/flux/appbar-menu/menu-update';

const menu = () => [{ id: 'file', label: 'File', submenu: [{ id: 'save', label: 'Save', enabled: false, click: () => 1 }] }];

test('menu update: an unchanged menu is not published again', (t) => {
    const current = menu();
    const last = { menu: current, signature: menuSignature(current) };
    t.ok(isMenuUnchanged(last, current, menuSignature(current)), 'same array, same content');

    current[0].submenu[0].click = () => 2;
    t.ok(isMenuUnchanged(last, current, menuSignature(current)), 'new click handlers do not count');

    current[0].submenu[0].enabled = true;
    t.notOk(isMenuUnchanged(last, current, menuSignature(current)), 'an enabled state changed');
    t.end();
});

test('menu update: a menu published by another action is published again', (t) => {
    const first = menu();
    const last = { menu: first, signature: menuSignature(first) };
    const replaced = [...first];
    t.notOk(isMenuUnchanged(last, replaced, menuSignature(replaced)), 'another array in the state');
    t.notOk(isMenuUnchanged(null, first, menuSignature(first)), 'nothing published yet');
    t.end();
});
