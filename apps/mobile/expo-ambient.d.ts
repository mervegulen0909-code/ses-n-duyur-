// Committed companion to the auto-generated `expo-env.d.ts` (which Expo
// gitignores and only writes when you run an `expo` command). CI does a fresh
// checkout and never runs Expo before `tsc`, so without this reference the
// ambient Expo types — CSS modules, `global.css` side-effect imports,
// EXPO_PUBLIC_* env, typed routes — are missing and typecheck fails on
// `*.module.css` / `@/global.css` imports. A duplicate triple-slash reference
// (when the generated file is also present locally) is idempotent and harmless.
/// <reference types="expo/types" />
