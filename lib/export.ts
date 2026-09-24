import type { AppData, Session } from "@/types";

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const escape = (value: unknown) => {
    const raw = value === null || value === undefined ? "" : String(value);
    const text = /^[=+@-]/.test(raw) ? "\'" + raw : raw;
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((header) => escape(row[header])).join(","),
    ),
  ].join("\n");
  downloadBlob(filename, csv, "text/csv;charset=utf-8");
}

export function downloadJson(filename: string, value: unknown) {
  downloadBlob(
    filename,
    JSON.stringify(value, null, 2),
    "application/json;charset=utf-8",
  );
}

export function timetableRows(
  sessions: Session[],
  weekDates?: Record<string, string>,
) {
  return sessions.map((session) => ({
    Date: session.date || weekDates?.[session.day] || "Recurring",
    Day: session.day,
    TimeZone: session.timeZone || "",
    StartUTC: session.startAtUtc || "",
    EndUTC: session.endAtUtc || "",
    TeachingWeek: session.teachingWeek || "",
    Source: session.source || "Base",
    SeriesID: session.seriesId || "",
    VariantID: session.variantId || "",
    Start: session.start,
    End: session.end,
    Module: session.moduleCode,
    ModuleName: session.moduleName,
    Course: session.course,
    Staff: session.lecturer,
    Location: session.room,
    Campus: session.campus,
    LegacyGroup: session.group,
    IndividualStudentIDs: (session.studentIds || []).join("|"),
    Enrolled: session.enrolled,
    Capacity: session.capacity,
    Status: session.status || "Scheduled",
    Conflict: session.conflict || "",
  }));
}

export function roomReportRows(data: AppData) {
  return data.rooms.map((room) => {
    const sessions = data.sessions.filter(
      (session) => session.room === room.room && session.campus === room.campus,
    );
    return {
      Location: room.room,
      Building: room.building,
      Campus: room.campus,
      Type: room.type,
      Capacity: room.capacity,
      Status: room.status,
      ScheduledSessions: sessions.length,
      AssignedStudents: sessions.reduce(
        (total, session) => total + session.enrolled,
        0,
      ),
    };
  });
}

export function lecturerReportRows(data: AppData) {
  return data.lecturers.map((lecturer) => {
    const sessions = data.sessions.filter(
      (session) => session.lecturer === lecturer.name,
    );
    const hours = sessions.reduce(
      (total, session) => total + durationHours(session.start, session.end),
      0,
    );
    return {
      StaffID: lecturer.id || "",
      StaffName: lecturer.name,
      Department: lecturer.department,
      PrimaryCampus: lecturer.primaryCampus || lecturer.preferredCampus || "",
      AdditionalCampuses: (lecturer.additionalCampuses || []).join("|"),
      Availability: lecturer.availability,
      ScheduledSessions: sessions.length,
      ScheduledHours: hours,
      MaximumWeeklyHours: lecturer.maxWeeklyHours || 18,
      WorkloadStatus:
        hours > (lecturer.maxWeeklyHours || 18) ? "Overloaded" : "Within limit",
    };
  });
}

export function conflictReportRows(data: AppData) {
  return data.conflicts.map((conflict) => ({
    Severity: conflict.severity,
    Type: conflict.type,
    Module: conflict.module,
    Staff: conflict.lecturer,
    Location: conflict.room,
    Time: conflict.time,
    Description: conflict.description,
    SuggestedFix: conflict.fix,
    Status: conflict.resolved ? "Resolved" : "Open",
  }));
}

function durationHours(start: string, end: string) {
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return Math.max(
    0,
    (endHour * 60 + endMinute - startHour * 60 - startMinute) / 60,
  );
}

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function timetableIcs(sessions: Session[]) {
  const escape = (v: string) =>
    v
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  const local = (date: string, time: string) =>
    date.replace(/-/g, "") + "T" + time.replace(":", "") + "00";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Campus Timetable Intelligence//EN",
    "CALSCALE:GREGORIAN",
    ...sessions.flatMap((s) => [
      "BEGIN:VEVENT",
      `UID:${s.id}@campus-timetable`,
      `DTSTAMP:${new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "")}`,
      `DTSTART;TZID=${s.timeZone || "Europe/London"}:${local(s.date!, s.start)}`,
      `DTEND;TZID=${s.timeZone || "Europe/London"}:${local(s.date!, s.end)}`,
      `SUMMARY:${escape(s.moduleName)}`,
      `LOCATION:${escape(s.room + ", " + s.campus)}`,
      `DESCRIPTION:${escape(s.lecturer + "; Week " + s.teachingWeek + "; " + (s.variantId ? "Changed" : "Base"))}`,
      `STATUS:${s.status === "Cancelled" ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return (
    lines
      .map((line) => {
        const parts: string[] = [];
        let part = "",
          n = 0;
        for (const char of line) {
          const bytes = new TextEncoder().encode(char).length;
          if (n + bytes > 73) {
            parts.push(part);
            part = " ";
            n = 1;
          }
          part += char;
          n += bytes;
        }
        parts.push(part);
        return parts.join("\r\n");
      })
      .join("\r\n") + "\r\n"
  );
}
export function downloadIcs(name: string, sessions: Session[]) {
  downloadBlob(name, timetableIcs(sessions), "text/calendar;charset=utf-8");
}
