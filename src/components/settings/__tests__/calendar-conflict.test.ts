import { describe, expect, it } from "vitest";
import { ApiClientError } from "@/lib/client/api-errors";
import { hiddenRecordsConflict, removedWeeksText } from "../lib/calendar-conflict";

describe("RULES-1: calendar change that would hide records (409)", () => {
  const details = { weeks: ["2025-05-12", "2025-05-05"], incidents: ["NN-20250505-0001"], rewards: [] };

  it("recognises the server refusal and keeps its message", () => {
    const err = new ApiClientError(409, "CONFLICT", "Các tuần bị bỏ khỏi lịch còn 1 sự việc và 0 điểm thưởng …", details);
    expect(hiddenRecordsConflict(err)).toEqual({ message: err.message, ...details });
  });

  it("ignores other errors (stale preview 409 without details, validation, plain errors)", () => {
    expect(hiddenRecordsConflict(new ApiClientError(409, "CONFLICT", "Dữ liệu vừa được người khác thay đổi."))).toBeUndefined();
    expect(hiddenRecordsConflict(new ApiClientError(400, "VALIDATION", "x", details))).toBeUndefined();
    expect(hiddenRecordsConflict(new ApiClientError(409, "CONFLICT", "x", { weeks: [1] }))).toBeUndefined();
    expect(hiddenRecordsConflict(new Error("x"))).toBeUndefined();
  });

  it("lists the removed weeks in date order", () => {
    expect(removedWeeksText(details.weeks)).toBe("2 tuần: 05/05/2025, 12/05/2025");
    expect(removedWeeksText(["2025-05-05", "2025-05-12", "2025-05-19"], 2)).toBe("3 tuần: 05/05/2025, 12/05/2025, …");
  });
});
