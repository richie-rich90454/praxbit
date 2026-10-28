import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";

export default tseslint.config(
    {
        ignores: [
            "**/dist/**",
            "**/node_modules/**",
            "**/coverage/**",
            "**/playwright-report/**",
            "**/test-results/**",
            "apps/web/public/**",
            "apps/web/dist/**",
            "database/migrations/**",
            "content-solutions/**",
            "infra/**",
            "scripts/**",
            "*.config.*",
            "vitest.config.ts",
            "playwright.config.ts",
        ],
    },
    ...tseslint.configs.recommendedTypeChecked,
    {
        files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.mjs", "**/*.cjs"],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            "import-x": importX,
        },
        rules: {
            "no-restricted-syntax": [
                "error",
                {
                    selector: "ArrowFunctionExpression",
                    message:
                        "Use a named function or class method. Arrow functions are not allowed in authored platform code.",
                },
                {
                    selector:
                        "FunctionExpression:not([id]):not(MethodDefinition > FunctionExpression):not(Property > FunctionExpression)",
                    message: "Anonymous function expressions are not allowed. Name the function.",
                },
                {
                    selector: "TSNonNullExpression",
                    message: "Non-null assertions are not allowed. Handle the missing case.",
                },
                {
                    selector: "TSAsExpression > TSAnyKeyword",
                    message: "Casting to any is unsafe.",
                },
            ],
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-non-null-assertion": "error",
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-misused-promises": "error",
            "@typescript-eslint/consistent-type-assertions": [
                "error",
                {
                    assertionStyle: "as",
                    objectLiteralTypeAssertions: "never",
                },
            ],
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                },
            ],
            "import-x/no-cycle": ["error", { maxDepth: 5, ignoreExternal: true }],
            "import-x/no-self-import": "error",
            "no-console": "off",
            "no-eval": "error",
            "no-implied-eval": "error",
            "no-new-func": "error",
            eqeqeq: ["error", "always"],
            "prefer-const": "error",
        },
    },
    {
        files: ["packages/domain/**/*.ts", "packages/contracts/**/*.ts"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    paths: [
                        {
                            name: "solid-js",
                            message: "Portable packages cannot import the frontend framework.",
                        },
                        {
                            name: "hono",
                            message: "Portable packages cannot import the server framework.",
                        },
                        { name: "pg", message: "Portable packages cannot import PostgreSQL." },
                        {
                            name: "pixi.js",
                            message: "Portable packages cannot import the renderer.",
                        },
                        {
                            name: "dexie",
                            message: "Portable packages cannot import browser persistence.",
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ["apps/server/**/*.ts"],
        rules: {
            "no-restricted-imports": [
                "error",
                {
                    paths: [
                        {
                            name: "solid-js",
                            message: "Server business logic must not import SolidJS.",
                        },
                        {
                            name: "pixi.js",
                            message: "Server business logic must not import the renderer.",
                        },
                    ],
                },
            ],
        },
    },
    {
        files: ["**/*.test.ts", "**/*.test.tsx"],
        rules: {
            "@typescript-eslint/no-floating-promises": "off",
        },
    },
);
