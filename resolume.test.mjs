import assert from "node:assert/strict";
import { test } from "node:test";
import { catalog, execute, faderValue, serverOrigin } from "./resolume.mjs";
import { remainingTime, triggerTime } from "./scenes.mjs";

const origin = "http://localhost:8088";
const volume = { id: 21, valuetype: "ParamRange", min: -192, max: 0 };
const composition = {
  columns: [{ id: 11 }],
  layers: [{
    id: 12, audio: { volume }, clips: [
      { id: 13, connected: { value: "Disconnected" } },
      { id: 14, connected: { value: "Empty" } }
    ]
  }]
};

test("the active deck exposes occupied clips and addressable layer volume", () => {
  const map = catalog(composition);
  const layer = map.layers[0];
  assert.equal(layer.clips[0].path, "/composition/clips/by-id/13/connect");
  assert.equal(layer.clips[1], null);
  assert.equal(map.targets.get("range:/parameter/by-id/21").audio, true);
  assert.throws(() => catalog({}), /composição/);
});

test("the fader catalog includes transition and transport ranges with their owning labels", () => {
  const range = (id, max = 10) => ({ id, min: 0, max, valuetype: "ParamRange" });
  const model = catalog({
    columns: [],
    layergroups: [{ name: { value: "Grupo A" }, master: range(41, 1) }],
    layers: [{
      id: 12, transition: { duration: range(31), blend_mode: { id: 39, valuetype: "ParamChoice" } },
      clips: [{
        id: 13, connected: { value: "Connected" }, name: { value: "Intro" },
        transport: { position: range(32, 8000), controls: { speed: range(33) } }
      }],
      active_clip: { id: 13, transport: { position: range(32, 8000), controls: { duration: range(34) } } }
    }]
  });
  const target = id => model.targets.get(`range:/parameter/by-id/${id}`);
  assert.match(target(31).label, /Camada 1.*Transição \/ Duração/);
  assert.match(target(32).label, /Intro.*Transporte \/ Posição/);
  assert.equal(target(32).max, 8000);
  assert.match(target(33).label, /Intro.*Transporte \/ Velocidade/);
  assert.match(target(34).label, /Transporte \/ Duração/);
  assert.equal(target(39), undefined);
  assert.match(target(41).label, /Grupo A.*Master/);
});

test("opposed audio faders exchange endpoints and send complementary linear gains", async () => {
  const target = { ...volume, audio: true };
  assert.deepEqual([0, 1].map(x => faderValue(target, x, true)), [0, -192]);
  assert.deepEqual([0, 1].map(x => faderValue(target, x, false)), [-192, 0]);
  assert.equal(faderValue({ min: -1, max: 1 }, 0.25, true), 0.5);

  const mappedVolume = catalog(composition).targets.get("range:/parameter/by-id/21");
  for (const [position, normal, inverted] of [[0.25, 0.25, 0.75], [0.5, 0.5, 0.5], [0.75, 0.75, 0.25]]) {
    const gains = [];
    const mock = async (url, options) => {
      gains.push(10 ** (JSON.parse(options.body).value / 20));
      return new Response(null, { status: 204 });
    };
    await execute(origin, { inverted: false }, mappedVolume, position, mock);
    await execute(origin, { inverted: true }, mappedVolume, position, mock);
    assert.ok(Math.abs(gains[0] - normal) < 1e-10);
    assert.ok(Math.abs(gains[1] - inverted) < 1e-10);
  }
});

test("execution posts all requested trigger targets and writes parameter values", async () => {
  const calls = [];
  const mock = async (url, options) => {
    calls.push([url.slice(origin.length), options.method, options.body]);
    return options.method === "GET"
      ? new Response('{"value":true}') : new Response(null, { status: 204 });
  };
  const map = catalog(composition);
  await Promise.all([map.columns[0], map.layers[0].clips[0]]
    .map(target => execute(origin, {}, target, undefined, mock)));
  await execute(origin, { inverted: false }, map.targets.get("range:/parameter/by-id/21"), 1, mock);
  await execute(origin, {}, { kind: "toggle", path: "/parameter/by-id/22" }, undefined, mock);
  assert.deepEqual(calls, [
    ["/api/v1/composition/columns/by-id/11/connect", "POST", undefined],
    ["/api/v1/composition/clips/by-id/13/connect", "POST", undefined],
    ["/api/v1/parameter/by-id/21", "PUT", '{"value":0}'],
    ["/api/v1/parameter/by-id/22", "GET", undefined],
    ["/api/v1/parameter/by-id/22", "PUT", '{"value":false}']
  ]);
});

test("the extension only connects to loopback HTTP origins", () => {
  assert.equal(serverOrigin(`${origin}/`), origin);
  assert.throws(() => serverOrigin("http://localhost:8088/api"));
  assert.throws(() => serverOrigin("http://192.168.1.1:8088"));
});

test("a countdown calculates its deadline from the click and rejects invalid delays", () => {
  const due = triggerTime({ mode: "delay", seconds: 5 }, 20_000);
  assert.equal(due, 25_000);
  assert.equal(remainingTime(due, 21_001), "0:04");
  assert.equal(remainingTime(due, 26_000), "0:00");
  for (const seconds of [0, -1, 0.5, NaN]) {
    assert.throws(() => triggerTime({ mode: "delay", seconds }, 20_000), /atraso válido/);
  }
});

test("a fixed time uses the local timezone and rejects past or normalized dates", () => {
  const start = new Date(2030, 5, 1, 15, 20).getTime();
  const clock = time => triggerTime({ mode: "clock", time }, start);
  assert.equal(clock("2030-06-01T15:22"), start + 120_000);
  assert.throws(() => clock("2030-06-01T15:19"), /no futuro/);
  assert.throws(() => clock("2030-06-31T15:22"), /válidas/);
});
