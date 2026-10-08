// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { migrateStorage } from "../src/lib/storage-migration";
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
it("moves data saved under the old prefix without overwriting newer values", () => {
  const draft = `lj_draft:${JSON.stringify(["guest:s1", "exam", "p"])}`;
  localStorage.setItem(draft, "int main(void){}");
  localStorage.setItem("lj_device_id", "old-device");
  localStorage.setItem("myriad_device_id", "new-device");
  localStorage.setItem("lj_student_id", "s1");
  sessionStorage.setItem("lj_preview", "exam");
  localStorage.setItem("unrelated", "kept");
  migrateStorage();
  expect(
    localStorage.getItem(
      `myriad_draft:${JSON.stringify(["guest:s1", "exam", "p"])}`,
    ),
  ).toBe("int main(void){}");
  expect(localStorage.getItem("myriad_device_id")).toBe("new-device");
  expect(localStorage.getItem("myriad_student_id")).toBe("s1");
  expect(sessionStorage.getItem("myriad_preview")).toBe("exam");
  expect(localStorage.getItem("unrelated")).toBe("kept");
  expect(
    Object.keys(localStorage).filter((key) => key.startsWith("lj_")),
  ).toEqual([]);
});
