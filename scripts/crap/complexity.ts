export type FunctionMetric = {
    name: string;
    file: string;
    startLine: number;
    endLine: number;
    cc: number;
};

type Token = {
    kind: 'ident' | 'punct' | 'string';
    text: string;
    line: number;
};

const CONTROL_NAMES = new Set([
    'if',
    'for',
    'while',
    'switch',
    'catch',
    'function',
    'do',
    'class',
    'try',
    'else',
    'return',
    'await',
    'new',
    'typeof',
    'case',
    'default',
    'throw',
    'break',
    'continue',
]);

function isIdentStart(char: string) {
    return /[A-Za-z_$]/.test(char);
}

function isIdentPart(char: string) {
    return /[A-Za-z0-9_$]/.test(char);
}

function tokenize(source: string) {
    const tokens: Token[] = [];
    let index = 0;
    let line = 1;
    const end = source.length;

    const push = (kind: Token['kind'], text: string) => {
        tokens.push({ kind, text, line });
    };

    while (index < end) {
        const char = source[index];
        if (char === '\n') {
            line += 1;
            index += 1;
            continue;
        }
        if (char === ' ' || char === '\t' || char === '\r') {
            index += 1;
            continue;
        }
        if (char === '/' && source[index + 1] === '/') {
            while (index < end && source[index] !== '\n') {
                index += 1;
            }
            continue;
        }
        if (char === '/' && source[index + 1] === '*') {
            index += 2;
            while (index < end && !(source[index] === '*' && source[index + 1] === '/')) {
                if (source[index] === '\n') {
                    line += 1;
                }
                index += 1;
            }
            index += 2;
            continue;
        }
        if (char === '"' || char === "'") {
            const quote = char;
            index += 1;
            while (index < end && source[index] !== quote) {
                if (source[index] === '\\') {
                    index += 2;
                    continue;
                }
                if (source[index] === '\n') {
                    line += 1;
                }
                index += 1;
            }
            index += 1;
            push('string', quote);
            continue;
        }
        if (char === '`') {
            index += 1;
            while (index < end && source[index] !== '`') {
                if (source[index] === '\\') {
                    index += 2;
                    continue;
                }
                if (source[index] === '\n') {
                    line += 1;
                }
                if (source[index] === '$' && source[index + 1] === '{') {
                    index += 2;
                    let depth = 1;
                    const start = index;
                    const startLine = line;
                    while (index < end && depth > 0) {
                        if (source[index] === '\n') {
                            line += 1;
                        }
                        if (source[index] === '{') {
                            depth += 1;
                        } else if (source[index] === '}') {
                            depth -= 1;
                        }
                        index += 1;
                    }
                    const inner = source.slice(start, index - 1);
                    for (const token of tokenize(inner)) {
                        tokens.push({
                            kind: token.kind,
                            text: token.text,
                            line: startLine + token.line - 1,
                        });
                    }
                    continue;
                }
                index += 1;
            }
            index += 1;
            push('string', '`');
            continue;
        }
        const two = source.slice(index, index + 2);
        if (two === '&&' || two === '||' || two === '??' || two === '=>' || two === '?.') {
            push('punct', two);
            index += 2;
            continue;
        }
        if ('{}()[]?:;,.<>!=+-*%&|^~'.includes(char)) {
            push('punct', char);
            index += 1;
            continue;
        }
        if (isIdentStart(char)) {
            let next = index + 1;
            while (next < end && isIdentPart(source[next])) {
                next += 1;
            }
            push('ident', source.slice(index, next));
            index = next;
            continue;
        }
        index += 1;
    }
    return tokens;
}

function isDecision(token: Token) {
    if (token.kind === 'punct') {
        return (
            token.text === '&&' || token.text === '||' || token.text === '??' || token.text === '?'
        );
    }
    if (token.kind !== 'ident') {
        return false;
    }
    return (
        token.text === 'if' ||
        token.text === 'for' ||
        token.text === 'while' ||
        token.text === 'case' ||
        token.text === 'catch'
    );
}

export function collectFunctions(source: string, fileName: string) {
    const tokens = tokenize(source);
    let cursor = 0;
    const functions: FunctionMetric[] = [];

    const peek = (offset: number) => tokens[cursor + offset];
    const at = () => tokens[cursor];
    const take = () => tokens[cursor++];

    function skipBalanced(open: string, close: string) {
        if (at()?.text !== open) {
            return;
        }
        let depth = 0;
        while (cursor < tokens.length) {
            const token = take();
            if (token.text === open) {
                depth += 1;
            }
            if (token.text === close) {
                depth -= 1;
                if (depth === 0) {
                    return;
                }
            }
        }
    }

    function skipParams() {
        skipBalanced('(', ')');
    }

    function looksLikeFunction(): boolean {
        const token = at();
        if (!token) {
            return false;
        }
        if (token.text === 'function' || token.text === 'async') {
            return true;
        }
        if (token.kind === 'ident' && !CONTROL_NAMES.has(token.text) && peek(1)?.text === '(') {
            // `cond ? fn() : other` 的冒号不是返回类型
            if (tokens[cursor - 1]?.text === '?') {
                return false;
            }
            let index = cursor + 1;
            let depth = 0;
            while (index < tokens.length) {
                const current = tokens[index];
                if (current.text === '(') {
                    depth += 1;
                }
                if (current.text === ')') {
                    depth -= 1;
                    if (depth === 0) {
                        const after = tokens[index + 1];
                        return after?.text === '{' || after?.text === ':';
                    }
                }
                index += 1;
            }
        }
        return false;
    }

    function assignedName() {
        let index = cursor - 1;
        if (tokens[index]?.text === ')') {
            let depth = 0;
            while (index >= 0) {
                if (tokens[index].text === ')') {
                    depth += 1;
                }
                if (tokens[index].text === '(') {
                    depth -= 1;
                    if (depth === 0) {
                        index -= 1;
                        break;
                    }
                }
                index -= 1;
            }
        }
        if (tokens[index]?.text === '=' && tokens[index - 1]?.kind === 'ident') {
            return tokens[index - 1].text;
        }
        return '';
    }

    function parseExpressionBody(name: string, startLine: number) {
        let depth = 0;
        let decisions = 0;
        while (cursor < tokens.length) {
            const token = at();
            if (!token) {
                break;
            }
            if (depth === 0 && (token.text === ',' || token.text === ';' || token.text === ')')) {
                break;
            }
            if (looksLikeFunction() || token.text === '=>') {
                parseFunctionLike();
                continue;
            }
            if (token.text === '(' || token.text === '{' || token.text === '[') {
                depth += 1;
            }
            if (token.text === ')' || token.text === '}' || token.text === ']') {
                if (depth === 0) {
                    break;
                }
                depth -= 1;
            }
            if (isDecision(token)) {
                decisions += 1;
            }
            take();
        }
        const endLine = tokens[cursor - 1]?.line ?? startLine;
        functions.push({ name, file: fileName, startLine, endLine, cc: decisions + 1 });
    }

    function parseBlock(name: string, startLine: number) {
        if (at()?.text !== '{') {
            return;
        }
        take();
        let depth = 1;
        let decisions = 0;
        while (cursor < tokens.length && depth > 0) {
            const token = at();
            if (looksLikeFunction() || token.text === '=>') {
                parseFunctionLike();
                continue;
            }
            if (token.text === '{') {
                depth += 1;
                take();
                continue;
            }
            if (token.text === '}') {
                depth -= 1;
                take();
                continue;
            }
            if (isDecision(token)) {
                decisions += 1;
            }
            take();
        }
        const endLine = tokens[cursor - 1]?.line ?? startLine;
        functions.push({ name, file: fileName, startLine, endLine, cc: decisions + 1 });
    }

    function skipReturnType() {
        if (at()?.text !== ':') {
            return;
        }
        while (at() && at().text !== '{' && at().text !== '=>') {
            if (at().text === '(') {
                skipParams();
                continue;
            }
            take();
        }
    }

    function parseFunctionLike() {
        const startLine = at()?.line ?? 1;
        let name = assignedName() || `(anonymous:${startLine})`;
        if (at()?.text === 'async') {
            take();
        }
        if (at()?.text === 'function') {
            take();
            if (at()?.kind === 'ident') {
                name = take().text;
            }
            skipParams();
            skipReturnType();
            if (at()?.text === '{') {
                parseBlock(name, startLine);
            }
            return;
        }
        if (at()?.kind === 'ident' && peek(1)?.text === '(') {
            name = take().text;
            skipParams();
            skipReturnType();
            if (at()?.text === '{') {
                parseBlock(name, startLine);
            } else if (at()?.text === '=>') {
                take();
                if (at()?.text === '{') {
                    parseBlock(name, startLine);
                } else {
                    parseExpressionBody(name, startLine);
                }
            }
            return;
        }
        if (at()?.text === '(') {
            skipParams();
            skipReturnType();
        }
        if (at()?.text === '=>') {
            take();
            if (at()?.text === '{') {
                parseBlock(name, startLine);
            } else {
                parseExpressionBody(name, startLine);
            }
        }
    }

    while (cursor < tokens.length) {
        if (looksLikeFunction() || at()?.text === '=>') {
            parseFunctionLike();
            continue;
        }
        take();
    }
    return functions;
}
