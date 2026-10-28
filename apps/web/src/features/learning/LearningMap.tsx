import { A } from "@solidjs/router";
import { For, createMemo, type JSX } from "solid-js";
import type { Mission, Track } from "@praxbit/contracts";
import { missionsForTrack, getMission, skillName } from "../../content/index.ts";
import { useLearning } from "../learning/learning-store.tsx";

type NodeStatus = "completed" | "recommended" | "available" | "locked";

export function LearningMap(props: { readonly track: Track }): JSX.Element {
    const learning = useLearning();

    function missions() {
        return missionsForTrack(props.track.id);
    }

    function skillIsReady(skillId: string): boolean {
        if (learning.progress().placementSkippedSkills.includes(skillId)) {
            return true;
        }
        if ((learning.mastery()[skillId]?.score ?? 0) >= 0.6) {
            return true;
        }
        return learning.completions().some(function covered(completion): boolean {
            const mission = getMission(completion.missionId);
            return mission?.skills.includes(skillId) === true;
        });
    }

    function statusOf(mission: Mission): NodeStatus {
        if (learning.completedMissionIds().has(mission.id)) {
            return "completed";
        }
        const unlocked =
            mission.prerequisites.length === 0 || mission.prerequisites.every(skillIsReady);
        if (!unlocked) {
            return "locked";
        }
        if (learning.recommendationId() === mission.id) {
            return "recommended";
        }
        return "available";
    }

    function statusLabel(status: NodeStatus): string {
        switch (status) {
            case "completed":
                return "Completed";
            case "recommended":
                return "Recommended";
            case "available":
                return "Available";
            default:
                return "Locked";
        }
    }

    return (
        <section class="map-track" aria-labelledby={`track-${props.track.id}`}>
            <div class="map-track__header">
                <div>
                    <h3 id={`track-${props.track.id}`}>{props.track.title}</h3>
                    <p class="meta">{props.track.summary}</p>
                </div>
                <span class="meta">
                    {
                        missions().filter(function done(mission): boolean {
                            return learning.completedMissionIds().has(mission.id);
                        }).length
                    }{" "}
                    of {missions().length} complete
                </span>
            </div>
            <div
                class="map-strip"
                role="list"
                aria-label={`${props.track.title} missions`}
                tabindex="0"
            >
                <For each={missions()}>
                    {function missionNode(mission, index): JSX.Element {
                        const status = createMemo(function currentStatus(): NodeStatus {
                            return statusOf(mission);
                        });
                        const href = createMemo(function missionHref(): string {
                            return status() === "completed"
                                ? `/missions/${mission.id}?practice=1`
                                : `/missions/${mission.id}`;
                        });
                        return (
                            <div class="map-node-wrap" role="listitem">
                                {index() > 0 ? (
                                    <span class="map-connector" aria-hidden="true" />
                                ) : null}
                                {status() === "locked" ? (
                                    <div class={`map-node map-node--locked`} aria-disabled="true">
                                        <span class="map-node__index">
                                            {String(mission.sequence).padStart(2, "0")}
                                        </span>
                                        <span class="map-node__title">{mission.title}</span>
                                        <span class="map-node__status">
                                            Locked:{" "}
                                            {mission.prerequisites.map(skillName).join(", ")}
                                        </span>
                                    </div>
                                ) : (
                                    <A class={`map-node map-node--${status()}`} href={href()}>
                                        <span class="map-node__index">
                                            {String(mission.sequence).padStart(2, "0")}
                                        </span>
                                        <span class="map-node__title">{mission.title}</span>
                                        <span class="map-node__status">
                                            {statusLabel(status())}
                                        </span>
                                    </A>
                                )}
                            </div>
                        );
                    }}
                </For>
            </div>
        </section>
    );
}
