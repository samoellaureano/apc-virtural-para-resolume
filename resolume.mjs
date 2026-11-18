export function serverOrigin(input) {
  const url = new URL(input);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Informe um endereço HTTP local, como http://localhost:8088.");
  }
  return url.origin;
}

export async function api(origin, path, method = "GET", data, fetcher = fetch) {
  const response = await fetcher(`${origin}/api/v1${path}`, {
    method,
    ...(data === undefined ? {} : {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }),
    signal: AbortSignal.timeout(3500),
    redirect: "error"
  });
  if (!response.ok) throw new Error(`Resolume respondeu HTTP ${response.status} em ${path}.`);
  if (method === "GET") return response.json();
}

const isId = Number.isSafeInteger;
const name = (entity, fallback) => entity?.name?.value?.trim().replace("#", fallback.split(" ").at(-1)) || fallback;

export function catalog(composition) {
  if (!Array.isArray(composition?.layers) || !Array.isArray(composition.columns)) {
    throw new Error("A resposta do Webserver não contém uma composição do Arena/Avenue.");
  }
  const targets = new Map();
  function add(owner, text, kind, path, extra = {}) {
    const target = { key: `${kind}:${path}`, label: `${owner} · ${text}`, text, kind, path, ...extra };
    targets.set(target.key, target);
    return target;
  }
  function parameter(owner, text, param, audio = false) {
    if (!isId(param?.id)) return null;
    const path = `/parameter/by-id/${param.id}`;
    if (param.valuetype === "ParamRange" && Number.isFinite(param.min) && Number.isFinite(param.max) && param.min < param.max) {
      return add(owner, text, "range", path, { min: param.min, max: param.max, audio });
    }
    if (param.valuetype === "ParamBoolean") return add(owner, text, "toggle", path);
    if (["ParamTrigger", "ParamEvent"].includes(param.valuetype)) return add(owner, text, "action", `${path}/trigger`);
    return null;
  }
  function common(owner, entity) {
    return [
      parameter(owner, "Selecionar", entity.selected),
      parameter(owner, "Bypass", entity.bypassed),
      parameter(owner, "Solo", entity.solo),
      parameter(owner, "Master", entity.master),
      parameter(owner, "Volume", entity.audio?.volume, true),
      parameter(owner, "Pan", entity.audio?.pan),
      parameter(owner, "Opacidade", entity.video?.opacity)
    ].filter(Boolean);
  }
  function extras(owner, entity) {
    const entries = [
      ...Object.entries(entity.dashboard ?? {}),
      ...Object.entries(entity.video?.sourceparams ?? {}),
      ...[...(entity.audio?.effects ?? []), ...(entity.video?.effects ?? [])].flatMap(effect =>
        Object.entries(effect.params ?? {}).map(([label, param]) => [`${effect.display_name || effect.name} / ${label}`, param]))
    ];
    return entries.map(([text, param]) => parameter(owner, text, param)).filter(Boolean);
  }
  const rangeLabels = {
    transition: "Transição", duration: "Duração", transport: "Transporte", position: "Posição",
    speed: "Velocidade", tempocontroller: "Tempo", crossfader: "Crossfader", audio: "Áudio", video: "Vídeo"
  };
  const entityCollections = new Set(["layers", "layergroups", "columns", "decks", "clips", "active_clip"]);
  function remainingRanges(owner, entity) {
    const found = [];
    function visit(value, path) {
      if (!value || typeof value !== "object") return;
      if (value.valuetype) {
        if (value.valuetype !== "ParamRange" || targets.has(`range:/parameter/by-id/${value.id}`)) return;
        const target = parameter(owner, path.join(" / "), value);
        if (target) found.push(target);
        return;
      }
      for (const [part, child] of Object.entries(value)) {
        if (!entityCollections.has(part)) visit(child, part === "controls" ? path
          : [...path, rangeLabels[part] ?? child?.display_name ?? (Array.isArray(value) ? child?.name : undefined) ?? part.replaceAll("_", " ")]);
      }
    }
    visit(entity, []);
    return found;
  }
  const global = [
    add("Composição", "Desconectar tudo", "action", "/composition/disconnect-all"),
    ...common("Composição", composition),
    parameter("Composição", "Crossfader A/B", composition.crossfader?.phase),
    parameter("Tempo", "BPM", composition.tempocontroller?.tempo),
    parameter("Tempo", "Tap", composition.tempocontroller?.tempo_tap),
    parameter("Tempo", "Ressincronizar", composition.tempocontroller?.resync)
  ].filter(Boolean);
  const details = [{ label: "Composição", targets: [...extras("Composição", composition), ...remainingRanges("Composição", composition)] }];
  for (const [i, group] of (composition.layergroups ?? []).entries()) {
    const label = name(group, `Grupo ${i + 1}`);
    details.push({ label, targets: [...common(label, group), ...extras(label, group), ...remainingRanges(label, group)] });
  }
  const columns = composition.columns.map((column, i) => isId(column?.id)
    ? add("Colunas", name(column, `Coluna ${i + 1}`), "action", `/composition/columns/by-id/${column.id}/connect`)
    : null);
  const layers = composition.layers.map((layer, i) => {
    const label = `${name(layer, `Camada ${i + 1}`)} · L${i + 1}`;
    const controls = common(label, layer);
    if (isId(layer.id)) controls.unshift(add(label, "Limpar", "action", `/composition/layers/by-id/${layer.id}/clear`));
    details.push({ label, targets: [...extras(label, layer), ...remainingRanges(label, layer)] });
    const clips = (layer.clips ?? []).map((clip, col) => {
      if (!isId(clip?.id) || !clip.connected || clip.connected.value === "Empty") return null;
      const text = name(clip, `Clip ${col + 1}`);
      const owner = `${label} / C${col + 1} ${text}`;
      const path = `/composition/clips/by-id/${clip.id}`;
      details.push({ label: owner, targets: [...common(owner, clip), ...extras(owner, clip), ...remainingRanges(owner, clip)] });
      return add(label, text, "action", `${path}/connect`, { thumbnail: `${path}/thumbnail`, column: col + 1 });
    });
    if (layer.active_clip) {
      const owner = `${label} / ${name(layer.active_clip, "Clipe ativo")}`;
      details.push({ label: owner, targets: remainingRanges(owner, layer.active_clip) });
    }
    return { id: layer.id, label, controls, clips };
  }).reverse();
  return {
    name: name(composition, "Composição"),
    deck: composition.decks?.find(deck => deck.selected?.value === true)?.name?.value,
    targets, global, columns, layers, details: details.filter(group => group.targets.length)
  };
}

export function faderValue(target, position, inverted) {
  const normalized = Math.min(1, Math.max(0, position));
  const fraction = inverted ? 1 - normalized : normalized;
  const { min, max } = target;
  if (!target.audio) return min + fraction * (max - min);
  if (fraction === 0) return min;
  return Math.max(min, max + 20 * Math.log10(fraction));
}

export async function execute(origin, binding, target, position, fetcher) {
  if (target.kind === "action") return api(origin, target.path, "POST", undefined, fetcher);
  if (target.kind === "toggle") {
    const current = await api(origin, target.path, "GET", undefined, fetcher);
    if (typeof current?.value !== "boolean") throw new Error(`Estado inválido: ${target.label}.`);
    return api(origin, target.path, "PUT", { value: !current.value }, fetcher);
  }
  return api(origin, target.path, "PUT", {
    value: faderValue(target, position, binding.inverted)
  }, fetcher);
}
