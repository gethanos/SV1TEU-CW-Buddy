/*
Copyright (c) 2026 Georgalas Athanasios Antonios, SV1TEU

This software is released under the MIT License.
See the LICENSE file in the repository root for full license text.
*/

/* global importScripts, ort, DeepCWCore */
importScripts("ai-decoder-core.js");

const SAMPLE_RATE = 3200;
const STEP_SAMPLES = SAMPLE_RATE * DeepCWCore.STEP_SECONDS;
const SLOW_BACKLOG_SECONDS = 4;   // fall behind this much → report "slow"

let decoder = null;
let busy = false;
let pendingSamples = 0;           // received but not yet covered by a step
let stopping = false;

function post(msg) { self.postMessage(msg); }

async function init({ ortBase, modelUrl }) {
  try {
    importScripts(ortBase + "ort.wasm.min.js");
    ort.env.wasm.wasmPaths = ortBase;
    // Multithreading needs cross-origin isolation (COOP/COEP); stay single-threaded.
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(modelUrl, { executionProviders: ["wasm"] });
    decoder = new DeepCWCore.StreamingDecoder(ort, session);
    post({ type: "ready" });
  } catch (err) {
    post({ type: "error", stage: "init", message: String(err && err.message || err) });
  }
}

async function pump() {
  if (busy || !decoder) return;
  busy = true;
  try {
    while (pendingSamples >= STEP_SAMPLES && !stopping) {
      const backlog = pendingSamples / SAMPLE_RATE;
      pendingSamples -= STEP_SAMPLES;
      const t0 = performance.now();
      const r = await decoder.step();
      const ms = performance.now() - t0;
      post({ type: "step", tone: r.tone, committed: r.committed, pending: r.pending, stepMs: ms, backlog });
      if (backlog > SLOW_BACKLOG_SECONDS) post({ type: "slow", backlog });
    }
  } catch (err) {
    post({ type: "error", stage: "decode", message: String(err && err.message || err) });
  } finally {
    busy = false;
  }
}

self.onmessage = async (e) => {
  const msg = e.data;
  switch (msg.type) {
    case "init":
      await init(msg);
      break;
    case "audio":
      if (!decoder || stopping) return;
      decoder.push(msg.samples);
      pendingSamples += msg.samples.length;
      pump();
      break;
    case "tune":
      if (decoder) decoder.setManualTone(msg.hz);
      break;
    case "start":
      stopping = false;
      pendingSamples = 0;
      if (decoder) decoder.reset();
      break;
    case "stop": {
      stopping = true;
      while (busy) await new Promise((r) => setTimeout(r, 20));
      let committed = "";
      try {
        if (decoder) committed = (await decoder.flush()).committed;
      } catch (err) {
        post({ type: "error", stage: "flush", message: String(err && err.message || err) });
      }
      post({ type: "stopped", committed });
      break;
    }
  }
};
