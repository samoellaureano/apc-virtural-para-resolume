(() => {
  const parentOrigin = location.ancestorOrigins[0];
  const token = /^#apc-picker=([\da-f-]{36})$/.exec(location.hash)?.[1];
  if (parent === window || !token || !/^chrome-extension:\/\/[a-p]{32}$/.test(parentOrigin ?? "")) return;

  const send = (type, fields = {}) => parent.postMessage({ type, token, ...fields }, parentOrigin);
  const layerHandle = ".layer .buttons > .handle";
  const selectors = [
    ".clip img.thumbnail", ".column > span", ".layer .cbs .button", ".layer .handle",
    ".composition_and_layers .composition .button", ".parameter", ".tempo_toolbar button",
    "input[type=range]", ".rotary", ".parameter.spinner input"
  ].join(",");
  let selectable = new Set(), picked = new Set(), stamps = new Map(), overlay = true;
  let entries = new Map(), lastVisible = "", scheduled = false;
  let marks;

  // The example renders no parameter IDs in its markup; use its React props, never a row index.
  function propsFrom(element) {
    const key = Object.keys(element).find(key => key.startsWith("__reactFiber$"));
    const props = [];
    for (let fiber = key && element[key]; fiber; fiber = fiber.return) {
      if (fiber.memoizedProps) props.push(fiber.memoizedProps);
    }
    return props;
  }

  function parameterKey(parameter) {
    if (!Number.isSafeInteger(parameter?.id)) return;
    const path = `/parameter/by-id/${parameter.id}`;
    if (parameter.valuetype === "ParamRange") return `range:${path}`;
    if (parameter.valuetype === "ParamBoolean") return `toggle:${path}`;
    if (["ParamTrigger", "ParamEvent"].includes(parameter.valuetype)) return `action:${path}/trigger`;
  }

  function layerProps(element) {
    return propsFrom(element).find(p => Number.isSafeInteger(p.id) && p.bypassed && p.solo);
  }

  function identify(element) {
    const props = propsFrom(element);
    const text = element.textContent.trim();
    if (element.matches(".parameter,input[type=range],.rotary,.parameter.spinner input")) {
      return parameterKey(props.find(p => p.parameter)?.parameter);
    }
    if (element.matches(".thumbnail")) {
      const clip = props.find(p => Number.isSafeInteger(p.id) && p.thumbnail);
      if (clip?.connected?.value !== "Empty" && clip) return `action:/composition/clips/by-id/${clip.id}/connect`;
      return;
    }
    if (element.matches(".column > span")) {
      const column = props.find(p => Number.isSafeInteger(p.id) && p.connected && p.selected);
      if (column) return `action:/composition/columns/by-id/${column.id}/connect`;
      return;
    }
    if (element.matches(".layer .cbs .button, .layer .handle")) {
      const layer = layerProps(element);
      if (!layer) return;
      if (element.matches(".handle")) return parameterKey(layer.selected);
      if (text === "Clear") return `action:/composition/layers/by-id/${layer.id}/clear`;
      return parameterKey(text === "B" ? layer.bypassed : text === "S" ? layer.solo : null);
    }
    if (element.matches(".composition_and_layers .composition .button")) {
      if (text === "X") return "action:/composition/disconnect-all";
      return parameterKey(props.find(p => p.parameter)?.parameter);
    }
    if (element.matches(".tempo_toolbar button")) {
      const toolbar = props.find(p => p.tempocontroller)?.tempocontroller;
      return parameterKey(text === "TAP" ? toolbar?.tempo_tap : text === "RESYNC" ? toolbar?.resync : null);
    }
  }

  function anchor(element) {
    if (!element.matches(".parameter")) return element;
    return element.querySelector(".rotary,button,input,select") ?? element;
  }

  function controlBounds(element) {
    const rect = element.getBoundingClientRect();
    const bounds = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    function clip(box, x, y) {
      if (x) {
        bounds.left = Math.max(bounds.left, box.left);
        bounds.right = Math.min(bounds.right, box.right);
      }
      if (y) {
        bounds.top = Math.max(bounds.top, box.top);
        bounds.bottom = Math.min(bounds.bottom, box.bottom);
      }
    }
    clip({ left: 0, top: 0, right: document.documentElement.clientWidth, bottom: document.documentElement.clientHeight }, true, true);
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      // The rotated master input can extend just beyond its own layer row.
      const layer = element.matches(".master input") && ancestor.matches(".layer");
      const x = layer || style.overflowX !== "visible";
      const y = layer || style.overflowY !== "visible";
      if (x || y) {
        const box = ancestor.getBoundingClientRect();
        const left = box.left + ancestor.clientLeft;
        const top = box.top + ancestor.clientTop;
        clip({ left, top, right: left + ancestor.clientWidth, bottom: top + ancestor.clientHeight }, x, y);
      }
    }
    return { ...bounds, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top };
  }

  function drawMarks() {
    const fragment = document.createDocumentFragment();
    for (const [element, key] of entries) {
      const decal = overlay && stamps.get(key);
      const selected = picked.has(key);
      if (!decal?.length && !selected && !selectable.has(key)) continue;
      const { left, top, width, height } = controlBounds(element);
      if (width <= 0 || height <= 0) continue;
      const mark = document.createElement("span");
      mark.className = "apc-mark";
      mark.toggleAttribute("data-apc-picked", selected);
      mark.toggleAttribute("data-apc-thin", height < 12);
      for (const [name, value] of Object.entries({ left, top, width, height })) mark.style[name] = `${value}px`;
      if (decal?.length) {
        mark.classList.add("apc-stamped");
        const label = document.createElement("span");
        label.className = "apc-label";
        const compact = width < 68;
        label.toggleAttribute("data-apc-narrow", width < 32);
        label.textContent = compact
          ? decal.map(text => text.replace(/^Pad /, "P").replace(/^Fader Master/, "FM")
            .replace(/^Fader /, "F").replace(/^Cena /, "C").replace(/^Faixa /, "Fx")).join(" ")
          : decal.join(" · ");
        mark.append(label);
      }
      fragment.append(mark);
    }
    marks?.replaceChildren(fragment);
  }

  function scan() {
    scheduled = false;
    for (const handle of document.querySelectorAll(layerHandle)) {
      handle.tabIndex = 0;
      handle.setAttribute("role", "button");
      handle.setAttribute("aria-pressed", String(handle.classList.contains("selected")));
    }
    const next = new Map();
    for (const element of document.querySelectorAll(selectors)) {
      const key = identify(element);
      const target = key && anchor(element);
      if (target && target.getClientRects().length) next.set(target, key);
    }
    for (const element of entries.keys()) {
      if (!next.has(element)) {
        element.removeAttribute("data-apc-selectable");
      }
    }
    entries = next;
    for (const [element, key] of entries) {
      element.toggleAttribute("data-apc-selectable", selectable.has(key));
    }
    drawMarks();
    const keys = [...new Set(entries.values())].sort();
    const signature = keys.join(" ");
    if (signature !== lastVisible) {
      lastVisible = signature;
      send("apc-visible", { keys });
    }
  }

  function scheduleScan() {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(scan);
    }
  }

  function intercept(event) {
    event.stopImmediatePropagation();
    if (event.type === "wheel") return;
    const handle = event.target.closest?.(layerHandle);
    if (handle && ["pointerdown", "mousedown", "touchstart", "touchend"].includes(event.type)) return;
    if (event.type.startsWith("key") && ["Tab", "PageUp", "PageDown", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]
      .includes(event.key) && !event.target.matches?.("input, select, textarea")) return;
    event.preventDefault();
    if (event.type === "keydown" && event.key === "Escape") send("apc-close");
    if (event.type !== "click" && !(event.type === "keydown" && ["Enter", " "].includes(event.key))) return;
    if (event.type === "keydown" && event.repeat) return;
    if (handle && !event.shiftKey) {
      const layer = layerProps(handle);
      if (layer) send("apc-select-layer", { id: layer.id });
      return;
    }
    const element = event.composedPath().find(element => entries.has(element));
    if (element && event.type === "click" && event.detail > 0) {
      const box = controlBounds(element);
      if (event.clientX < box.left || event.clientX >= box.right || event.clientY < box.top || event.clientY >= box.bottom) return;
    }
    const key = entries.get(element);
    if (selectable.has(key)) send("apc-pick", { key });
  }

  // Capture before the app registers its handlers, including controls that act on mousedown.
  for (const type of [
    "pointerdown", "pointerup", "pointercancel", "mousedown", "mouseup", "mouseout", "mouseleave",
    "click", "auxclick", "dblclick", "contextmenu", "wheel", "keydown", "keyup", "keypress",
    "touchstart", "touchend", "dragstart", "dragover", "drop", "input", "change", "submit"
  ]) {
    window.addEventListener(type, intercept, { capture: true, passive: false });
  }

  window.addEventListener("message", ({ source, origin, data }) => {
    if (source !== parent || origin !== parentOrigin || data?.type !== "apc-config" || data.token !== token) return;
    selectable = new Set(data.selectable);
    picked = new Set(data.picked);
    stamps = new Map(data.stamps);
    overlay = data.overlay;
    scheduleScan();
  });
  document.addEventListener("DOMContentLoaded", () => {
    marks = document.createElement("div");
    marks.id = "apc-marks";
    marks.setAttribute("aria-hidden", "true");
    document.body.append(marks);
    const observer = new MutationObserver(scheduleScan);
    const resize = new ResizeObserver(scheduleScan);
    for (const root of document.querySelectorAll("#grid, #controls")) {
      observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
      resize.observe(root);
    }
    window.addEventListener("scroll", scheduleScan, { capture: true, passive: true });
    window.addEventListener("resize", scheduleScan);
    scheduleScan();
  }, { once: true });
  send("apc-ready");
})();
