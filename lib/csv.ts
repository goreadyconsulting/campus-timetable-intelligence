export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(current.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }
  if (inQuotes) throw new Error("CSV contains an unclosed quoted field.");
  row.push(current.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  const [headers = [], ...body] = rows;
  if (headers.some((h) => !h) || new Set(headers).size !== headers.length)
    throw new Error("CSV headers must be unique and nonempty.");
  if (body.some((row) => row.length !== headers.length))
    throw new Error("CSV rows have inconsistent column counts.");
  return body.map((values) =>
    Object.fromEntries(
      headers.map((h, i) => [h.trim(), values[i]?.trim() ?? ""]),
    ),
  );
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ].join("\n");
}

export const templates = {
  rooms: `room_id,room_name,campus,building,room_type,capacity,status\nR001,A101 Lecture Hall,Main Campus,A Block,Lecture Hall,120,Available\nR002,B204 Seminar Room,Business School,B Block,Seminar Room,45,Available\nR003,C305 Computer Lab,City Campus,C Block,Computer Lab,60,Available`,
  lecturers: `lecturer_id,lecturer_name,department,max_weekly_hours,availability,preferred_campus\nL001,Dr. Ahmed Khan,Business,18,Mon-Fri 09:00-17:00,Business School\nL002,Dr. Priya Sharma,Computing,20,Mon-Thu 10:00-16:00,City Campus\nL003,Prof. James Wilson,Management,16,Tue-Fri 09:00-15:00,Main Campus`,
  studentGroups: `group_id,group_name,course,student_count,campus\nG001,MBA-Jan-2026,MBA,95,Business School\nG002,MScIB-Sep-2026,MSc International Business,70,Main Campus\nG003,BScCS-Year3,BSc Computer Science,55,City Campus`,
  modules: `module_id,module_code,module_name,course,lecturer_id,weekly_sessions,hours_per_session,room_type_required,student_group\nM001,BUS401,Strategic Management,MBA,L001,2,2,Lecture Hall,MBA-Jan-2026\nM002,INT502,Global Business,MSc International Business,L003,2,2,Seminar Room,MScIB-Sep-2026\nM003,CS301,Software Engineering,BSc Computer Science,L002,3,2,Computer Lab,BScCS-Year3`,
  requirements: `module_code,student_group,preferred_days,preferred_time,required_room_type,avoid_days\nBUS401,MBA-Jan-2026,Mon/Wed,Morning,Lecture Hall,Fri\nINT502,MScIB-Sep-2026,Tue/Thu,Afternoon,Seminar Room,Mon\nCS301,BScCS-Year3,Mon/Wed/Fri,Morning,Computer Lab,Tue`,
};
