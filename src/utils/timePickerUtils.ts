export const DEFAULT_TIME_VALUE = '01:00:00';

export interface TimeParts {
  hours: number;
  minutes: number;
  seconds: number;
}

export const parseTimeComponent = (part: string, maxValue: number) => {
  const parsed = Number.parseInt(part, 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), maxValue) : 0;
};

export const parseTimeValue = (
  timeValue: string | undefined,
  maxHours: number,
  allowEmpty = false,
): TimeParts => {
  const parts = String(timeValue || (allowEmpty ? '00:00:00' : DEFAULT_TIME_VALUE)).split(':');
  return {
    hours: parseTimeComponent(parts[0] || '0', maxHours),
    minutes: parseTimeComponent(parts[1] || '0', 59),
    seconds: parseTimeComponent(parts[2] || '0', 59),
  };
};

export const formatTimeValue = ({ hours, minutes, seconds }: TimeParts): string =>
  `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

/**
 * Calculates updated time parts and rollover delta when scrolling a wheel axis.
 *
 * - Scrolling seconds past 59 to 00 wraps around and increments minutes (+1).
 * - Scrolling seconds backward past 00 to 59 wraps around and decrements minutes (-1).
 * - Scrolling minutes past 59 to 00 wraps around and increments hours (+1).
 * - Scrolling minutes backward past 00 to 59 wraps around and decrements hours (-1).
 * - Hours can be scrolled independently to any value between 0 and maxHours.
 */
export const calculateRolloverTime = (
  currentTime: TimeParts,
  axis: 'seconds' | 'minutes' | 'hours',
  newIndex: number,
  prevIndex: number,
  maxHours: number = 99,
): { nextTime: TimeParts; cycleDelta: number } => {
  if (axis === 'hours') {
    const nextHours = Math.max(0, Math.min(newIndex, maxHours));
    return {
      nextTime: { ...currentTime, hours: nextHours },
      cycleDelta: 0,
    };
  }

  const prevCycle = Math.floor(prevIndex / 60);
  const newCycle = Math.floor(newIndex / 60);
  const cycleDelta = newCycle - prevCycle;
  const newValue = ((newIndex % 60) + 60) % 60;

  if (axis === 'seconds') {
    if (cycleDelta === 0) {
      return {
        nextTime: { ...currentTime, seconds: newValue },
        cycleDelta: 0,
      };
    }

    const currentTotalMinutes = currentTime.hours * 60 + currentTime.minutes;
    let nextTotalMinutes = currentTotalMinutes + cycleDelta;
    if (nextTotalMinutes < 0) {
      nextTotalMinutes = 0;
    }

    const nextHours = Math.min(maxHours, Math.floor(nextTotalMinutes / 60));
    const nextMinutes = nextTotalMinutes % 60;

    return {
      nextTime: {
        hours: nextHours,
        minutes: nextMinutes,
        seconds: newValue,
      },
      cycleDelta,
    };
  }

  // axis === 'minutes'
  if (cycleDelta === 0) {
    return {
      nextTime: { ...currentTime, minutes: newValue },
      cycleDelta: 0,
    };
  }

  let nextHours = currentTime.hours + cycleDelta;
  if (nextHours < 0) {
    nextHours = 0;
  } else if (nextHours > maxHours) {
    nextHours = maxHours;
  }

  return {
    nextTime: {
      hours: nextHours,
      minutes: newValue,
      seconds: currentTime.seconds,
    },
    cycleDelta,
  };
};
