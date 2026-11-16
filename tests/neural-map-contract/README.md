# Neural Command Map contract checks

Read-only synthetic tests of the **actual TypeScript bridge** using Node 24's built-in type stripping, with no network, credentials, or dependency install. Test fixture mocks WebSocket; no production connections are opened.

The demo/LIVE contract test is deliberately red to capture an observed source-level inconsistency. It is a static contract assertion, not a browser-rendered reproduction. Once fixed, replace the expected failure with a regression test proving the UI shows DEMO for mock events and LIVE only for actual WebSocket connections.

Run: `node --test tests/neural-map-contract/*.test.mjs` (Node 24).

Limits: no complete app build, browser rendering, server authentication, live stream, tenant boundary, reconnect timing or production deployment test. Do not treat passing bridge tests as end-to-end readiness.
