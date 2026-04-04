/**
 * Natural language date parser for NoteSheet.
 * 
 * Storage format: "original|YYYY-MM-DD|HH:MM|unix_timestamp"
 * e.g. "wed 1pm|2026-04-08|13:00|1744084800"
 */

// ─── Constants ───────────────────────────────────────────────────────

const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const SEPARATOR = '|';

// ─── Parsing ─────────────────────────────────────────────────────────

interface ParsedDate {
  year: number;
  month: number;  // 0-indexed
  day: number;
  hours: number;
  minutes: number;
}

/**
 * Try to parse a time string component.
 * Handles: 1pm, 1:30pm, 13:30, 1.30pm, 13.30, noon, midnight
 * Returns { hours, minutes } or null.
 */
function tryParseTime(token: string): { hours: number; minutes: number } | null {
  const lower = token.toLowerCase();

  if (lower === 'noon') return { hours: 12, minutes: 0 };
  if (lower === 'midnight') return { hours: 0, minutes: 0 };

  // Match patterns like: 1pm, 1:30pm, 13:30, 1.30pm, 13.30, 1:30am
  const timeRegex = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i;
  const match = lower.match(timeRegex);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toLowerCase();
  const hasSeparator = !!match[2];

  if (minutes < 0 || minutes > 59) return null;

  // A bare number like "6" without am/pm or separator is ambiguous (could be a day).
  // Only treat as time if it has am/pm suffix or a colon/dot separator.
  if (!ampm && !hasSeparator) return null;

  if (ampm) {
    if (hours < 1 || hours > 12) return null;
    if (ampm === 'pm' && hours !== 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
  } else {
    // 24-hour format (must have separator like 13:30)
    if (hours < 0 || hours > 23) return null;
  }

  return { hours, minutes };
}

/**
 * Try to parse a day-of-week token.
 * Returns the target day-of-week (0=Sun) or null.
 */
function tryParseDayOfWeek(token: string): number | null {
  const lower = token.toLowerCase();
  return DAY_NAMES[lower] ?? null;
}

/**
 * Try to parse a month name token.
 * Returns the month index (0-indexed) or null.
 */
function tryParseMonth(token: string): number | null {
  const lower = token.toLowerCase();
  return MONTH_NAMES[lower] ?? null;
}

/**
 * Get the next occurrence of a day-of-week from today (inclusive of today).
 */
function getNextDayOfWeek(targetDay: number, now: Date): Date {
  const today = now.getDay();
  let diff = targetDay - today;
  if (diff < 0) diff += 7;
  const result = new Date(now);
  result.setDate(result.getDate() + diff);
  return result;
}

/**
 * Parse a natural language date string into a structured date.
 * Returns null if parsing completely fails.
 */
function parseDateInternal(input: string, now: Date): ParsedDate | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;
  let hours: number | null = null;
  let minutes: number | null = null;

  const lower = trimmed.toLowerCase();

  // Handle "today" and "tomorrow" first
  if (lower === 'today' || lower.startsWith('today ') || lower.endsWith(' today')) {
    year = now.getFullYear();
    month = now.getMonth();
    day = now.getDate();
  }
  if (lower === 'tomorrow' || lower.startsWith('tomorrow ') || lower.endsWith(' tomorrow')) {
    const tom = new Date(now);
    tom.setDate(tom.getDate() + 1);
    year = tom.getFullYear();
    month = tom.getMonth();
    day = tom.getDate();
  }

  // Tokenize: split on whitespace and commas
  const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
  const usedTokenIndices = new Set<number>();

  // Pass 1: find time
  for (let i = 0; i < tokens.length; i++) {
    const time = tryParseTime(tokens[i]);
    if (time) {
      hours = time.hours;
      minutes = time.minutes;
      usedTokenIndices.add(i);
      break;
    }
  }

  // Pass 2: find day of week (only use if no date already set)
  if (year === null && month === null && day === null) {
    for (let i = 0; i < tokens.length; i++) {
      if (usedTokenIndices.has(i)) continue;
      const dow = tryParseDayOfWeek(tokens[i]);
      if (dow !== null) {
        const target = getNextDayOfWeek(dow, now);
        year = target.getFullYear();
        month = target.getMonth();
        day = target.getDate();
        usedTokenIndices.add(i);
        break;
      }
    }
  }

  // Pass 3: find month name + day number (+ optional year)
  if (month === null || (year === null && day === null)) {
    for (let i = 0; i < tokens.length; i++) {
      if (usedTokenIndices.has(i)) continue;

      const m = tryParseMonth(tokens[i]);
      if (m !== null) {
        // Look for adjacent number (day)
        const adjacentIndices = [i - 1, i + 1].filter(
          j => j >= 0 && j < tokens.length && !usedTokenIndices.has(j)
        );

        for (const j of adjacentIndices) {
          // Strip ordinal suffixes like "1st", "2nd", "3rd", "4th"
          const cleaned = tokens[j].replace(/(st|nd|rd|th)$/i, '');
          const num = parseInt(cleaned, 10);
          if (!isNaN(num) && num >= 1 && num <= 31) {
            month = m;
            day = num;
            usedTokenIndices.add(i);
            usedTokenIndices.add(j);

            // Look for year – a 4-digit number adjacent
            const yearIndices = [j - 1, j + 1, i - 1, i + 1].filter(
              k => k >= 0 && k < tokens.length && !usedTokenIndices.has(k)
            );
            for (const k of yearIndices) {
              const y = parseInt(tokens[k], 10);
              if (!isNaN(y) && y >= 2000 && y <= 2099) {
                year = y;
                usedTokenIndices.add(k);
                break;
              }
            }
            break;
          }
        }

        if (day !== null) break;

        // Maybe the month token itself is combined like "jan1" — unlikely but check
      }
    }
  }

  // Pass 4: Numeric date like "15/4", "4-15", "15/4/2027"
  if (month === null && day === null) {
    for (let i = 0; i < tokens.length; i++) {
      if (usedTokenIndices.has(i)) continue;
      const dateSlash = tokens[i].match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
      if (dateSlash) {
        const a = parseInt(dateSlash[1], 10);
        const b = parseInt(dateSlash[2], 10);
        // Assume DD/MM format (non-US)
        day = a;
        month = b - 1; // 0-indexed
        if (dateSlash[3]) {
          let y = parseInt(dateSlash[3], 10);
          if (y < 100) y += 2000;
          year = y;
        }
        usedTokenIndices.add(i);
        break;
      }
    }
  }

  // Did we get anything at all?
  const hasDate = day !== null && month !== null;
  const hasTime = hours !== null;
  const hasRelativeDate = year !== null && month !== null && day !== null;

  if (!hasDate && !hasTime && !hasRelativeDate) {
    return null; // complete parsing failure
  }

  // Apply defaults
  if (year === null) {
    if (month !== null && day !== null) {
      // Pick current year, or next year if the date has already passed
      year = now.getFullYear();
      const candidate = new Date(year, month, day);
      if (candidate.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
        year++;
      }
    } else {
      year = now.getFullYear();
    }
  }

  if (month === null) month = now.getMonth();
  if (day === null) day = now.getDate();
  if (hours === null) { hours = 23; minutes = 59; }
  if (minutes === null) minutes = 0;

  return { year, month, day, hours, minutes };
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Parse a natural language date string and return the pipe-delimited storage format.
 * Returns null if parsing fails.
 */
export function parseDate(input: string, now?: Date): string | null {
  const refDate = now ?? new Date();
  const parsed = parseDateInternal(input, refDate);
  if (!parsed) return null;

  const dt = new Date(parsed.year, parsed.month, parsed.day, parsed.hours, parsed.minutes, 0, 0);

  // Validate the date is real (e.g. not Feb 30)
  if (dt.getFullYear() !== parsed.year || dt.getMonth() !== parsed.month || dt.getDate() !== parsed.day) {
    return null;
  }

  const isoDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const isoTime = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  const unix = Math.floor(dt.getTime() / 1000);

  return `${input.trim()}${SEPARATOR}${isoDate}${SEPARATOR}${isoTime}${SEPARATOR}${unix}`;
}

/**
 * Check if a stored string is a valid parsed date (has the pipe-delimited format).
 */
export function isValidDateString(stored: string | undefined | null): boolean {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split(SEPARATOR);
  return parts.length === 4 && !isNaN(Number(parts[3]));
}

/**
 * Get the original user input from the stored string.
 */
export function getOriginalInput(stored: string): string {
  if (!isValidDateString(stored)) return stored;
  return stored.split(SEPARATOR)[0];
}

/**
 * Get the unix timestamp from the stored string.
 */
export function getUnixTimestamp(stored: string): number {
  const parts = stored.split(SEPARATOR);
  return Number(parts[3]);
}

/**
 * Get the ISO date string from the stored string.
 */
export function getISODate(stored: string): string {
  return stored.split(SEPARATOR)[1];
}

/**
 * Get the ISO time string from the stored string.
 */
export function getISOTime(stored: string): string {
  return stored.split(SEPARATOR)[2];
}

/**
 * Format a stored date for display in a table cell.
 * Format: "1 Jan @ 13:00" (show year only if different from current year)
 */
export function formatDateDisplay(stored: string): string {
  if (!isValidDateString(stored)) return stored ?? '';

  const [, isoDate, isoTime] = stored.split(SEPARATOR);
  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentYear = new Date().getFullYear();

  let dateStr = `${day} ${monthNames[monthIndex]}`;
  if (year !== currentYear) {
    dateStr += ` ${year}`;
  }

  return `${dateStr} @ ${isoTime}`;
}

/**
 * Format a stored date for the time-sensitive table (more detailed).
 * Format: "1 Jan 2026 @ 13:00, in 3 days"
 */
export function formatDateDetailedDisplay(stored: string): string {
  if (!isValidDateString(stored)) return stored ?? '';

  const [, isoDate, isoTime, unixStr] = stored.split(SEPARATOR);
  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const year = parseInt(yearStr, 10);
  const monthIndex = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const dateStr = `${day} ${monthNames[monthIndex]} ${year} @ ${isoTime}`;
  const timeUntil = formatTimeUntil(Number(unixStr));

  return `${dateStr}, ${timeUntil}`;
}

/**
 * Format a human-readable "time until" string from a unix timestamp.
 * e.g. "in 3 days", "2 hours ago", "in 5 minutes"
 */
export function formatTimeUntil(unix: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = unix - now;
  const absDiff = Math.abs(diff);
  const isFuture = diff > 0;

  if (absDiff < 60) {
    return isFuture ? 'in a moment' : 'just now';
  }

  const minutes = Math.floor(absDiff / 60);
  if (minutes < 60) {
    const label = minutes === 1 ? 'minute' : 'minutes';
    return isFuture ? `in ${minutes} ${label}` : `${minutes} ${label} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const label = hours === 1 ? 'hour' : 'hours';
    return isFuture ? `in ${hours} ${label}` : `${hours} ${label} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    const label = days === 1 ? 'day' : 'days';
    return isFuture ? `in ${days} ${label}` : `${days} ${label} ago`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    const label = months === 1 ? 'month' : 'months';
    return isFuture ? `in ${months} ${label}` : `${months} ${label} ago`;
  }

  const years = Math.floor(months / 12);
  const label = years === 1 ? 'year' : 'years';
  return isFuture ? `in ${years} ${label}` : `${years} ${label} ago`;
}

/**
 * Compute an urgency factor from 0 (far future) to 1 (now/past).
 * Used for time-sensitive table highlighting.
 * Items in the past return > 1 (capped at 1.5 to distinguish "past" state).
 */
export function getUrgencyFactor(unix: number): number {
  const now = Math.floor(Date.now() / 1000);
  const diff = unix - now;

  if (diff <= 0) {
    // Past — return > 1 to signal "past" state
    return 1.5;
  }

  // Within 7 days → linear interpolation from 1 (now) to 0 (7 days out)
  const sevenDays = 7 * 24 * 60 * 60;
  if (diff <= sevenDays) {
    return 1 - (diff / sevenDays);
  }

  return 0;
}
