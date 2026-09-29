import { describe, expect, it } from "vitest";
import { FIXTURE_CASES } from "../../../fixtures/corpus.js";
import { assessRisk } from "./index.js";

describe("Gate 1 fixture corpus", () => {
  it.each(FIXTURE_CASES.map((item) => [item.id, item] as const))(
    "%s produces its deterministic expected status and reasons",
    (_id, fixture) => {
      const assessment = assessRisk(fixture.market.observation, {
        assessedAt: "2026-09-29T00:00:00.000Z",
      });
      expect(assessment.integrityStatus).toBe(fixture.expected.integrityStatus);
      expect(assessment.derivativesStatus).toBe(fixture.expected.derivativesStatus);
      const reasonCodes = [...assessment.rejectionReasons, ...assessment.warnings].map(
        ({ code }) => code,
      );
      for (const expectedCode of fixture.expected.reasonCodes) {
        expect(reasonCodes).toContain(expectedCode);
      }
    },
  );
});
