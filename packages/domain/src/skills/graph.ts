import type { SkillDefinition, SkillGraphDocument } from "@praxbit/contracts";

export type SkillId = SkillGraphDocument["skills"][number]["id"];

export interface SkillGraphIssue {
    readonly kind: "duplicate" | "missing-parent" | "cycle" | "self-parent" | "orphan-concept";
    readonly skillId: string;
    readonly message: string;
}

export class SkillGraph {
    private readonly skillsById: Map<string, SkillDefinition>;
    private readonly childrenById: ReadonlyMap<string, readonly SkillDefinition[]>;

    public constructor(document: SkillGraphDocument) {
        this.skillsById = new Map<string, SkillDefinition>();
        const children = new Map<string, SkillDefinition[]>();

        for (const skill of document.skills) {
            if (this.skillsById.has(skill.id)) {
                continue;
            }
            this.skillsById.set(skill.id, skill);
            for (const parentId of skill.parents) {
                const siblings = children.get(parentId);
                if (siblings === undefined) {
                    children.set(parentId, [skill]);
                } else {
                    siblings.push(skill);
                }
            }
        }

        this.childrenById = children;
    }

    public get size(): number {
        return this.skillsById.size;
    }

    public getSkill(skillId: string): SkillDefinition | undefined {
        return this.skillsById.get(skillId);
    }

    public requireSkill(skillId: string): SkillDefinition {
        const skill = this.skillsById.get(skillId);
        if (skill === undefined) {
            throw new Error(`Unknown skill: ${skillId}`);
        }
        return skill;
    }

    public getChildren(skillId: string): readonly SkillDefinition[] {
        return this.childrenById.get(skillId) ?? [];
    }

    public getAncestors(skillId: string): readonly SkillDefinition[] {
        const seen = new Set<string>();
        const result: SkillDefinition[] = [];
        const stack = [...this.requireSkill(skillId).parents];

        while (stack.length > 0) {
            const next = stack.pop();
            if (next === undefined || seen.has(next)) {
                continue;
            }
            seen.add(next);
            const skill = this.skillsById.get(next);
            if (skill === undefined) {
                continue;
            }
            result.push(skill);
            for (const parent of skill.parents) {
                stack.push(parent);
            }
        }

        return result;
    }

    public getConceptAncestors(skillId: string): readonly SkillDefinition[] {
        return this.getAncestors(skillId).filter(function isConcept(skill: SkillDefinition): boolean {
            return skill.kind === "concept";
        });
    }

    public getEligibility(skillId: string, mastery: Readonly<Record<string, number>>, threshold: number): boolean {
        const skill = this.requireSkill(skillId);
        for (const parentId of skill.parents) {
            const parentScore = mastery[parentId] ?? 0;
            if (parentScore < threshold) {
                return false;
            }
        }
        return true;
    }

    public validate(): readonly SkillGraphIssue[] {
        const issues: SkillGraphIssue[] = [];
        const seen = new Set<string>();
        const edges = new Map<string, readonly string[]>();

        for (const skill of this.skillsById.values()) {
            if (seen.has(skill.id)) {
                issues.push({ kind: "duplicate", skillId: skill.id, message: "Skill id appears more than once." });
            }
            seen.add(skill.id);
            for (const parentId of skill.parents) {
                if (parentId === skill.id) {
                    issues.push({ kind: "self-parent", skillId: skill.id, message: "Skill lists itself as a prerequisite." });
                }
                if (!this.skillsById.has(parentId)) {
                    issues.push({
                        kind: "missing-parent",
                        skillId: skill.id,
                        message: `Missing prerequisite skill: ${parentId}`,
                    });
                }
            }
            edges.set(skill.id, skill.parents);
        }

        const visiting = new Set<string>();
        const visited = new Set<string>();

        function visit(skillId: string): void {
            if (visited.has(skillId)) {
                return;
            }
            if (visiting.has(skillId)) {
                issues.push({ kind: "cycle", skillId, message: "The prerequisite graph contains a cycle." });
                return;
            }
            visiting.add(skillId);
            for (const parentId of edges.get(skillId) ?? []) {
                visit(parentId);
            }
            visiting.delete(skillId);
            visited.add(skillId);
        }

        for (const skillId of this.skillsById.keys()) {
            visit(skillId);
        }

        return issues;
    }

    public topologicalOrder(): readonly SkillDefinition[] {
        const result: SkillDefinition[] = [];
        const visited = new Set<string>();

        function visit(skill: SkillDefinition, graph: SkillGraph): void {
            if (visited.has(skill.id)) {
                return;
            }
            visited.add(skill.id);
            for (const parentId of skill.parents) {
                const parent = graph.getSkill(parentId);
                if (parent !== undefined) {
                    visit(parent, graph);
                }
            }
            result.push(skill);
        }

        for (const skill of this.skillsById.values()) {
            visit(skill, this);
        }

        return result;
    }
}

export function validateSkillGraph(document: SkillGraphDocument): readonly SkillGraphIssue[] {
    return new SkillGraph(document).validate();
}

export function expandEvidenceSkills(
    graph: SkillGraph,
    missionSkills: readonly string[],
): ReadonlyMap<string, number> {
    const weights = new Map<string, number>();
    for (const skillId of missionSkills) {
        weights.set(skillId, 1);
        for (const concept of graph.getConceptAncestors(skillId)) {
            const previous = weights.get(concept.id) ?? 0;
            weights.set(concept.id, Math.max(previous, 0.25));
        }
    }
    return weights;
}

export function conceptSkillOf(skillId: string): string {
    return `concept.${skillId.split(".")[1] ?? skillId}`;
}
