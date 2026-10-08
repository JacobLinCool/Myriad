import { draftKey } from "../api";
export const codeTemplate =
  "#include <stdio.h>\n\nint main(void) {\n    // 在這裡開始作答\n    return 0;\n}\n";
/** The active key belongs to the loaded document, never the current navigation target. */
export class Drafts {
  private key = "";
  constructor(private storage: Storage) {}
  save(code: string) {
    if (this.key) this.storage.setItem(this.key, code);
  }
  open(student: string, exam?: string, problem?: string) {
    this.key =
      student && exam && problem ? draftKey(student, exam, problem) : "";
    return this.key
      ? (this.storage.getItem(this.key) ?? codeTemplate)
      : codeTemplate;
  }
}
export function pendingKey(student: string, exam?: string) {
  return `myriad_pending:${JSON.stringify([student, exam])}`;
}
export function readSplitSize(storage: Storage) {
  const value = storage.getItem("myriad_statement_size");
  if (value === null) return 40;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 15 || number > 75) {
    storage.removeItem("myriad_statement_size");
    return 40;
  }
  return number;
}
