// One Eastern calendar read for the launch chip and the go-live sentence.
// Separate month-only and day-only formatters can disagree with a full date
// formatter, so the highlighted Monday and the sentence must share these parts.
const easternLaunchDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});

export function launchDateParts(iso) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(
    easternLaunchDate.formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  const { weekday, month, day, year } = parts;
  if (!weekday || !month || !day || !year) return null;
  return {
    weekday,
    weekdayShort: weekday.slice(0, 3),
    month,
    monthShort: month.slice(0, 3),
    day,
    year,
    sentence: `Goes live ${weekday}, ${month} ${day}, ${year} at 9:00 AM Eastern.`,
  };
}
