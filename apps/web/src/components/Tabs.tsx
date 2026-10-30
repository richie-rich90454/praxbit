import { For, Show, type JSX } from "solid-js";

export interface TabItem {
    readonly id: string;
    readonly label: string;
    readonly detail?: string;
}

export interface TabsProps {
    readonly idPrefix: string;
    readonly label: string;
    readonly items: readonly TabItem[];
    readonly activeId: string;
    readonly onSelect: (id: string) => void;
}

export function tabElementId(idPrefix: string, id: string): string {
    return `${idPrefix}-tab-${id}`;
}

export function tabPanelId(idPrefix: string, id: string): string {
    return `${idPrefix}-panel-${id}`;
}

function focusTab(idPrefix: string, id: string): void {
    queueMicrotask(function focus(): void {
        const element = document.getElementById(tabElementId(idPrefix, id));
        if (element instanceof HTMLElement) {
            element.focus();
        }
    });
}

export function Tabs(props: TabsProps): JSX.Element {
    function select(index: number): void {
        const item = props.items[index];
        if (item === undefined) {
            return;
        }
        props.onSelect(item.id);
        focusTab(props.idPrefix, item.id);
    }

    function navigate(event: KeyboardEvent, index: number): void {
        const last = props.items.length - 1;
        if (last < 0) {
            return;
        }
        switch (event.key) {
            case "ArrowRight":
                event.preventDefault();
                select(index === last ? 0 : index + 1);
                return;
            case "ArrowLeft":
                event.preventDefault();
                select(index === 0 ? last : index - 1);
                return;
            case "Home":
                event.preventDefault();
                select(0);
                return;
            case "End":
                event.preventDefault();
                select(last);
                return;
            default:
                return;
        }
    }

    return (
        <div class="method-tabs" role="tablist" aria-label={props.label}>
            <For each={props.items}>
                {function tab(item, index): JSX.Element {
                    const selected = function selected(): boolean {
                        return props.activeId === item.id;
                    };
                    return (
                        <button
                            type="button"
                            role="tab"
                            id={tabElementId(props.idPrefix, item.id)}
                            class="method-tab"
                            aria-selected={selected()}
                            aria-controls={tabPanelId(props.idPrefix, item.id)}
                            tabindex={selected() ? "0" : "-1"}
                            onClick={function choose(): void {
                                props.onSelect(item.id);
                            }}
                            onKeyDown={function keydown(event): void {
                                navigate(event, index());
                            }}
                        >
                            <span class="method-tab__name">{item.label}</span>
                            <Show when={item.detail !== undefined}>
                                <span class="method-tab__detail">{item.detail}</span>
                            </Show>
                        </button>
                    );
                }}
            </For>
        </div>
    );
}

export interface TabPanelProps {
    readonly idPrefix: string;
    readonly id: string;
    readonly activeId: string;
    readonly content: () => JSX.Element;
}

export function TabPanel(props: TabPanelProps): JSX.Element {
    const active = function active(): boolean {
        return props.activeId === props.id;
    };

    return (
        <div
            id={tabPanelId(props.idPrefix, props.id)}
            role="tabpanel"
            aria-labelledby={tabElementId(props.idPrefix, props.id)}
            tabindex="0"
            hidden={!active()}
        >
            <Show when={active()}>{props.content()}</Show>
        </div>
    );
}
