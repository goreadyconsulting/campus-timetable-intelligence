export const teachingDays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;
export const teachingTimes = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
] as const;

export function startOfTeachingWeek(value: Date | string) {
  const date =
    typeof value === "string" ? new Date(`${value}T12:00:00`) : new Date(value);
  const day = date.getDay();
  const difference = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + difference);
  date.setHours(12, 0, 0, 0);
  return date;
}

export function addDays(value: Date, amount: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

export function addWeeks(value: Date, amount: number) {
  return addDays(value, amount * 7);
}

export function isoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function weekDates(weekStart: Date) {
  return Object.fromEntries(
    teachingDays.map((day, index) => [day, isoDate(addDays(weekStart, index))]),
  ) as Record<string, string>;
}

export function formatWeekRange(weekStart: Date) {
  const end = addDays(weekStart, 4);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const startText = weekStart.toLocaleDateString("en-GB", {
    day: "numeric",
    month: sameMonth ? undefined : "short",
  });
  const endText = end.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${startText} – ${endText}`;
}

export function formatDayDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function addDuration(start: string, hours: number) {
  const [hour, minute] = start.split(":").map(Number);
  const total = hour * 60 + minute + Math.round(hours * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
