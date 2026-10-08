import type { TestGroup, TestVerdict, GroupVerdict } from "./schema.js";

/**
 * Computes group verdicts given problem groups and test verdicts.
 * A group passes if and only if EVERY test in that group has status "AC".
 * Score is (groupsPassed / groupsTotal).
 */
export function computeGroupVerdicts(
  groups: TestGroup[],
  testVerdicts: TestVerdict[],
): {
  groups: GroupVerdict[];
  groupsPassed: number;
  groupsTotal: number;
  score: number;
} {
  const verdictMap = new Map<number, TestVerdict["status"]>();
  for (const tv of testVerdicts) {
    verdictMap.set(tv.index, tv.status);
  }

  const groupVerdicts: GroupVerdict[] = groups.map((g) => {
    // If a group has no tests specified, it doesn't pass
    const hasTests = g.tests.length > 0;
    const allPassed =
      hasTests && g.tests.every((tIdx) => verdictMap.get(tIdx) === "AC");
    return {
      name: g.name,
      passed: allPassed,
      testIndices: g.tests,
    };
  });

  const groupsTotal = groups.length > 0 ? groups.length : 1;
  const groupsPassed = groupVerdicts.filter((gv) => gv.passed).length;
  const score = groups.length > 0 ? groupsPassed / groupsTotal : 0;

  return {
    groups: groupVerdicts,
    groupsPassed,
    groupsTotal,
    score,
  };
}

export interface SubmissionForScoring {
  id: string;
  problemId: string;
  studentId: string;
  groupsPassed: number;
  groupsTotal: number;
  createdAt: number;
}

/**
 * Resolves the best submission for a problem from a list of submissions for that student.
 * Best = highest groupsPassed, breaking ties with earlier createdAt.
 */
export function selectBestSubmission<T extends SubmissionForScoring>(
  submissions: T[],
): T | null {
  if (submissions.length === 0) return null;

  return submissions.reduce((best, curr) => {
    if (curr.groupsPassed > best.groupsPassed) {
      return curr;
    }
    if (
      curr.groupsPassed === best.groupsPassed &&
      curr.createdAt < best.createdAt
    ) {
      return curr;
    }
    return best;
  }, submissions[0]);
}
