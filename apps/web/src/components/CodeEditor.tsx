import { createEffect, onCleanup, onMount, type JSX } from "solid-js";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";

export interface CodeEditorProps {
    readonly value: string;
    readonly language: string;
    readonly label: string;
    readonly readOnly?: boolean;
    readonly onChange: (value: string) => void;
    readonly onRun?: () => void;
}

function languageExtension(language: string) {
    switch (language) {
        case "javascript":
            return javascript();
        case "typescript":
            return javascript({ typescript: true });
        case "html":
            return html();
        case "css":
            return css();
        case "python":
            return python();
        case "sql":
            return sql();
        default:
            return [];
    }
}

const editorTheme = EditorView.theme({
    "&": {
        backgroundColor: "#FFFFFF",
        color: "#000000",
        fontSize: "14px",
    },
    ".cm-content": {
        fontFamily: "\"Noto Sans Mono\", monospace",
        padding: "12px 0",
        caretColor: "#B54131",
    },
    ".cm-gutters": {
        backgroundColor: "#F7F7F5",
        color: "#555555",
        borderRight: "1px solid #D6D6D6",
    },
    ".cm-activeLine": {
        backgroundColor: "#F7F7F5",
    },
    ".cm-selectionBackground, ::selection": {
        backgroundColor: "#F1D9D5",
    },
    "&.cm-focused .cm-selectionBackground": {
        backgroundColor: "#F1D9D5",
    },
    ".cm-cursor": {
        borderLeftColor: "#B54131",
    },
});

export function CodeEditor(props: CodeEditorProps): JSX.Element {
    let container: HTMLDivElement | undefined;
    let view: EditorView | undefined;

    onMount(function mount(): void {
        if (container === undefined) {
            return;
        }
        const runKeymap = keymap.of([
            {
                key: "Mod-Enter",
                run: function run(): boolean {
                    props.onRun?.();
                    return true;
                },
            },
        ]);
        const state = EditorState.create({
            doc: props.value,
            extensions: [
                lineNumbers(),
                highlightSpecialChars(),
                drawSelection(),
                history(),
                bracketMatching(),
                closeBrackets(),
                highlightActiveLine(),
                highlightSelectionMatches(),
                syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
                keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
                runKeymap,
                EditorView.lineWrapping,
                EditorState.readOnly.of(props.readOnly === true),
                languageExtension(props.language),
                editorTheme,
                EditorView.updateListener.of(function update(listener): void {
                    if (listener.docChanged) {
                        props.onChange(listener.state.doc.toString());
                    }
                }),
            ],
        });
        view = new EditorView({ state, parent: container });
    });

    createEffect(function syncValue(): void {
        if (view === undefined) {
            return;
        }
        const current = view.state.doc.toString();
        if (current !== props.value) {
            view.dispatch({
                changes: { from: 0, to: current.length, insert: props.value },
            });
        }
    });

    onCleanup(function dispose(): void {
        view?.destroy();
    });

    return (
        <div class="stack stack--tight">
            <span class="meta">{props.label}</span>
            <div class="code-editor" ref={container} aria-label={props.label} />
        </div>
    );
}
