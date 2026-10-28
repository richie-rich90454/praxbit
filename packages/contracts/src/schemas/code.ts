import { z } from "zod";

const FunctionTestSchema = z.strictObject({
    kind: z.literal("function"),
    description: z.string().min(1).max(300),
    name: z.string().min(1).max(80),
    args: z.array(z.json()).max(6),
    expected: z.json(),
});

const DomTestSchema = z.strictObject({
    kind: z.literal("dom"),
    description: z.string().min(1).max(300),
    selector: z.string().min(1).max(300),
    property: z.enum(["exists", "text", "count", "attribute"]),
    attribute: z.string().min(1).max(80).optional(),
    click: z.string().min(1).max(300).optional(),
    clickCount: z.number().int().min(1).max(10).optional(),
    expected: z.json(),
});

const CssTestSchema = z.strictObject({
    kind: z.literal("css"),
    description: z.string().min(1).max(300),
    selector: z.string().min(1).max(300),
    property: z.string().min(1).max(80),
    expected: z.string().min(1).max(120),
});

const RegexTestSchema = z.strictObject({
    kind: z.literal("regex"),
    description: z.string().min(1).max(300),
    file: z.string().min(1).max(200),
    pattern: z.string().min(1).max(600),
    flags: z.string().regex(/^[dgimsuvy]*$/).max(8),
});

const JsonTestSchema = z.strictObject({
    kind: z.literal("json"),
    description: z.string().min(1).max(300),
    file: z.string().min(1).max(200),
    path: z.array(z.union([z.string(), z.number().int()])).max(8),
    expected: z.json(),
});

const SqlTestSchema = z.strictObject({
    kind: z.literal("sql"),
    description: z.string().min(1).max(300),
    verify: z.string().min(1).max(3000).optional(),
    expectedRows: z.array(z.array(z.json())).max(50),
});

const StaticTestSchema = z.strictObject({
    kind: z.literal("static"),
    description: z.string().min(1).max(300),
    file: z.string().min(1).max(200),
    includes: z.array(z.string().min(1).max(200)).min(1),
    excludes: z.array(z.string().min(1).max(200)).max(10),
});

export const CodeTestSchema = z.discriminatedUnion("kind", [
    FunctionTestSchema,
    DomTestSchema,
    CssTestSchema,
    RegexTestSchema,
    JsonTestSchema,
    SqlTestSchema,
    StaticTestSchema,
]);
export type CodeTest = z.infer<typeof CodeTestSchema>;
