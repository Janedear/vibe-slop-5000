import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve('packages/dashboard/app/components/NeuralCommandMap');
const bridgeSource = join(root, 'lib/ncm-event-bridge.ts');
const componentSource = join(root, 'NeuralCommandMap.tsx');
const dir = await mkdtemp(join(tmpdir(), 'ncm-contract-'));
await copyFile(bridgeSource, join(dir, 'bridge.mts'));
const { FusionEventBridge, MockEventGenerator } = await import(pathToFileURL(join(dir, 'bridge.mts')).href);
process.on('exit', () => { /* temporary test fixture is removed by after hook */ });
test.after(async () => rm(dir, { recursive: true, force: true }));

test('demo generator emits synthetic agents and stops cleanly', async () => {
  const generator = new MockEventGenerator();
  const events = [];
  generator.on(e => events.push(e));
  try {
    generator.start();
    assert.equal(events.filter(e => e.kind === 'agent_spawn').length, 3);
    assert.ok(events.every(e => typeof e.timestamp === 'number'));
  } finally {
    generator.stop();
  }
});

test('WebSocket bridge connects, emits valid event, ignores malformed JSON, and disconnects', () => {
  const Original = globalThis.WebSocket;
  class FakeWebSocket {
    static instances = [];
    constructor(url) { this.url = url; FakeWebSocket.instances.push(this); }
    close() { this.onclose?.(); }
  }
  globalThis.WebSocket = FakeWebSocket;
  const bridge = new FusionEventBridge('http://localhost:3001/ncm');
  const received = [], statuses = [];
  bridge.on(e => received.push(e));
  bridge.onStatus(s => statuses.push(s));
  try {
    bridge.connect();
    const ws = FakeWebSocket.instances[0];
    assert.equal(ws.url, 'ws://localhost:3001/ncm');
    ws.onopen();
    assert.equal(statuses.at(-1).source, 'fusion_ws');
    ws.onmessage({ data: '{not json' });
    assert.equal(received.length, 0);
    const event = { kind: 'agent_spawn', agentId: 'synthetic-1', name: 'Test', timestamp: 1 };
    ws.onmessage({ data: JSON.stringify(event) });
    assert.deepEqual(received, [event]);
  } finally {
    bridge.disconnect();
    globalThis.WebSocket = Original;
  }
});

test('demo/live/offline source labels are separated in the actual component', async () => {
  const src = await readFile(componentSource, 'utf8');
  assert.match(src, /new MockEventGenerator\\(\\)/);
  assert.match(src, /setConnected\\(false\\)\\s*;\\(bridge as MockEventGenerator\\)\\.start\\(\\)/);
  assert.match(src, /Boolean\\(wsUrl\\)/, 'source identity must be passed to HUD');
  assert.match(src, /!hasLiveSource\\s*\\?[^\\n]*DEMO/s, 'demo must take precedence over connected state');
  assert.match(src, /OFFLINE/, 'configured but disconnected live stream needs an offline label');
});
