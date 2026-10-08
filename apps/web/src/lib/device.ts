import { DeviceIdSchema } from "@myriad/shared";

/** One identifier per origin/browser profile, independent of the selected student. */
export async function getDeviceId(): Promise<string> {
  return navigator.locks.request("myriad_device_id", () => {
    const stored = localStorage.getItem("myriad_device_id");
    if (stored !== null) return DeviceIdSchema.parse(stored);
    const id = crypto.randomUUID();
    // Storage failures must stop submission rather than silently fragment identity.
    localStorage.setItem("myriad_device_id", id);
    return id;
  });
}
