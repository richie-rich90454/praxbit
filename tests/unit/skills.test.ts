import { describe, expect, it } from "vitest";
import {
    SkillGraph,
    conceptSkillOf,
    expandEvidenceSkills,
    validateSkillGraph,
} from "../../packages/domain/src/skills/graph.ts";
import { makeSkill, makeSkillDocument } from "./support/fixtures.ts";

describe("SkillGraph validation", function skillGraphValidation(): void {
    it("accepts a well-formed graph", function wellFormed(): void {
        const document = makeSkillDocument([
            makeSkill("concept.base"),
            makeSkill("concept.child", ["concept.base"]),
        ]);
        expect(validateSkillGraph(document)).toEqual([]);
    });

    it("reports a missing parent", function missingParent(): void {
        const document = makeSkillDocument([makeSkill("concept.child", ["concept.missing"])]);
        const issues = validateSkillGraph(document);
        expect(issues).toHaveLength(1);
        expect(issues[0]?.kind).toBe("missing-parent");
        expect(issues[0]?.skillId).toBe("concept.child");
    });

    it("reports a cycle", function cycle(): void {
        const document = makeSkillDocument([
            makeSkill("concept.a", ["concept.b"]),
            makeSkill("concept.b", ["concept.a"]),
        ]);
        const issues = validateSkillGraph(document);
        expect(
            issues.some(function isCycle(issue): boolean {
                return issue.kind === "cycle";
            }),
        ).toBe(true);
    });

    it("reports a self-parent", function selfParent(): void {
        const document = makeSkillDocument([makeSkill("concept.a", ["concept.a"])]);
        const issues = validateSkillGraph(document);
        expect(
            issues.some(function isSelf(issue): boolean {
                return issue.kind === "self-parent";
            }),
        ).toBe(true);
    });

    it("reports duplicate skill ids", function duplicateIds(): void {
        const document = makeSkillDocument([makeSkill("concept.a"), makeSkill("concept.a")]);
        const issues = validateSkillGraph(document);
        expect(
            issues.some(function isDuplicate(issue): boolean {
                return issue.kind === "duplicate";
            }),
        ).toBe(true);
    });
});

describe("SkillGraph expansion", function skillGraphExpansion(): void {
    it("returns concept ancestors in a stable set", function ancestors(): void {
        const graph = new SkillGraph(
            makeSkillDocument([
                makeSkill("concept.base"),
                makeSkill("concept.middle", ["concept.base"]),
                makeSkill("js.functions", ["concept.middle"], "language"),
            ]),
        );
        const conceptAncestors = graph
            .getConceptAncestors("js.functions")
            .map(function idOf(skill): string {
                return skill.id;
            });
        expect(conceptAncestors.sort()).toEqual(["concept.base", "concept.middle"]);
    });

    it("weights direct skills at one and concept ancestors at one quarter", function weights(): void {
        const graph = new SkillGraph(
            makeSkillDocument([
                makeSkill("concept.base"),
                makeSkill("js.functions", ["concept.base"], "language"),
            ]),
        );
        const weightMap = expandEvidenceSkills(graph, ["js.functions"]);
        expect(weightMap.get("js.functions")).toBe(1);
        expect(weightMap.get("concept.base")).toBe(0.25);
    });

    it("derives a concept skill id from a language skill", function conceptId(): void {
        expect(conceptSkillOf("js.conditions")).toBe("concept.conditions");
    });

    it("rejects unknown skills when required", function unknownSkill(): void {
        const graph = new SkillGraph(makeSkillDocument([makeSkill("concept.base")]));
        expect(function requireUnknown(): void {
            graph.requireSkill("concept.missing");
        }).toThrow("Unknown skill");
    });
});
