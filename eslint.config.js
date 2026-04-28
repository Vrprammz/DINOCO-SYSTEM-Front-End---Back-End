/**
 * Flat ESLint config (ESLint 9+).
 *
 * Scope: liff-src/ (frontend ES modules) + tests/jest/ (Jest specs).
 * Does NOT lint:
 *   - openclawminicrm/ (own ESLint config)
 *   - rpi-print-server/ (Python)
 *   - inline JS in WP snippets (PHP files; not parseable as JS)
 *   - vendor/ + node_modules/
 *
 * Rules philosophy:
 *   - Strict on things Jest can't catch (no-undef, no-unused-vars, eqeqeq)
 *   - Lenient on style (let prettier-style choices be)
 *   - Catches real bugs only, not nitpicks
 */

const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    js.configs.recommended,

    // Browser ES modules — liff-src/
    {
        files: ["liff-src/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
                liff: "readonly",
                dinocoModal: "readonly",
            },
        },
        rules: {
            eqeqeq: ["error", "smart"],
            "no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
            "no-implicit-globals": "error",
            "prefer-const": "warn",
            "no-var": "error",
            "no-console": ["warn", { allow: ["warn", "error", "info"] }],
        },
    },

    // Chrome extension (manifest v3) — popup + content script
    // Files use plain script context (no ES modules) and access chrome.* APIs.
    {
        files: ["brand-voice-extension/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                ...globals.browser,
                chrome: "readonly",
            },
        },
        rules: {
            eqeqeq: ["error", "smart"],
            "no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
            "no-implicit-globals": "off", // popup.js / content.js are top-level scripts
            "prefer-const": "warn",
            "no-var": "warn",
            "no-console": "off", // diagnostics expected in a content script
        },
    },

    // Jest test files — Node CommonJS + jsdom + jest globals
    {
        files: ["tests/jest/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.node,
                ...globals.browser,
                ...globals.jest,
            },
        },
        rules: {
            eqeqeq: ["error", "smart"],
            "no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    caughtErrorsIgnorePattern: "^_",
                },
            ],
            "no-console": "off",
        },
    },

    // Ignore everything else
    {
        ignores: [
            "node_modules/**",
            "vendor/**",
            "openclawminicrm/**",
            "rpi-print-server/**",
            "dist/**",
            "coverage/**",
            "**/*.min.js",
        ],
    },
];
