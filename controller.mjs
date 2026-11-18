import { api, catalog, execute, serverOrigin } from "./resolume.mjs";
import { remainingTime, triggerTime } from "./scenes.mjs";

const $ = id => document.getElementById(id);
const dialog = $("mapper");
const controls = new Map();
const running = new Set();
const queued = new Map();
const scheduled = new Map();
const serverKey = "apc:server";
let origin = localStorage.getItem(serverKey) || "http://localhost:8088";
let model, revision = 0, editing, draft = [], picker;
let ticker;

const mappingKey = id => `apc:${origin}:${id}`;
const mappingPrefix = "apc:http://";
const saved = id => JSON.parse(localStorage.getItem(mappingKey(id)) ?? "[]");
const scenePrefix = "apc-scene:";
const sceneStoragePrefix = `${scenePrefix}http://`;
const resetKeys = () => Object.keys(localStorage).filter(key => key.startsWith(mappingPrefix) || key.startsWith(sceneStoragePrefix));
const sceneKey = id => `${scenePrefix}${origin}:${id}`;
const isScene = id => !!id && id.startsWith("pad-");
const sceneSettings = id => JSON.parse(localStorage.getItem(sceneKey(id)) ?? '{"mode":"immediate"}');
const setStatus = (message, tone = "") => {
  $("status").textContent = message;
  $("status").dataset.tone = tone;
};

function node(tag, className = "", text = "") {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  if (tag === "button") element.type = "button";
  return element;
}

function paintControls() {
  $("clear-mappings").disabled = resetKeys().length === 0;
  for (const [id, control] of controls) {
    const bindings = saved(id);
    const scene = isScene(id) ? sceneSettings(id) : null;
    const name = scene?.name;
    const trigger = scene?.mode === "delay" ? "Contagem regressiva" : scene?.mode === "clock" ? "Data e hora marcadas" : "";
    control.badge.textContent = bindings.length || "";
    control.element.classList.toggle("mapped", bindings.length > 0);
    if (control.name) {
      control.name.textContent = name ?? "";
      control.name.hidden = !name;
    }
    if (trigger) control.element.dataset.triggerMode = scene.mode;
    else control.element.removeAttribute("data-trigger-mode");
    control.element.title = `${name ? `${name}\n` : ""}${control.label} · botão direito para configurar${trigger ? `\n${trigger}` : ""}${bindings.length
      ? `\n${bindings.map(binding => binding.label).join("\n")}` : ""}`;
    if (scene) control.element.setAttribute("aria-label", `${control.label}${name ? `: ${name}` : ""}${trigger ? ` · ${trigger}` : ""}`);
  }
}

function buildController() {
  function register(id, label, element, badge, focus = element) {
    controls.set(id, { label, element, badge });
    const open = event => {
      event.preventDefault();
      openMap(id);
    };
    element.addEventListener("contextmenu", open);
    focus.addEventListener("keydown", event => {
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) open(event);
    });
  }
  function pad(container, id, label, text, type, color) {
    const button = node("button", `key ${type}`);
    const name = isScene(id) ? node("span", "pad-name") : null;
    if (name) button.append(name);
    button.append(node("span", "key-number", text));
    const badge = node("span", "count");
    button.append(badge);
    badge.setAttribute("aria-hidden", "true");
    button.setAttribute("aria-label", label);
    if (color) button.style.setProperty("--led", color);
    const timer = node("span", "pad-timer");
    timer.hidden = true;
    timer.setAttribute("aria-hidden", "true");
    button.append(timer);
    register(id, label, button, badge);
    Object.assign(controls.get(id), { name, timer });
    button.addEventListener("click", () => activatePad(id));
    container.append(button);
  }
  const leds = ["#ff8064", "#ffa656", "#f0d260", "#8be0a4", "#59d6c6", "#61b4ff"];
  for (let row = 1; row <= 6; row++) {
    for (let col = 1; col <= 8; col++) pad($("pads"), `pad-${row}-${col}`, `Pad ${row}.${col}`, `${row}.${col}`, "pad", leds[row - 1]);
  }
  for (let i = 1; i <= 8; i++) pad($("tracks"), `track-${i}`, `Faixa ${i}`, `□ ${i}`, "track");
  for (let i = 1; i <= 9; i++) {
    const id = `fader-${i}`, label = i === 9 ? "Fader Master" : `Fader ${i}`;
    const wrapper = node("label", "fader");
    const value = node("output", "value", "0%");
    const slider = node("input");
    Object.assign(slider, { type: "range", min: 0, max: 100, value: 0 });
    slider.setAttribute("aria-label", label);
    const badge = node("span", "count");
    badge.setAttribute("aria-hidden", "true");
    slider.addEventListener("input", () => {
      value.value = `${slider.value}%`;
      if (dialog.open) return;
      queued.set(id, Number(slider.value) / 100);
      void flushFader(id);
    });
    wrapper.append(value, slider, node("span", "fader-label", i === 9 ? "MASTER" : String(i)), badge);
    register(id, label, wrapper, badge, slider);
    $("faders").append(wrapper);
  }
}

async function refresh() {
  const request = ++revision;
  const address = origin;
  model = undefined;
  setStatus("Consultando o Webserver…");
  if (dialog.open) {
    if (picker) picker.layerStatus = "";
    $("map-status").textContent = "Carregando composição…";
    $("save").disabled = !!editing;
  }
  try {
    const composition = await api(address, "/composition");
    if (request !== revision) return;
    model = catalog(composition);
    setStatus(`Conectado · ${model.name}${model.deck ? ` / ${model.deck}` : ""}`, "ok");
  } catch (error) {
    if (request !== revision) return;
    setStatus(`Falha na conexão com ${address}: ${error.message}`, "error");
  }
  if (dialog.open && picker) {
    updatePickerStatus();
    updatePicker();
    updateHiddenTargets();
  }
}

$("connection").addEventListener("submit", event => {
  event.preventDefault();
  try {
    const address = serverOrigin($("server").value.trim());
    if (address !== origin) clearTimers();
    origin = address;
    $("server").value = origin;
    localStorage.setItem(serverKey, origin);
    queued.clear();
    paintControls();
    void refresh();
  } catch (error) {
    setStatus(error.message, "error");
  }
});

function usable(target) {
  return !editing || (editing.startsWith("fader-") === (target.kind === "range"));
}

function openMap(id) {
  if (dialog.open) return;
  queued.clear();
  editing = id;
  draft = id ? saved(id) : [];
  $("scene-settings").hidden = !isScene(id);
  $("timer-notice").textContent = "";
  if (isScene(id)) {
    const scene = sceneSettings(id);
    $("scene-name").value = scene.name ?? "";
    $("scene-mode").value = scene.mode;
    $("scene-delay").value = scene.seconds ?? 5;
    $("scene-time").value = scene.time ?? "";
  }
  updateSceneFields();
  $("hidden-targets").open = false;
  $("modal-title").textContent = id ? `Parear ${controls.get(id).label}` : "Atalhos configurados";
  const layerHint = "Clique no nome da camada (Layer) para abrir suas propriedades.";
  $("modal-hint").textContent = !id ? `${layerHint} Os atalhos salvos são apenas exibidos.`
    : id.startsWith("fader-")
      ? `${layerHint} Escolha knobs ou faders e marque Invertido para fazê-los trabalhar em sentidos opostos.`
      : `${layerHint} Clique nos outros controles para parear sem acioná-los. Use Shift + clique no nome para parear a seleção da camada.`;
  $("editor").hidden = !id;
  $("save").hidden = !id;
  $("overlay").checked = true;
  $("save-status").textContent = "";
  dialog.showModal();
  mountPicker();
  void refresh();
}

function updatePicker() {
  if (!picker) return;
  const stamps = new Map();
  for (const [id, control] of controls) {
    for (const binding of id === editing ? draft : saved(id)) {
      if (!stamps.has(binding.key)) stamps.set(binding.key, []);
      stamps.get(binding.key).push(`${control.label}${binding.inverted ? " ↓" : ""}`);
    }
  }

  if (picker.ready) {
    picker.frame.contentWindow.postMessage({
      type: "apc-config", token: picker.token, overlay: $("overlay").checked,
      selectable: editing && model ? [...model.targets.values()].filter(usable).map(target => target.key) : [],
      picked: draft.map(binding => binding.key), stamps: [...stamps]
    }, origin);
  }
  renderBindings();
}

function updatePickerStatus() {
  if (picker.layerStatus) {
    $("map-status").textContent = picker.layerStatus;
  } else if (picker.ready && model) {
    $("map-status").textContent = picker.visible.size
      ? `${model.name}${model.deck ? ` / ${model.deck}` : ""} · página oficial em modo de seleção`
      : "A página abriu, mas nenhum controle foi reconhecido. Aguarde a composição ou atualize.";
  } else if (picker.ready) {
    $("map-status").textContent = "Página protegida. Aguardando os dados da composição...";
  } else {
    $("map-status").textContent = "Aguardando a página oficial...";
  }
}

function unmountPicker() {
  if (!picker) return;
  clearTimeout(picker.timeout);
  $("stage").replaceChildren();
  picker = undefined;
}

function mountPicker() {
  unmountPicker();
  $("hidden-targets").hidden = true;
  const token = crypto.randomUUID();
  const frame = node("iframe");
  frame.title = "Interface web oficial do Resolume";
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  frame.inert = true;
  frame.src = `${origin}/api/docs/example/#apc-picker=${token}`;
  picker = { token, frame, ready: false, visible: new Set() };
  picker.timeout = setTimeout(() => {
    $("map-status").textContent = "Não foi possível ativar a seleção segura. Confira a URL do Webserver e recarregue a extensão.";
  }, 8000);
  $("stage").replaceChildren(frame);
  updatePickerStatus();
  renderBindings();
}

function updateHiddenTargets() {
  const select = $("hidden-target");
  const old = select.value;
  const targets = editing && model && picker?.ready
    ? [...model.targets.values()].filter(target => target.kind === "range" && usable(target)
      && !picker.visible.has(target.key) && !draft.some(binding => binding.key === target.key))
    : [];
  $("hidden-targets").hidden = !targets.length;
  select.replaceChildren(...targets.map(target => new Option(target.label, target.key)));
  if (targets.some(target => target.key === old)) select.value = old;
}

function toggleBinding(key) {
  const target = model?.targets.get(key);
  if (!editing || !target || !usable(target)) return;
  if (draft.some(binding => binding.key === key)) draft = draft.filter(binding => binding.key !== key);
  else draft.push({ key: target.key, label: target.label, inverted: false });
  updatePicker();
  updateHiddenTargets();
}

async function selectLayer(id) {
  const current = picker;
  const request = {};
  current.layerRequest = request;
  const layer = Number.isSafeInteger(id) && model?.layers.find(layer => layer.id === id);
  if (!layer) {
    current.layerStatus = "Camada indisponível. Atualize a composição e tente novamente.";
    updatePickerStatus();
    return;
  }
  current.layerStatus = "";
  try {
    await api(origin, `/composition/layers/by-id/${id}/select`, "POST");
  } catch (error) {
    if (picker !== current || current.layerRequest !== request) return;
    current.layerStatus = `Não foi possível selecionar ${layer.label}: ${error.message}`;
    updatePickerStatus();
  }
}

window.addEventListener("message", ({ source, origin: sender, data }) => {
  if (!dialog.open || !picker || source !== picker.frame.contentWindow || sender !== origin
      || data?.token !== picker.token) return;
  if (data.type === "apc-ready") {
    clearTimeout(picker.timeout);
    picker.ready = true;
    picker.frame.inert = false;
    updatePicker();
  } else if (data.type === "apc-visible" && Array.isArray(data.keys)) {
    picker.visible = new Set(data.keys);
  } else if (data.type === "apc-pick" && picker.ready && picker.visible.has(data.key)) {
    toggleBinding(data.key);
  } else if (data.type === "apc-select-layer" && picker.ready) {
    void selectLayer(data.id);
  } else if (data.type === "apc-close") {
    dialog.close();
    return;
  }
  updatePickerStatus();
  updateHiddenTargets();
});

function renderBindings() {
  if (!editing) return;
  $("save").disabled = false;
  const list = $("bindings");
  list.replaceChildren();
  if (!draft.length) list.append(node("li", "muted", "Nenhum componente pareado."));
  for (const [index, binding] of draft.entries()) {
    const item = node("li");
    const suffix = model && !model.targets.has(binding.key) ? " (fora do deck ou indisponível)" : "";
    item.append(node("span", "", binding.label + suffix));
    if (editing.startsWith("fader-")) {
      const label = node("label", "invert");
      const toggle = node("input");
      toggle.type = "checkbox";
      toggle.checked = binding.inverted;
      toggle.setAttribute("aria-label", `Invertido: ${binding.label}`);
      toggle.addEventListener("change", () => {
        binding.inverted = toggle.checked;
        updatePicker();
        $("bindings").querySelectorAll(".invert input")[index]?.focus({ preventScroll: true });
      });
      label.append(toggle, " Invertido");
      item.append(label);
    }
    const remove = node("button", "", "Remover");
    remove.addEventListener("click", () => {
      draft.splice(index, 1);
      updatePicker();
      updateHiddenTargets();
      $("save").focus({ preventScroll: true });
    });
    item.append(remove);
    list.append(item);
  }
}

function updateSceneFields() {
  const mode = isScene(editing) ? $("scene-mode").value : "immediate";
  $("scene-delay-field").hidden = mode !== "delay";
  $("scene-time-field").hidden = mode !== "clock";
  $("save").textContent = isScene(editing) ? (mode === "clock" ? "Salvar e agendar" : "Salvar cena") : "Salvar pareamentos";
  $("scene-help").textContent = mode === "clock"
    ? "O pad dispara uma vez no horário escolhido. Mantenha esta aba aberta."
    : mode === "delay" ? "O clique no pad inicia a contagem. Mantenha esta aba aberta." : "";
}

function paintTimers(now = Date.now()) {
  for (const [id, control] of controls) {
    if (!control.timer) continue;
    const job = scheduled.get(id);
    control.element.classList.toggle("armed", !!job);
    control.timer.hidden = !job;
    if (job) {
      const remaining = remainingTime(job.due, now);
      if (control.timer.textContent !== remaining) control.timer.textContent = remaining;
    }
  }
  $("timer-bar").hidden = !scheduled.size;
  const summary = `${scheduled.size} ${scheduled.size === 1 ? "disparo agendado" : "disparos agendados"}`;
  if ($("timer-summary").textContent !== summary) $("timer-summary").textContent = summary;
  if (!scheduled.size && ticker !== undefined) {
    clearInterval(ticker);
    ticker = undefined;
  }
}

function clearTimers() {
  scheduled.clear();
  paintTimers();
}

function tick() {
  const now = Date.now();
  for (const [id, job] of scheduled) {
    if (job.due > now) continue;
    scheduled.delete(id);
    const label = controls.get(id).label;
    if (job.bindings !== localStorage.getItem(mappingKey(id))) {
      setStatus(`${label}: disparo cancelado porque os pareamentos mudaram.`, "error");
    } else if (dialog.open) {
      const notice = `${label}: disparo cancelado porque o mapa estava aberto.`;
      $("timer-notice").textContent = notice;
      setStatus(notice, "error");
    } else {
      void run(id);
    }
  }
  paintTimers(now);
}

function armPad(id, due) {
  scheduled.set(id, { due, bindings: localStorage.getItem(mappingKey(id)) });
  if (ticker === undefined) ticker = setInterval(tick, 200);
  paintTimers();
  setStatus(`${controls.get(id).label} agendado para ${new Date(due).toLocaleString("pt-BR")}.`, "ok");
}

function activatePad(id) {
  if (scheduled.delete(id)) {
    paintTimers();
    return setStatus(`${controls.get(id).label} · agendamento cancelado.`);
  }
  if (!isScene(id) || !saved(id).length) return void run(id);
  const scene = sceneSettings(id);
  if (scene.mode === "immediate") return void run(id);
  try {
    armPad(id, triggerTime(scene));
  } catch (error) {
    setStatus(error.message, "error");
  }
}

$("scene-mode").addEventListener("change", updateSceneFields);
$("cancel-timers").addEventListener("click", () => {
  clearTimers();
  setStatus("Agendamentos cancelados.");
});
$("close").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => {
  if (!dialog.open) unmountPicker();
});
$("overview").addEventListener("click", () => openMap(null));
$("clear-mappings").addEventListener("click", () => {
  if (!window.confirm("Excluir todos os pareamentos, nomes e configurações de disparo dos pads de todos os endereços salvos do Resolume? Os agendamentos ativos serão cancelados. Esta ação não pode ser desfeita.")) return;
  queued.clear();
  clearTimers();
  try {
    for (const key of resetKeys()) localStorage.removeItem(key);
    setStatus("Pareamentos removidos. Os pads voltaram ao nome padrão e ao disparo imediato.", "ok");
  } catch (error) {
    setStatus(`Não foi possível limpar os pareamentos: ${error.message}`, "error");
  }
  paintControls();
});
$("refresh").addEventListener("click", () => {
  mountPicker();
  void refresh();
});
$("overlay").addEventListener("change", updatePicker);
$("add-hidden").addEventListener("click", () => toggleBinding($("hidden-target").value));
$("save").addEventListener("click", () => {
  try {
    let scene, due;
    if (isScene(editing)) {
      scene = { name: $("scene-name").value.trim(), mode: $("scene-mode").value };
      if (scene.mode === "delay") {
        scene.seconds = $("scene-delay").valueAsNumber;
        triggerTime(scene);
      } else if (scene.mode === "clock") {
        if (!draft.length) throw new Error("Associe pelo menos um componente antes de agendar.");
        scene.time = $("scene-time").value;
        due = triggerTime(scene);
      }
    }
    if (draft.length) localStorage.setItem(mappingKey(editing), JSON.stringify(draft));
    else localStorage.removeItem(mappingKey(editing));
    if (scene) localStorage.setItem(sceneKey(editing), JSON.stringify(scene));
    const label = controls.get(editing).label;
    scheduled.delete(editing);
    paintTimers();
    paintControls();
    dialog.close();
    if (due !== undefined) armPad(editing, due);
    else setStatus(`${label} · ${draft.length} pareamento(s) salvo(s).`, "ok");
  } catch (error) {
    $("save-status").textContent = `Não foi possível salvar: ${error.message}`;
  }
});
window.addEventListener("storage", event => {
  if (event.storageArea !== localStorage) return;
  if (event.key?.startsWith(sceneStoragePrefix)) {
    paintControls();
    return;
  }
  if (!event.key?.startsWith(mappingPrefix)) return;
  if (event.key.startsWith(`apc:${origin}:`)) {
    const id = event.key.slice(`apc:${origin}:`.length);
    if (scheduled.has(id) && scheduled.get(id).bindings !== event.newValue) {
      scheduled.delete(id);
      paintTimers();
      setStatus(`${controls.get(id).label}: disparo cancelado porque os pareamentos mudaram.`, "error");
    }
  }
  paintControls();
  if (dialog.open && event.key.startsWith(`apc:${origin}:`)) updatePicker();
});

async function run(id, position) {
  if (dialog.open || running.has(id)) return;
  const control = controls.get(id);
  const mappings = saved(id);
  if (!mappings.length) {
    if (position === undefined) setStatus(`${control.label} ainda não está pareado.`);
    return;
  }
  if (!model) return setStatus("Conecte-se ao Webserver antes de acionar os pareamentos.", "error");
  const address = origin;
  const request = revision;
  const key = mappingKey(id);
  const active = mappings.map(binding => [binding, model.targets.get(binding.key)]);
  const liveFetch = (url, options) => {
    if (dialog.open || request !== revision || localStorage.getItem(key) === null) {
      throw new Error("Comando cancelado: o mapa foi alterado.");
    }
    return fetch(url, options);
  };
  running.add(id);
  control.element.classList.add("firing");
  try {
    const results = await Promise.allSettled(active.map(([binding, target]) => {
      if (!target || (target.kind === "range") !== (position !== undefined)) {
        return Promise.reject(new Error(`${binding.label}: alvo não encontrado. Atualize o mapa ou refaça o pareamento.`));
      }
      return execute(address, binding, target, position, liveFetch);
    }));
    if (request !== revision || localStorage.getItem(key) === null) return;
    const errors = results.filter(result => result.status === "rejected");
    if (errors.length) setStatus(`${control.label}: ${results.length - errors.length}/${results.length} enviados. ${errors[0].reason.message}`, "error");
    else setStatus(`${control.label} · ${results.length} comando(s) enviado(s).`, "ok");
  } finally {
    control.element.classList.remove("firing");
    running.delete(id);
  }
}

async function flushFader(id) {
  if (running.has(id)) return;
  while (queued.has(id) && !dialog.open) {
    const next = queued.get(id);
    queued.delete(id);
    await run(id, next);
  }
}

$("server").value = origin;
buildController();
paintControls();
void refresh();
