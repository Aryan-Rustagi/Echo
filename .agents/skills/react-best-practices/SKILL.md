---
name: react-best-practices
description: "Comprehensive performance optimization guide for React and Vite/Next.js applications. Use when writing React components, managing state, optimizing re-renders, or handling async data streams."
risk: safe
source: community
date_added: "2026-02-27"
---

# React Best Practices & Performance Optimization

Comprehensive performance optimization guide for React applications. Prioritized by impact to guide automated refactoring and clean code generation.

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Eliminating Waterfalls | CRITICAL | `async-` |
| 2 | Bundle Size Optimization | CRITICAL | `bundle-` |
| 3 | Re-render Optimization | MEDIUM-HIGH | `rerender-` |
| 4 | Client-Side Data Fetching & Streaming | HIGH | `client-` |
| 5 | Rendering Performance | MEDIUM | `rendering-` |
| 6 | JavaScript & Web API Performance | LOW-MEDIUM | `js-` |

---

## 1. Eliminating Waterfalls (CRITICAL)

- **`async-parallel`**: Use `Promise.all()` for independent network/async operations.
- **`async-defer-await`**: Move `await` into branches where results are actually consumed.
- **`async-stream-early`**: For streaming architectures (SSE / WebSockets / Audio), handle incoming chunks or tokens immediately rather than buffering full responses.
- **`async-abort-controllers`**: Always wire up `AbortController.signal` to cancel stale in-flight fetches when a user interrupts (barge-in / navigation).

---

## 2. Re-render Optimization (HIGH)

- **`rerender-functional-setstate`**: Use functional updates `setState(prev => ...)` to keep effect callbacks and dependencies stable.
- **`rerender-derived-state`**: Calculate derived values on the fly during render instead of duplicating them in state.
- **`rerender-memo`**: Wrap expensive calculations in `useMemo` and stable callbacks in `useCallback` when passed down to memoized child components.
- **`rerender-defer-reads`**: Don't subscribe to high-frequency state if the value is only needed inside an event callback — use a `useRef` instead.
- **`rerender-transitions`**: Use `startTransition` for non-urgent UI updates so urgent interactions (audio triggers, typing) stay snappy.

---

## 3. Web Audio & Streaming Patterns

- Keep audio processing, AudioWorklet nodes, and continuous streams isolated from UI re-render lifecycles.
- Use `useRef` for holding AudioContext, AudioBuffer queues, WebSocket connections, and SpeechRecognition instances.
- Clean up audio nodes on unmount to prevent audio thread memory leaks.

---

## 4. Bundle Size & Code Splitting

- **`bundle-dynamic-imports`**: Code-split large modal dialogs, complex settings panels, or third-party visualization libs with `React.lazy()` and `Suspense`.
- **`bundle-barrel-imports`**: Import icons and utility functions directly from their subpaths rather than importing entire packages.

---

## 5. Rendering & DOM Performance

- **`rendering-conditional-render`**: Prefer ternary expressions (`condition ? <Component /> : null`) over `condition && <Component />` to avoid rendering accidental `0` or falsy strings.
- **`rendering-hoist-jsx`**: Hoist static UI elements outside component render functions to prevent unnecessary recreation.
- **`rendering-content-visibility`**: For long lists of transcripts or logs, use `content-visibility: auto` to defer off-screen rendering.
