import { parse } from '@babel/parser';
import * as t from '@babel/types';

export type FunctionMetric = {
    name: string;
    file: string;
    startLine: number;
    endLine: number;
    cc: number;
};

const DECISIONS = new Set([
    'IfStatement',
    'ForStatement',
    'ForInStatement',
    'ForOfStatement',
    'WhileStatement',
    'DoWhileStatement',
    'CatchClause',
    'ConditionalExpression',
    'LogicalExpression',
]);

function nodeName(node: t.Node | null | undefined): string | undefined {
    if (t.isIdentifier(node)) return node.name;
    if (t.isStringLiteral(node) || t.isNumericLiteral(node)) return String(node.value);
    if (t.isPrivateName(node)) return `#${node.id.name}`;
    return undefined;
}

function functionName(node: t.Function, parent: t.Node | undefined) {
    if ('id' in node && node.id) return node.id.name;
    if ('key' in node) return nodeName(node.key);
    if (t.isVariableDeclarator(parent)) return nodeName(parent.id);
    if (t.isAssignmentExpression(parent)) return nodeName(parent.left);
    if (t.isObjectProperty(parent) || t.isClassProperty(parent)) return nodeName(parent.key);
    return undefined;
}

function isDecision(node: t.Node) {
    if (t.isSwitchCase(node)) return node.test !== null;
    return DECISIONS.has(node.type);
}

export function collectFunctions(source: string, fileName: string) {
    const ast = parse(source, {
        sourceType: 'unambiguous',
        sourceFilename: fileName,
        plugins: ['typescript', 'jsx'],
    });
    const functions: FunctionMetric[] = [];
    const stack: FunctionMetric[] = [];
    t.traverse(ast, {
        enter(node, ancestors) {
            if (t.isFunction(node) && node.body) {
                const metric = {
                    name:
                        functionName(node, ancestors.at(-1)?.node) ??
                        `(anonymous:${node.loc!.start.line})`,
                    file: fileName,
                    startLine: node.loc!.start.line,
                    endLine: node.loc!.end.line,
                    cc: 1,
                };
                functions.push(metric);
                stack.push(metric);
            } else if (isDecision(node) && stack.length > 0) {
                stack.at(-1)!.cc += 1;
            }
        },
        exit(node) {
            if (t.isFunction(node) && node.body) stack.pop();
        },
    });
    return functions;
}
