export interface EngineStatus {
  state: "uninitialized" | "downloading" | "ready" | "error";
  message?: string;
}

let currentStatus: EngineStatus = { state: "uninitialized" };
const statusListeners = new Set<(status: EngineStatus) => void>();
export function onEngineStatus(listener: (status: EngineStatus) => void) {
  statusListeners.add(listener);
  listener(currentStatus);
  return () => {
    statusListeners.delete(listener);
  };
}
export function updateStatus(status: EngineStatus) {
  currentStatus = status;
  for (const listener of statusListeners) listener(status);
}
