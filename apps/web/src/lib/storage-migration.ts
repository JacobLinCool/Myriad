/**
 * One-time move of browser data saved before the rename to Myriad: drafts,
 * pending submissions, identity, device ID and preferences keep working.
 * Values already under the new prefix win; failures leave the old keys alone.
 */
export function migrateStorage(storages: Storage[] = defaultStorages()) {
  for (const storage of storages) {
    try {
      const keys = Array.from({ length: storage.length }, (_, i) =>
        storage.key(i)!,
      );
      for (const key of keys) {
        if (!key.startsWith("lj_")) continue;
        const next = `myriad_${key.slice(3)}`;
        if (storage.getItem(next) === null)
          storage.setItem(next, storage.getItem(key)!);
        storage.removeItem(key);
      }
    } catch {
      // Storage may be unavailable or full; the app falls back to defaults.
    }
  }
}
function defaultStorages() {
  const storages: Storage[] = [];
  for (const get of [() => localStorage, () => sessionStorage])
    try {
      storages.push(get());
    } catch {
      // Blocked storage is skipped.
    }
  return storages;
}
