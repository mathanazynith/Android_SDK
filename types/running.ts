export interface RunningDay {
  day: string;
  dayIndex: number;
  selected: boolean;
  isLongRun: boolean;
}
 
export interface ScheduledRun {
  day: string;
  runType: 'Easy Run' | 'Tempo Run' | 'Interval Run' | 'Long Run';
  distance: string;
  duration: string;
  pace: string;
  description: string;
}
 
export interface RunningEvent {
  id: string;
  name: string;
  date: string;
  distance: string;
  type: '5K' | '10K' | 'Half Marathon' | 'Marathon' | 'Fun Run';
  location: string;
  time: string;
  registered: boolean;
}
 
export interface RunningPlan {
  planName: string;
  planType: 'beginner_5k' | 'intermediate' | 'advanced';
  weeklyDays: number;
  totalWeeks: number;
  schedule: ScheduledRun[];
  events: RunningEvent[];
  summary: {
    totalWeeklyDistance: string;
    longRunDay: string;
    averagePace: string;
  };
}
 