/**
 * Jest config for DINOCO frontend (Phase 6).
 *
 * Scope: liff-src/shared/* pure-function modules + LIFF page JS.
 * Excludes: WordPress snippet files (PHP eval'd at runtime, not Jest-testable).
 *
 * Test environment: jsdom — needed for window.localStorage, document, etc.
 * Babel transforms: ES module syntax (import/export) via @babel/preset-env.
 */

module.exports = {
    testEnvironment: "jsdom",
    testMatch: [
        "<rootDir>/tests/jest/**/*.test.js",
    ],
    transform: {
        "^.+\\.js$": "babel-jest",
    },
    moduleFileExtensions: ["js", "json"],
    collectCoverageFrom: [
        "liff-src/shared/**/*.js",
        "!liff-src/shared/liff-init.js",
    ],
    coverageDirectory: "coverage/jest",
    coverageReporters: ["text", "html", "clover"],
    clearMocks: true,
    verbose: false,
};
