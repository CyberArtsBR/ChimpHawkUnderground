import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameMetrics } from '../src/graphics/FrameMetrics.js';

function fixture({ supported = true } = {}) {
  const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
  const created = [], deleted = [];
  let current = null, disjoint = false;
  const gl = {
    CURRENT_QUERY: 3, QUERY_RESULT_AVAILABLE: 4, QUERY_RESULT: 5,
    getExtension: () => supported ? ext : null,
    getQuery: () => current,
    createQuery() { const query = { available: false, ns: 0 }; created.push(query); return query; },
    beginQuery(_target, query) { current = query; }, endQuery() { current = null; },
    getParameter: () => disjoint,
    getQueryParameter: (query, parameter) => parameter === gl.QUERY_RESULT_AVAILABLE ? query.available : query.ns,
    deleteQuery: query => deleted.push(query),
  };
  const renderer = { getContext: () => gl, info: { autoReset: true,
    reset() {}, render: { calls: 42, triangles: 123 }, memory: { geometries: 3, textures: 4 } } };
  const metrics = new FrameMetrics(renderer);
  metrics.setEnabled(true);
  return { metrics, renderer, created, deleted, current: () => current, setDisjoint: value => { disjoint = value; } };
}

test('GPU query completion has a unique serial; a held GPU value is not another sample', () => {
  const { metrics, created } = fixture();
  metrics.begin(1); metrics.end(3);
  assert.equal(metrics.value.gpuSampleSerial, 0);
  assert.equal(metrics.value.gpuSampleFresh, false);
  created[0].available = true; created[0].ns = 2_500_000;
  metrics.begin(11); metrics.end(13);
  assert.equal(metrics.value.gpuMs, 2.5);
  assert.equal(metrics.value.gpuSampleSerial, 1);
  assert.equal(metrics.value.gpuSampleFresh, true);
  metrics.begin(21); metrics.end(24);
  assert.equal(metrics.value.gpuMs, 2.5, 'last valid result remains available to the HUD');
  assert.equal(metrics.value.gpuSampleSerial, 1, 'a collector can reject the unchanged result');
  assert.equal(metrics.value.gpuSampleFresh, false);
  assert.equal(metrics.value.cpuSubmitMs, 3);
  assert.equal(metrics.value.cpuSubmitScope, 'graphicsPipeline.render');
});

test('disjoint and suspend discard outstanding route timings without reusing serials', () => {
  const { metrics, created, deleted, renderer, current, setDisjoint } = fixture();
  metrics.begin(1); metrics.end(2);
  created[0].available = true; created[0].ns = 1_000_000;
  metrics.begin(11); metrics.end(12);
  assert.equal(metrics.value.gpuSampleSerial, 1);
  setDisjoint(true);
  metrics.begin(21); metrics.end(22);
  assert.equal(metrics.pending.length, 0);
  assert.equal(metrics.value.gpuMs, null);
  assert.equal(metrics.value.gpuSampleFresh, false);
  assert.equal(metrics.value.gpuSampleSerial, 1);
  setDisjoint(false);
  metrics.begin(31); metrics.end(32);
  metrics.begin(41);
  assert.equal(renderer.info.autoReset, false);
  metrics.suspend();
  assert.equal(current(), null);
  assert.equal(renderer.info.autoReset, true);
  assert.equal(deleted.length, created.length);
  assert.equal(metrics.pending.length, 0);
  assert.equal(metrics.samples.length, 0);
  assert.equal(metrics.last, null);
  metrics.begin(51); metrics.end(52);
  created.at(-1).available = true; created.at(-1).ns = 3_000_000;
  metrics.begin(61); metrics.end(62);
  assert.equal(metrics.value.gpuSampleSerial, 2);
  assert.equal(metrics.value.gpuMs, 3);
});

test('unsupported timer queries still report renderer CPU/calls and dispose safely', () => {
  const { metrics, renderer, created } = fixture({ supported: false });
  metrics.begin(10); metrics.end(14);
  assert.equal(metrics.value.gpuSupported, false);
  assert.equal(metrics.value.gpuSampleFresh, false);
  assert.equal(metrics.value.gpuSampleSerial, 0);
  assert.equal(metrics.value.cpuSubmitMs, 4);
  assert.equal(metrics.value.calls, 42);
  assert.equal(renderer.info.autoReset, true);
  metrics.setEnabled(false);
  metrics.begin(20); metrics.end(21);
  metrics.dispose();
  assert.equal(created.length, 0);
});
