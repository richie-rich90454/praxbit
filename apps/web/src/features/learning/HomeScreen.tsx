import { Navigate } from "@solidjs/router";
import { Show, type JSX } from "solid-js";
import { useLearning } from "./learning-store.tsx";
import { LearnScreen } from "./LearnScreen.tsx";

export function HomeScreen(): JSX.Element {
    const learning = useLearning();

    return (
        <Show
            when={learning.ready()}
            fallback={
                <main class="page page--narrow">
                    <p class="muted">Opening your local learning state.</p>
                </main>
            }
        >
            <Show
                when={!learning.onboarded() && learning.completions().length === 0}
                fallback={<LearnScreen />}
            >
                <Navigate href="/missions/before-code.make-it-respond" />
            </Show>
        </Show>
    );
}
