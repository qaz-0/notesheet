import {
  isValidDateString,
  getUnixTimestamp,
  formatTimeUntil,
  formatDateDisplay,
} from "./dateParser";
import type { Field } from "./types";

/**
 * Check if a field is a "Date" field.
 */
export function isDateField(field: Field | undefined): boolean {
  return field?.name.toLowerCase() === "date" && !field.id;
}

/**
 * Get the tooltip for a date value.
 */
export function getDateTooltip(value: string | undefined): string | null {
  if (!value || !isValidDateString(value)) return null;
  return formatTimeUntil(getUnixTimestamp(value));
}

/**
 * Get the display value for a cell, handling dates.
 */
export function getDisplayValue(
  value: string | undefined,
  field: Field | undefined,
  formatFn: (v: string) => string = formatDateDisplay
): string {
  if (!value) return "\u200B";
  if (isDateField(field) && isValidDateString(value)) {
    return formatFn(value);
  }
  return value;
}
