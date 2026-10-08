export interface ClockCourse {
  id: string
  name: string
  day: number
  startMinute: number
  endMinute: number
}

export type TimetableErrorCode = 'name' | 'day' | 'time' | 'order' | 'header' | 'columns' | 'quote' | 'empty' | 'large';

export class TimetableInputError extends Error {
  constructor(public code: TimetableErrorCode, public row?: number) {
    super(code);
  }
}

export function parseClockTime(value: string, allowDayEnd = false): number {
  if (allowDayEnd && value === '24:00') return 1440;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new TimetableInputError('time');
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatClockTime(minutes: number): string {
  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
}

const dayAliases: Record<string, number> = {
  '星期一': 1, '周一': 1, 'monday': 1, 'mon': 1,
  '星期二': 2, '周二': 2, 'tuesday': 2, 'tue': 2,
  '星期三': 3, '周三': 3, 'wednesday': 3, 'wed': 3,
  '星期四': 4, '周四': 4, 'thursday': 4, 'thu': 4,
  '星期五': 5, '周五': 5, 'friday': 5, 'fri': 5,
  '星期六': 6, '周六': 6, 'saturday': 6, 'sat': 6,
  '星期日': 7, '星期天': 7, '周日': 7, '周天': 7, 'sunday': 7, 'sun': 7,
};

export function makeClockCourse(input: { name: string, day: string | number, start: string, end: string }, id: string): ClockCourse {
  const name = input.name.trim();
  if (!name || name.length > 100) throw new TimetableInputError('name');
  const rawDay = String(input.day).trim().toLowerCase();
  const day = dayAliases[rawDay] ?? (/^[1-7]$/.test(rawDay) ? Number(rawDay) : 0);
  if (!day) throw new TimetableInputError('day');
  const startMinute = parseClockTime(input.start.trim());
  const endMinute = parseClockTime(input.end.trim(), true);
  if (endMinute <= startMinute) throw new TimetableInputError('order');
  return { id, name, day, startMinute, endMinute };
}

// Parse CSV records, including quoted commas, escaped quotes and quoted newlines.
function csvRecords(csv: string): string[][] {
  if (csv.length > 1024 * 1024) throw new TimetableInputError('large');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;
  const input = csv.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else field += char;
    }
    else if (char === ',' || char === '\n') {
      row.push(field.trim()); field = ''; closedQuote = false;
      if (char === '\n') { rows.push(row); row = []; }
    }
    else if (char === '"') {
      if (field.trim() || closedQuote) throw new TimetableInputError('quote', rows.length + 1);
      field = ''; quoted = true;
    }
    else if (closedQuote && !/\s/.test(char)) throw new TimetableInputError('quote', rows.length + 1);
    else field += char;
  }
  if (quoted) throw new TimetableInputError('quote', rows.length + 1);
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length > 1001) throw new TimetableInputError('large');
  return rows;
}

export function parseTimetableCsv(csv: string): ClockCourse[] {
  const rows = csvRecords(csv);
  const headerIndex = rows.findIndex(row => row.some(Boolean));
  if (headerIndex < 0) throw new TimetableInputError('empty');
  const aliases = [['课程名', '课程名称', 'name'], ['星期几', '星期', 'day'], ['开始时间', 'start'], ['结束时间', 'end']];
  const header = rows[headerIndex].map(value => value.toLowerCase());
  const columns = aliases.map(names => header.findIndex(value => names.includes(value)));
  if (header.length !== 4 || columns.some(index => index < 0)) throw new TimetableInputError('header', headerIndex + 1);
  const courses: ClockCourse[] = [];
  rows.slice(headerIndex + 1).forEach((row, index) => {
    const rowNumber = headerIndex + index + 2;
    if (!row.some(Boolean)) return;
    if (row.length !== 4) throw new TimetableInputError('columns', rowNumber);
    try {
      courses.push(makeClockCourse({ name: row[columns[0]], day: row[columns[1]], start: row[columns[2]], end: row[columns[3]] }, `csv-${rowNumber}`));
    }
    catch (error) {
      if (error instanceof TimetableInputError) throw new TimetableInputError(error.code, rowNumber);
      throw error;
    }
  });
  if (!courses.length) throw new TimetableInputError('empty');
  return courses;
}

export function courseKey(course: ClockCourse): string {
  return JSON.stringify([course.name, course.day, course.startMinute, course.endMinute]);
}

export function exportTimetableCsv(courses: ClockCourse[]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return ['课程名,星期几,开始时间,结束时间', ...courses.map(course => [escape(course.name), course.day, formatClockTime(course.startMinute), formatClockTime(course.endMinute)].join(','))].join('\r\n');
}

export function renderWeekTimetable(courses: ClockCourse[], days: string[], empty: string): string {
  return days.map((day, index) => {
    const items = courses.filter(course => course.day === index + 1).sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
    return `${day}\n${items.length ? items.map(course => `  ${formatClockTime(course.startMinute)}–${formatClockTime(course.endMinute)}  ${course.name}`).join('\n') : `  ${empty}`}`;
  }).join('\n\n');
}
