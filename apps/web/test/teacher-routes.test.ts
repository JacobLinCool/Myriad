import { expect, it } from "vitest";
import {
  parseRoute,
  parseTeacherRoute,
  teacherPath,
} from "../src/lib/state/routes";
const parse = (path: string) =>
  parseTeacherRoute(path.split("/").filter(Boolean));
it("maps teacher addresses to views and tabs, rejecting unknown ones", () => {
  expect(parse("/teacher")).toEqual({ view: "exams" });
  expect(parse("/teacher/account")).toEqual({ view: "account" });
  expect(parse("/teacher/exams/mid%20term")).toEqual({
    view: "exam",
    examId: "mid term",
    tab: "overview",
  });
  expect(parse("/teacher/exams/a/students")).toMatchObject({ tab: "students" });
  // The overview has one address, without a tab segment.
  expect(parse("/teacher/exams/a/overview")).toBeNull();
  expect(parse("/teacher/exams/a/unknown")).toBeNull();
  expect(parse("/teacher/exams")).toBeNull();
  expect(parseRoute("/teacher/exams/a/devices").valid).toBe(true);
  expect(parseRoute("/teacher/nope").valid).toBe(false);
  expect(teacherPath("mid term")).toBe("/teacher/exams/mid%20term");
  expect(teacherPath("a", "results")).toBe("/teacher/exams/a/results");
});
