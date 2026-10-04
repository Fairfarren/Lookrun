export const TEST_GROUPS = [
    { name: 'server', args: ['./tests', './app/server/tests', './packages/shared/tests'] },
    { name: 'web', args: ['--preload', './app/web/tests/helpers/dom.ts', './app/web/tests'] },
];
