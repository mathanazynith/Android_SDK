import { RunningPlanData, WorkoutDetail } from './types';

const workout = (workoutDetail: WorkoutDetail): WorkoutDetail => workoutDetail;

export const mockRunningPlan: RunningPlanData = {
  name: 'Advanced 5K',
  focus: 'Intensity Timeline',
  totalWeeks: 8,
  weeks: [
    {
      id: 'week-4',
      label: 'Week 4 of 8',
      dateRange: '23 Aug – 29 Aug',
      statusText: 'Tempo Run moved from Aug 21 to Aug 22.',
      workouts: [
        workout({ id: 'w4-mon', day: 'Mon', date: 'Aug 23', title: 'Rest Day', workoutType: 'Active recovery', iconName: 'moon-outline', accentColor: '#63C72B', isRest: true, description: 'Let your body absorb last week’s training and restore energy.', instructions: 'Keep movement light and prioritize sleep, hydration, and nourishing meals.', warmUp: 'Optional 10-minute easy walk.', steps: ['Take a full rest day from running.', 'Add gentle mobility only if it feels good.'], coolDown: 'Five minutes of relaxed breathing.', estimatedDuration: '20 min', estimatedCalories: '80 kcal', targetPace: 'Recovery', heartRateZone: 'Zone 1', distance: '—', notes: 'Skip any activity that causes discomfort.' }),
        workout({ id: 'w4-tue', day: 'Tue', date: 'Aug 24', title: 'Normal Run', workoutType: 'Easy aerobic run', iconName: 'walk-outline', accentColor: '#63C72B', description: 'A conversational effort that builds aerobic capacity without adding fatigue.', instructions: 'Run relaxed, keep your shoulders loose, and finish feeling like you could continue.', warmUp: '10 minutes easy jogging with dynamic leg swings.', steps: ['Run 5 km at an easy conversational effort.', 'Keep cadence light and steady.'], coolDown: '5 minutes easy walking and calf stretches.', estimatedDuration: '32 min', estimatedCalories: '310 kcal', targetPace: '6:10–6:30 /km', heartRateZone: 'Zone 2', distance: '5 km', notes: 'Stay slower than tempo pace.' }),
        workout({ id: 'w4-wed', day: 'Wed', date: 'Aug 25', title: 'Tempo Run', workoutType: 'Threshold effort', iconName: 'speedometer-outline', accentColor: '#63C72B', description: 'Sustain a comfortably hard effort to improve your ability to hold 5K race pace.', instructions: 'Start controlled. The tempo section should feel challenging but never all-out.', warmUp: '12 minutes easy jogging plus 3 × 20-second strides.', steps: ['Run 2 km easy.', 'Run 3 km at tempo effort.', 'Jog 1 km easy to finish.'], coolDown: '5 minutes easy walking and light stretching.', estimatedDuration: '42 min', estimatedCalories: '430 kcal', targetPace: '5:05–5:20 /km', heartRateZone: 'Zone 3–4', distance: '6 km', notes: 'Move this session a day if your legs are heavy.' }),
        workout({ id: 'w4-thu', day: 'Thu', date: 'Aug 26', title: 'Recovery Run', workoutType: 'Easy recovery', iconName: 'bicycle-outline', accentColor: '#63C72B', isRest: true, description: 'A very gentle session to encourage recovery while keeping the routine consistent.', instructions: 'Use a run-walk approach if needed and keep the effort exceptionally easy.', warmUp: '5 minutes brisk walking.', steps: ['Jog or run-walk for 25 minutes.', 'Keep breathing relaxed throughout.'], coolDown: '5 minutes walking.', estimatedDuration: '30 min', estimatedCalories: '210 kcal', targetPace: '6:40+ /km', heartRateZone: 'Zone 1–2', distance: '4 km', notes: 'Walking is an equally good choice today.' }),
        workout({ id: 'w4-fri', day: 'Fri', date: 'Aug 27', title: 'Intervals', workoutType: 'Speed interval session', iconName: 'flash-outline', accentColor: '#63C72B', description: 'Short, repeatable fast efforts develop speed and running economy for race day.', instructions: 'Run each rep smoothly and consistently. Recover fully enough to maintain form.', warmUp: '12 minutes easy jogging plus drills and strides.', steps: ['Complete 6 × 400 m at 5K effort.', 'Jog 200 m between each repeat.', 'Keep every repeat within 3 seconds of the first.'], coolDown: '10 minutes easy jogging.', estimatedDuration: '46 min', estimatedCalories: '465 kcal', targetPace: '4:35–4:45 /km', heartRateZone: 'Zone 4', distance: '7 km', notes: 'Stop early if form breaks down.' }),
        workout({ id: 'w4-sat', day: 'Sat', date: 'Aug 28', title: 'Easy Run', workoutType: 'Easy aerobic run', iconName: 'walk-outline', accentColor: '#63C72B', description: 'An easy shakeout run to keep the legs fresh before the long run.', instructions: 'Keep the route flat and the effort light from start to finish.', warmUp: '5 minutes easy jogging.', steps: ['Run 4 km easy.', 'Finish with four relaxed 15-second strides if fresh.'], coolDown: 'Walk until breathing returns to normal.', estimatedDuration: '27 min', estimatedCalories: '255 kcal', targetPace: '6:15–6:35 /km', heartRateZone: 'Zone 2', distance: '4 km', notes: 'Skip the strides if you feel tired.' }),
        workout({ id: 'w4-sun', day: 'Sun', date: 'Aug 29', title: 'Long Run', workoutType: 'Endurance run', iconName: 'trail-sign-outline', accentColor: '#63C72B', description: 'Your longest relaxed run of the week builds endurance and confidence.', instructions: 'Stay patient in the first half, drink water as needed, and keep the effort comfortable.', warmUp: '5 minutes walking then easy jogging.', steps: ['Run 9 km at a relaxed pace.', 'Take short walk breaks only if needed.', 'Finish with an easy final kilometre.'], coolDown: '5–10 minutes walking and gentle mobility.', estimatedDuration: '58 min', estimatedCalories: '590 kcal', targetPace: '6:20–6:45 /km', heartRateZone: 'Zone 2', distance: '9 km', notes: 'Choose a familiar route and bring water in warm weather.' }),
      ],
    },
    {
      id: 'week-5',
      label: 'Week 5 of 8',
      dateRange: '30 Aug – 5 Sep',
      statusText: 'Intervals are scheduled before your weekend long run.',
      workouts: [],
    },
  ],
};

mockRunningPlan.weeks[1].workouts = mockRunningPlan.weeks[0].workouts.map((item, index) => ({
  ...item,
  id: `w5-${index}`,
  date: ['Aug 30', 'Aug 31', 'Sep 1', 'Sep 2', 'Sep 3', 'Sep 4', 'Sep 5'][index],
}));
