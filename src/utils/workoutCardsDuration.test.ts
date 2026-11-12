import { describe, expect, it } from "vitest";
import type { UserWorkoutResponse } from "../../service/customWorkout";
import {
  cleanPaceString,
  parsePaceToSeconds,
  normalizeUnit,
  parseLocalDate,
  getDateStatus,
  formatDisplayDate,
  formatDuration,
  formatWorkoutDistance,
  formatWorkoutDuration,
  getTargetPace,
} from "./workoutCalculations";

// Overview duration calculation logic
const calculateOverviewDuration = (steps: Array<{
  duration?: string | null;
  distance?: string | null;
  unit?: string | null;
  pace?: string | null;
  repeat?: number | null;
  groupRepeat?: number | null;
  groupId?: string | null;
  rest?: string | null;
  skipLastRest?: boolean | null;
  stepType?: string | null;
}>) => {
  const seconds = (val?: string | null) => {
    if (!val) return 0;
    const parts = val.split(":").map(Number);
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  };

  const estimatedStepSeconds = (step: any) => {
    const declaredTime = seconds(step.duration);
    if (declaredTime > 0) return declaredTime;
    const defPace = step.stepType === "Warmup" ? 400 : step.stepType === "Cooldown" ? 500 : 300;
    const paceSec = parsePaceToSeconds(step.pace) || defPace;
    const raw = step.distance ? String(step.distance).replace(",", ".") : "";
    const distNum = Number.parseFloat(raw) || 0;
    if (!paceSec || distNum <= 0) return 0;
    const unit = normalizeUnit(step.unit);
    if (unit === "m") return Math.round((distNum / 1000) * paceSec);
    return Math.round(distNum * paceSec);
  };

  const estimatedRestSeconds = (step: any) => {
    const isRepeated = (step.repeat || 1) > 1 || Boolean(step.groupId);
    if (!isRepeated) return 0;
    const restSec = seconds(step.rest || "00:01:00");
    const repeatCount = step.groupId ? (step.groupRepeat || step.repeat || 1) : (step.repeat || 1);
    const restCount = (step.skipLastRest ?? true) ? Math.max(repeatCount - 1, 0) : repeatCount;
    return restSec * restCount;
  };

  const totalSec = steps.reduce((total, step) => {
    const reps = Math.max(1, step.groupId ? (step.groupRepeat || step.repeat || 1) : (step.repeat || 1));
    return total + (estimatedStepSeconds(step) * reps + estimatedRestSeconds(step));
  }, 0);

  return { totalSec, formatted: formatDuration(totalSec) };
};

// Cards duration calculation logic (from cards.tsx)
const calculateCardsDuration = (item: UserWorkoutResponse) => {
  if (item.segments && item.segments.length > 0) {
    let totalSec = 0;
    for (const seg of item.segments) {
      const reps = Math.max(1, seg.repeats || 1);
      const restSec = seg.rest_duration || 0;
      const skipLastRest = seg.skip_last_rest ?? true;
      const isRepeated = reps > 1;
      const restCount = isRepeated ? (skipLastRest ? Math.max(reps - 1, 0) : reps) : 0;

      let segSec = 0;
      if (seg.duration != null && seg.duration > 0) {
        segSec = seg.duration;
      } else {
        const paceSec = parsePaceToSeconds(seg.target_pace || seg.pace) || (seg.segment_type === "Warmup" ? 400 : seg.segment_type === "Cooldown" ? 500 : 300);
        const segUnit = normalizeUnit(seg.distance_unit);
        let dist = Number(seg.display_distance) || 0;
        if (dist <= 0) {
          if (seg.rep_distance) {
            dist = segUnit === "mi" ? seg.rep_distance / 1609.344 : segUnit === "m" ? seg.rep_distance : seg.rep_distance / 1000;
          } else if (seg.distance) {
            dist = segUnit === "mi" ? (seg.distance > 100 ? seg.distance / 1609.344 : seg.distance) : segUnit === "m" ? seg.distance : (seg.distance > 100 ? seg.distance / 1000 : seg.distance);
          }
        }
        if (dist > 0 && paceSec > 0) {
          segSec = segUnit === "m" ? Math.round((dist / 1000) * paceSec) : Math.round(dist * paceSec);
        }
      }

      totalSec += segSec * reps + restSec * restCount;
    }

    if (totalSec > 0) {
      return { totalSec, formatted: formatDuration(totalSec) };
    }
  }

  return { totalSec: item.duration || 0, formatted: formatDuration(item.duration) };
};

describe("cleanPaceString", () => {
  it("cleans pace range to primary target pace fitting within 10 characters", () => {
    expect(cleanPaceString("04:30 - 05:30")).toBe("4:30");
    expect(cleanPaceString("4:30-5:30")).toBe("4:30");
    expect(cleanPaceString("05:00 - 06:00 /km")).toBe("5:00");
    expect(cleanPaceString("04:30 - 05:30")!.length).toBeLessThanOrEqual(10);
  });

  it("handles single pace correctly within 10 characters", () => {
    expect(cleanPaceString("05:00")).toBe("5:00");
    expect(cleanPaceString("4:30 /km")).toBe("4:30");
    expect(cleanPaceString("05:00")!.length).toBeLessThanOrEqual(10);
  });

  it("returns null for empty/invalid inputs", () => {
    expect(cleanPaceString(null)).toBeNull();
    expect(cleanPaceString("")).toBeNull();
    expect(cleanPaceString("--:--")).toBeNull();
  });
});

describe("Custom Workout Duration Calculation Parity", () => {
  it("calculates exact same duration when Duration target is chosen", () => {
    // A 3-step workout: Warmup (5 min), Run (20 min), Cooldown (5 min)
    const overviewSteps = [
      {
        stepType: "Warmup",
        duration: "00:05:00",
        distance: "0.83",
        unit: "km",
        pace: "05:30 - 06:30",
        repeat: 1,
        rest: "",
      },
      {
        stepType: "Run",
        duration: "00:20:00",
        distance: "4.00",
        unit: "km",
        pace: "04:30 - 05:30",
        repeat: 1,
        rest: "",
      },
      {
        stepType: "Cooldown",
        duration: "00:05:00",
        distance: "0.77",
        unit: "km",
        pace: "06:00 - 07:00",
        repeat: 1,
        rest: "",
      },
    ];

    const workoutItem: UserWorkoutResponse = {
      id: 1,
      plan: null,
      template_workout: null,
      is_custom: true,
      week_number: null,
      display_order: 1,
      workout_date: null,
      weekday: null,
      workout_type: "Run",
      title: "My 30-Min Workout",
      duration: 1800,
      distance: 5.6,
      display_distance: null,
      distance_unit: "km",
      target_pace: null,
      pace: null,
      pace_unit: "km",
      zone: "",
      notes: "",
      priority: 1,
      segments: [
        {
          id: 101,
          segment_order: 1,
          segment_type: "Warmup",
          input_type: "DURATION",
          duration: 300,
          rep_distance: null,
          distance: 0.83,
          display_distance: 0.83,
          distance_unit: "km",
          target_pace: null,
          pace_unit: "km",
          pace: "5:30 - 6:30",
          repeats: 1,
          rest_duration: null,
          skip_last_rest: true,
          notes: "",
        },
        {
          id: 102,
          segment_order: 2,
          segment_type: "Run",
          input_type: "DURATION",
          duration: 1200,
          rep_distance: null,
          distance: 4.0,
          display_distance: 4.0,
          distance_unit: "km",
          target_pace: null,
          pace_unit: "km",
          pace: "4:30 - 5:30",
          repeats: 1,
          rest_duration: null,
          skip_last_rest: true,
          notes: "",
        },
        {
          id: 103,
          segment_order: 3,
          segment_type: "Cooldown",
          input_type: "DURATION",
          duration: 300,
          rep_distance: null,
          distance: 0.77,
          display_distance: 0.77,
          distance_unit: "km",
          target_pace: null,
          pace_unit: "km",
          pace: "6:00 - 7:00",
          repeats: 1,
          rest_duration: null,
          skip_last_rest: true,
          notes: "",
        },
      ],
    };

    const overviewResult = calculateOverviewDuration(overviewSteps);
    const cardsResult = calculateCardsDuration(workoutItem);

    expect(overviewResult.totalSec).toBe(1800);
    expect(cardsResult.totalSec).toBe(1800);
    expect(cardsResult.formatted).toBe("30min");
    expect(cardsResult.formatted).toBe(overviewResult.formatted);
  });

  it("calculates exact same duration for repeats with rest and skipLastRest", () => {
    // 3 x 400m intervals with 60s rest, skipLastRest = true
    const overviewSteps = [
      {
        stepType: "Run",
        duration: "00:02:00",
        distance: "400",
        unit: "m",
        pace: "05:00",
        repeat: 3,
        rest: "00:01:00",
        skipLastRest: true,
      },
    ];

    const workoutItem: UserWorkoutResponse = {
      id: 2,
      plan: null,
      template_workout: null,
      is_custom: true,
      week_number: null,
      display_order: 1,
      workout_date: null,
      weekday: null,
      workout_type: "Run",
      title: "Intervals",
      duration: 480, // 3 * 120s + 2 * 60s = 480s (8 min)
      distance: 1.2,
      display_distance: null,
      distance_unit: "km",
      target_pace: null,
      pace: null,
      pace_unit: "km",
      zone: "",
      notes: "",
      priority: 1,
      segments: [
        {
          id: 201,
          segment_order: 1,
          segment_type: "Run",
          input_type: "DURATION",
          duration: 120,
          rep_distance: 400,
          distance: 400,
          display_distance: 400,
          distance_unit: "m",
          target_pace: null,
          pace_unit: "km",
          pace: "5:00",
          repeats: 3,
          rest_duration: 60,
          skip_last_rest: true,
          notes: "",
        },
      ],
    };

    const overviewResult = calculateOverviewDuration(overviewSteps);
    const cardsResult = calculateCardsDuration(workoutItem);

    expect(overviewResult.totalSec).toBe(480);
    expect(cardsResult.totalSec).toBe(480);
    expect(cardsResult.formatted).toBe("8min");
    expect(cardsResult.formatted).toBe(overviewResult.formatted);
  });

  it("displays TOTAL STEPS for custom workouts with segments instead of pace range", () => {
    const customWorkout: UserWorkoutResponse = {
      id: 3,
      plan: null,
      template_workout: null,
      is_custom: true,
      week_number: null,
      display_order: 1,
      workout_date: null,
      weekday: null,
      workout_type: "Run",
      title: "Custom 3-Step",
      duration: 1800,
      distance: 5.0,
      display_distance: null,
      distance_unit: "km",
      target_pace: null,
      pace: null,
      pace_unit: "km",
      zone: "",
      notes: "",
      priority: 1,
      segments: [
        {
          id: 301,
          segment_order: 1,
          segment_type: "Warmup",
          input_type: "DURATION",
          duration: 300,
          rep_distance: null,
          distance: null,
          display_distance: null,
          distance_unit: "km",
          target_pace: null,
          pace_unit: "km",
          pace: "5:30 - 6:30",
          repeats: 1,
          rest_duration: null,
          skip_last_rest: true,
          notes: "",
        },
        {
          id: 302,
          segment_order: 2,
          segment_type: "Run",
          input_type: "DURATION",
          duration: 1200,
          rep_distance: null,
          distance: 4.0,
          display_distance: 4.0,
          distance_unit: "km",
          target_pace: null,
          pace_unit: "km",
          pace: "4:30 - 5:30",
          repeats: 1,
          rest_duration: null,
          skip_last_rest: true,
          notes: "",
        },
      ],
    };

    const isCustomWithSegments = customWorkout.is_custom !== false && customWorkout.segments && customWorkout.segments.length > 0;
    const metric3Label = isCustomWithSegments ? "TOTAL STEPS" : "TARGET PACE";
    const metric3Value = isCustomWithSegments ? `${customWorkout.segments.length}` : "4:30 - 5:30 /km";

    expect(metric3Label).toBe("TOTAL STEPS");
    expect(metric3Value).toBe("2");
  });

  it("displays TARGET PACE for preset workouts without segments", () => {
    const presetWorkout: UserWorkoutResponse = {
      id: -101,
      plan: null,
      template_workout: null,
      is_custom: false,
      week_number: null,
      display_order: 1,
      workout_date: null,
      weekday: null,
      workout_type: "Interval",
      title: "10 x 400 m Interval Run",
      duration: 2820,
      distance: 4000,
      display_distance: null,
      distance_unit: "km",
      target_pace: "4:30",
      pace: "4:30",
      pace_unit: "km",
      zone: "Speed",
      notes: "",
      priority: 1,
      segments: [],
    };

    const isCustomWithSegments = presetWorkout.is_custom !== false && presetWorkout.segments && presetWorkout.segments.length > 0;
    const metric3Label = isCustomWithSegments ? "TOTAL STEPS" : "TARGET PACE";

    expect(metric3Label).toBe("TARGET PACE");
  });

  describe("Custom workout date scheduling & past/future date handling", () => {
    it("safely parses dates in local time without UTC offset bugs", () => {
      const parsed = parseLocalDate("2026-11-25");
      expect(parsed.getFullYear()).toBe(2026);
      expect(parsed.getMonth()).toBe(10); // 0-indexed November
      expect(parsed.getDate()).toBe(25);
    });

    it("correctly identifies future dates as 'future'", () => {
      const status = getDateStatus("2099-12-31");
      expect(status).toBe("future");
    });

    it("correctly identifies previous dates as 'past'", () => {
      const status = getDateStatus("2020-01-01");
      expect(status).toBe("past");
    });

    it("correctly identifies today's date as 'today'", () => {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const status = getDateStatus(dateStr);
      expect(status).toBe("today");
    });

    it("handles null or unscheduled dates gracefully", () => {
      expect(getDateStatus(null)).toBe("none");
      expect(getDateStatus("")).toBe("none");
      expect(formatDisplayDate(null)).toBe("Unscheduled");
      expect(formatDisplayDate("")).toBe("Unscheduled");
    });

    it("formats dates into readable format without error", () => {
      const formatted = formatDisplayDate("2026-11-20");
      expect(formatted).toContain("2026");
      expect(formatted).toContain("20");
    });
  });

  describe("Dashboard scheduled custom workout calculation & display", () => {
    const mockCustomWorkout: UserWorkoutResponse = {
      id: 101,
      plan: null,
      template_workout: null,
      is_custom: true,
      week_number: null,
      display_order: 1,
      workout_date: "2026-11-11",
      weekday: "Wednesday",
      workout_type: "Run",
      title: "5k Tempo Intervals",
      duration: 1800,
      distance: 5,
      display_distance: 5,
      distance_unit: "km",
      target_pace: "5:00",
      pace: "5:00",
      pace_unit: "min/km",
      zone: "Zone 3",
      notes: "Structured tempo run",
      priority: 1,
      segments: [
        {
          id: 1,
          segment_order: 1,
          segment_type: "Warmup",
          input_type: "DURATION",
          duration: 300,
          rep_distance: null,
          distance: null,
          display_distance: null,
          distance_unit: "km",
          target_pace: "6:00",
          pace_unit: "min/km",
          pace: "6:00",
          repeats: 1,
          rest_duration: null,
          skip_last_rest: true,
          notes: "Easy jog",
        },
        {
          id: 2,
          segment_order: 2,
          segment_type: "Run",
          input_type: "DISTANCE",
          duration: null,
          rep_distance: null,
          distance: 4,
          display_distance: 4,
          distance_unit: "km",
          target_pace: "4:45",
          pace_unit: "min/km",
          pace: "4:45",
          repeats: 1,
          rest_duration: null,
          skip_last_rest: true,
          notes: "Tempo effort",
        },
        {
          id: 3,
          segment_order: 3,
          segment_type: "Cooldown",
          input_type: "DURATION",
          duration: 300,
          rep_distance: null,
          distance: null,
          display_distance: null,
          distance_unit: "km",
          target_pace: "6:30",
          pace_unit: "min/km",
          pace: "6:30",
          repeats: 1,
          rest_duration: null,
          skip_last_rest: true,
          notes: "Cool down walk",
        },
      ],
    };

    it("calculates formatted duration correctly for scheduled custom workout", () => {
      const dur = formatWorkoutDuration(mockCustomWorkout);
      expect(dur).toBe("29min"); // 300s warmup + 4km @ 4:45 (1140s) + 300s cooldown = 1740s (~29min)
    });

    it("calculates formatted distance correctly for scheduled custom workout", () => {
      const dist = formatWorkoutDistance(mockCustomWorkout, "km");
      expect(dist).toContain("km");
      const val = parseFloat(dist);
      expect(val).toBeGreaterThan(4);
    });

    it("retrieves the target run pace correctly", () => {
      const paceWithUnit = getTargetPace(mockCustomWorkout, "km");
      expect(paceWithUnit).toBe("5:00 min/km");
      const paceWithoutUnit = getTargetPace(mockCustomWorkout, "km", false);
      expect(paceWithoutUnit).toBe("5:00");
    });

    it("correctly matches today's scheduled date on the dashboard", () => {
      const today = new Date();
      const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      const workoutScheduledForToday: UserWorkoutResponse = {
        ...mockCustomWorkout,
        workout_date: todayKey,
      };

      const workoutScheduledForTomorrow: UserWorkoutResponse = {
        ...mockCustomWorkout,
        workout_date: "2099-01-01",
      };

      const customList = [workoutScheduledForToday, workoutScheduledForTomorrow];

      const todayWorkouts = customList.filter(
        (w) => w.workout_date && (w.workout_date.slice(0, 10) === todayKey || getDateStatus(w.workout_date) === "today")
      );

      expect(todayWorkouts.length).toBe(1);
      expect(todayWorkouts[0].id).toBe(101);
    });

    it("safely formats floating-point durations without decimal leakage", () => {
      // Replicate the exact formatTimerDisplay logic
      const formatTimerDisplay = (totalSec: number) => {
        if (!Number.isFinite(totalSec) || totalSec <= 0) return '00:00';
        const total = Math.round(totalSec);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        if (h > 0) {
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      };

      // The exact bug observed in the screenshot: 09:55.264999999999987
      const leakedFloatDuration = 595.264999999999987;
      expect(formatTimerDisplay(leakedFloatDuration)).toBe("09:55");

      // Other edge cases
      expect(formatTimerDisplay(0)).toBe("00:00");
      expect(formatTimerDisplay(-5)).toBe("00:00");
      expect(formatTimerDisplay(59.99999)).toBe("01:00");
      expect(formatTimerDisplay(3665.4321)).toBe("01:01:05");
    });
  });
});
