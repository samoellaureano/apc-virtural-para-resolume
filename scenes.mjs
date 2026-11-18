export function triggerTime({ mode, seconds, time }, now = Date.now()) {
  if (mode === "immediate") return now;
  if (mode === "delay") {
    const due = now + Number(seconds) * 1000;
    if (Number.isSafeInteger(Number(seconds)) && Number(seconds) >= 1 && Number.isFinite(new Date(due).getTime())) return due;
    throw new Error("Informe um atraso válido em segundos inteiros (mínimo 1).");
  }
  const date = new Date(time);
  const local = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()]
    .map(value => String(value).padStart(2, "0"));
  const formatted = `${local.slice(0, 3).join("-")}T${local.slice(3).join(":")}`;
  if (mode !== "clock" || time !== formatted || date.getTime() <= now) {
    throw new Error("Escolha uma data e hora locais válidas, no futuro.");
  }
  return date.getTime();
}

export function remainingTime(due, now = Date.now()) {
  const total = Math.max(0, Math.ceil((due - now) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const seconds = String(total % 60).padStart(2, "0");
  if (hours > 99) return `${Math.ceil(hours / 24)}d`;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
