import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost:3000/' });
const browserGlobals = [
    'window',
    'document',
    'navigator',
    'location',
    'HTMLElement',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'HTMLSelectElement',
    'HTMLButtonElement',
    'HTMLFormElement',
    'Element',
    'Node',
    'NodeFilter',
    'DocumentFragment',
    'MutationObserver',
    'ResizeObserver',
    'Event',
    'CustomEvent',
    'MouseEvent',
    'PointerEvent',
    'KeyboardEvent',
    'FocusEvent',
    'InputEvent',
    'DOMRect',
    'DOMRectReadOnly',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
] as const;

for (const name of browserGlobals) {
    Object.defineProperty(globalThis, name, {
        configurable: true,
        writable: true,
        value: name === 'window' ? browser : browser[name],
    });
}
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    writable: true,
    value: true,
});

export const testBrowser = browser;
