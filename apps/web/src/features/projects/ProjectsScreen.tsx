import { A } from "@solidjs/router";
import { For, type JSX } from "solid-js";
import { projects, skillName } from "../../content/index.ts";
import { useLearning } from "../learning/learning-store.tsx";
import { Pip } from "../../design/Pip.tsx";

export function ProjectsScreen(): JSX.Element {
    const learning = useLearning();

    return (
        <main class="page">
            <div class="page-header">
                <div class="page-header__text">
                    <h1>Projects</h1>
                    <p class="lede">
                        Longer authentic work with files, a real editor, executable checks, and an explanation of the
                        result. Projects are not a course list; each one produces a working artifact.
                    </p>
                </div>
                <Pip pose="explaining" size={80} />
            </div>

            <div class="grid grid--three">
                <For each={projects}>
                    {function project(item): JSX.Element {
                        const completed = learning.completedProjectIds().includes(item.id);
                        return (
                            <article class="surface stack">
                                <div class="stack stack--tight">
                                    <span class="meta">
                                        {item.difficulty} · {item.estimatedMinutes} min
                                    </span>
                                    <h2>{item.title}</h2>
                                    <p class="small muted">{item.summary}</p>
                                </div>
                                <div class="stack stack--tight">
                                    <span class="meta">Skills</span>
                                    <p class="small">{item.skills.map(skillName).join(", ")}</p>
                                </div>
                                <div class="row row--between">
                                    <span class={`status ${completed ? "status--success" : ""}`}>
                                        <span class="status__mark" aria-hidden="true" />
                                        {completed ? "Completed" : `${item.stages.length} stages`}
                                    </span>
                                    <A class="button button--secondary button--small" href={`/projects/${item.id}`}>
                                        {completed ? "Open project" : "Start project"}
                                    </A>
                                </div>
                            </article>
                        );
                    }}
                </For>
            </div>
        </main>
    );
}
