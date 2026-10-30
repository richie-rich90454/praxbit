import type { CodeTest } from "@praxbit/contracts";
import type * as TypeScript from "typescript";

export type AstTest = Extract<CodeTest, { kind: "ast" }>;
export type AstMatcher = AstTest["require"][number];
export type AstNodeKind = AstMatcher["node"];

export interface AstTestOutcome {
    readonly description: string;
    readonly passed: boolean;
    readonly actual?: string;
    readonly error?: string;
}

interface CountedNodes {
    readonly counts: ReadonlyMap<AstNodeKind, { readonly count: number; readonly names: string[] }>;
}

let typescriptModule: Promise<typeof TypeScript> | undefined;

async function loadTypeScript(): Promise<typeof TypeScript> {
    typescriptModule ??= import("typescript").then(function unwrap(loaded): typeof TypeScript {
        const namespace = loaded as unknown as { readonly default?: typeof TypeScript };
        return namespace.default ?? loaded;
    });
    return await typescriptModule;
}

function scriptKind(ts: typeof TypeScript, test: AstTest): TypeScript.ScriptKind {
    if (test.file.endsWith(".tsx")) {
        return ts.ScriptKind.TSX;
    }
    if (test.file.endsWith(".jsx")) {
        return ts.ScriptKind.JSX;
    }
    return test.language === "typescript" ? ts.ScriptKind.TS : ts.ScriptKind.JS;
}

function bindingNames(ts: typeof TypeScript, name: TypeScript.BindingName): string[] {
    if (ts.isIdentifier(name)) {
        return [name.text];
    }
    const names: string[] = [];
    for (const element of name.elements) {
        if (ts.isBindingElement(element)) {
            names.push(...bindingNames(ts, element.name));
        }
    }
    return names;
}

function collectNodes(ts: typeof TypeScript, sourceFile: TypeScript.SourceFile): CountedNodes {
    const counts = new Map<AstNodeKind, { count: number; names: string[] }>();

    function add(kind: AstNodeKind, names: readonly string[]): void {
        const current = counts.get(kind) ?? { count: 0, names: [] };
        current.count += 1;
        current.names.push(...names);
        counts.set(kind, current);
    }

    function visit(node: TypeScript.Node): void {
        if (ts.isFunctionDeclaration(node)) {
            add("function-declaration", node.name === undefined ? [] : [node.name.text]);
        }
        if (ts.isClassDeclaration(node)) {
            add("class-declaration", node.name === undefined ? [] : [node.name.text]);
        }
        if (ts.isReturnStatement(node)) {
            add("return-statement", []);
        }
        if (ts.isIfStatement(node)) {
            add("if-statement", []);
        }
        if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
            add("for-statement", []);
        }
        if (ts.isVariableDeclaration(node)) {
            add("variable-declaration", bindingNames(ts, node.name));
        }
        if (ts.isCallExpression(node)) {
            const names = [node.expression.getText(sourceFile)];
            if (ts.isPropertyAccessExpression(node.expression)) {
                names.push(node.expression.name.text);
            }
            add("function-call", names);
        }
        if (ts.isImportDeclaration(node)) {
            const names: string[] = [];
            if (ts.isStringLiteral(node.moduleSpecifier)) {
                names.push(node.moduleSpecifier.text);
            }
            const clause = node.importClause;
            if (clause !== undefined) {
                if (clause.name !== undefined) {
                    names.push(clause.name.text);
                }
                const bindings = clause.namedBindings;
                if (bindings !== undefined) {
                    if (ts.isNamespaceImport(bindings)) {
                        names.push(bindings.name.text);
                    } else {
                        for (const element of bindings.elements) {
                            names.push(element.name.text);
                            if (element.propertyName !== undefined) {
                                names.push(element.propertyName.text);
                            }
                        }
                    }
                }
            }
            add("import", names);
        }
        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return { counts };
}

function matcherName(matcher: AstMatcher): string {
    return matcher.name === undefined ? matcher.node : `${matcher.node} "${matcher.name}"`;
}

function matchingCount(counted: CountedNodes, matcher: AstMatcher): number {
    const entry = counted.counts.get(matcher.node);
    if (entry === undefined) {
        return 0;
    }
    if (matcher.name === undefined) {
        return entry.count;
    }
    return entry.names.filter(function matches(name): boolean {
        return name === matcher.name;
    }).length;
}

function parseDiagnostics(
    ts: typeof TypeScript,
    sourceFile: TypeScript.SourceFile,
): readonly string[] {
    const internal = sourceFile as unknown as {
        readonly parseDiagnostics?: readonly TypeScript.Diagnostic[];
    };
    const diagnostics = internal.parseDiagnostics ?? [];
    return diagnostics
        .filter(function isError(diagnostic): boolean {
            return diagnostic.category === ts.DiagnosticCategory.Error;
        })
        .map(function messageOf(diagnostic): string {
            return ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
        });
}

export async function runAstTests(
    files: Readonly<Record<string, string>>,
    tests: readonly AstTest[],
): Promise<AstTestOutcome[]> {
    if (tests.length === 0) {
        return [];
    }
    const ts = await loadTypeScript();
    const outcomes: AstTestOutcome[] = [];

    for (const test of tests) {
        const content = files[test.file];
        if (content === undefined) {
            outcomes.push({
                description: test.description,
                passed: false,
                error: `File not found: ${test.file}`,
            });
            continue;
        }
        const sourceFile = ts.createSourceFile(
            test.file,
            content,
            ts.ScriptTarget.Latest,
            true,
            scriptKind(ts, test),
        );
        const diagnostics = parseDiagnostics(ts, sourceFile);
        if (diagnostics.length > 0) {
            outcomes.push({
                description: test.description,
                passed: false,
                error: `The file could not be parsed: ${diagnostics.join("; ")}`,
            });
            continue;
        }
        const counted = collectNodes(ts, sourceFile);
        const errors: string[] = [];
        for (const matcher of test.require) {
            const minimum = matcher.min ?? 1;
            const found = matchingCount(counted, matcher);
            if (found < minimum) {
                errors.push(
                    `Requires at least ${minimum} ${matcherName(matcher)} in ${test.file}; found ${found}.`,
                );
            }
        }
        for (const matcher of test.forbid ?? []) {
            const maximum = (matcher.min ?? 1) - 1;
            const found = matchingCount(counted, matcher);
            if (found > maximum) {
                errors.push(`Forbids ${matcherName(matcher)} in ${test.file}; found ${found}.`);
            }
        }
        outcomes.push({
            description: test.description,
            passed: errors.length === 0,
            ...(errors.length === 0 ? {} : { error: errors.join(" ") }),
        });
    }

    return outcomes;
}
