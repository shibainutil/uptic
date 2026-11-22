import { useEffect, useState } from 'react';

/**
 * The current time, refreshed every minute, so screens re-render when a habit session
 * moves between Upcoming, Due and Overdue (and when the day rolls over).
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
