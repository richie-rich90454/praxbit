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
    flags: z
        .string()
        .regex(/^[dgimsuvy]*$/)
        .max(8),
    invert: z.boolean().optional(),
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

export const AstNodeKindSchema = z.enum([
    "function-declaration",
    "function-call",
    "import",
    "class-declaration",
    "return-statement",
    "if-statement",
    "for-statement",
    "variable-declaration",
]);
export type AstNodeKind = z.infer<typeof AstNodeKindSchema>;

export const AstNodeMatcherSchema = z.strictObject({
    node: AstNodeKindSchema,
    name: z.string().min(1).max(120).optional(),
    min: z.number().int().min(1).max(50).optional(),
});
export type AstNodeMatcher = z.infer<typeof AstNodeMatcherSchema>;

export const CodeVerificationSchema = z.enum(["execution", "ast", "structural", "simulation"]);
export type CodeVerification = z.infer<typeof CodeVerificationSchema>;

const AstTestSchema = z.strictObject({
    kind: z.literal("ast"),
    description: z.string().min(1).max(300),
    file: z.string().min(1).max(200),
    language: z.enum(["javascript", "typescript"]),
    require: z.array(AstNodeMatcherSchema).min(1).max(12),
    forbid: z.array(AstNodeMatcherSchema).max(12).optional(),
});

export const CodeTestSchema = z.discriminatedUnion("kind", [
    FunctionTestSchema,
    DomTestSchema,
    CssTestSchema,
    RegexTestSchema,
    JsonTestSchema,
    SqlTestSchema,
    StaticTestSchema,
    AstTestSchema,
]);
export type CodeTest = z.infer<typeof CodeTestSchema>;
