/** Calendar date as `YYYY-MM-DD` (no time zone: statements are dated, not timestamped). */
export type IsoDate = string;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (v: string): v is IsoDate =>
  ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export const isoDate = (year: number, month: number, day: number): IsoDate | null => {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day)
    return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const daysBetween = (a: IsoDate, b: IsoDate): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
