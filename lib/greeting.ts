/**
 * Time-aware greeting generator for the dashboards.
 *
 * Returns a short phrase that reads naturally before the user's first name,
 * e.g. "Good morning," → "Good morning, Aryan". The phrase changes with the
 * time of day (and day of week), and there's a little variety so it doesn't
 * feel robotic — the same spirit as the varied openers on a fresh chat.
 *
 * Each bucket has a couple of options; one is picked at random per load.
 */

function pick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

export function timeGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  const day = now.getDay(); // 0 = Sun, 6 = Sat
  const isWeekend = day === 0 || day === 6;
  const isFriday = day === 5;

  // Deep night — playful "you're up late" energy.
  if (h < 5) {
    return pick([
      "Burning the midnight oil,",
      "Still up,",
      "Working late,",
      "Late-night grind,",
      "The night shift,",
    ]);
  }
  // Very early morning.
  if (h < 8) {
    return pick([
      "Up early,",
      "Rise and shine,",
      "Bright and early,",
      "Early start,",
    ]);
  }
  // Morning.
  if (h < 12) {
    const base = ["Good morning,", "Morning,", "Top of the morning,"];
    if (isWeekend) base.push("Happy weekend,");
    return pick(base);
  }
  // Midday / afternoon.
  if (h < 17) {
    const base = ["Good afternoon,", "Afternoon,", "Hope your day's going well,"];
    if (isFriday) base.push("Happy Friday,");
    if (isWeekend) base.push("Happy weekend,");
    return pick(base);
  }
  // Evening.
  if (h < 21) {
    const base = ["Good evening,", "Evening,", "Winding down,"];
    if (isFriday) base.push("Happy Friday,");
    return pick(base);
  }
  // Late evening / night.
  return pick([
    "Good evening,",
    "Winding down for the day,",
    "Late one,",
    "Wrapping up,",
  ]);
}
