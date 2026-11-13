// Who is in the salon. The barbers' app reports when their phone enters or
// leaves the salon's geofence; the backend will turn that into periods present
// and absent.
//
// The backend does not serve this yet: until it does, the data below is drawn
// on the client from the real team, with a seeded generator (the same barber
// and day always give the same history). Replace the two queryFn with requests
// once the routes exist.
import { useQuery } from '@tanstack/react-query';
import { useStaff } from './shops';

export interface PresenceNow {
	id: number;
	full_name: string;
	profile_picture: string | null;
	is_present: boolean;
	/** "HH:MM": when the current state began today, or null if no event yet */
	since: string | null;
	present_minutes_today: number;
}

export interface PresenceSegment {
	start: string;
	end: string;
	present: boolean;
}

export interface PresenceDay {
	date: string;
	opening: string;
	closing: string;
	closed: boolean;
	segments: PresenceSegment[];
	present_minutes: number;
	absent_minutes: number;
}

const OPEN = 9 * 60;
const CLOSE = 20 * 60;
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function seeded(seed: number) {
	let s = seed >>> 0 || 1;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

/** One barber's day: arrives after opening, out for lunch, sometimes steps out. */
function dayOf(barber: number, date: string, now: Date): PresenceDay {
	const r = seeded(barber * 100003 + Number(date.replaceAll('-', '')));
	const isToday = date === isoDate(now);
	const end = isToday ? Math.min(CLOSE, now.getHours() * 60 + now.getMinutes()) : CLOSE;
	const closed = new Date(`${date}T00:00:00`).getDay() === 0;
	const base = { date, opening: hhmm(OPEN), closing: hhmm(CLOSE), closed };
	if (closed || r() < 0.1 || end <= OPEN) return { ...base, segments: [], present_minutes: 0, absent_minutes: closed ? 0 : Math.max(0, end - OPEN) };

	const arrive = OPEN + Math.round(r() * 40);
	const lunch = 12 * 60 + 30 + Math.round(r() * 60);
	const back = lunch + 35 + Math.round(r() * 40);
	const out = r() < 0.5 ? 16 * 60 + Math.round(r() * 90) : null;
	const marks = [OPEN, arrive, lunch, back, ...(out ? [out, out + 15 + Math.round(r() * 30)] : []), CLOSE - Math.round(r() * 45), CLOSE];
	const segments: PresenceSegment[] = [];
	for (let i = 0; i < marks.length - 1; i++) {
		const start = marks[i] ?? OPEN;
		const stop = Math.min(marks[i + 1] ?? CLOSE, end);
		if (stop <= start) break;
		segments.push({ start: hhmm(start), end: hhmm(stop), present: i % 2 === 1 });
	}
	const sum = (present: boolean) => segments.filter((s) => s.present === present).reduce((total, s) => total + toMinutes(s.end) - toMinutes(s.start), 0);
	return { ...base, segments, present_minutes: sum(true), absent_minutes: sum(false) };
}


export function usePresence(shop: number) {
	const staff = useStaff(shop);
	const team = (staff.data ?? []).filter((member) => member.staff_type === 'barber').map((member) => member.user);
	return useQuery({
		queryKey: ['presence', shop, team.map((barber) => barber.id)],
		enabled: Boolean(staff.data),
		refetchInterval: 60_000,
		queryFn: () => {
			const now = new Date();
			const today = isoDate(now);
			return {
				updated_at: now.toISOString(),
				barbers: team.map((barber): PresenceNow => {
					const day = dayOf(barber.id, today, now);
					const last = day.segments[day.segments.length - 1];
					return {
						id: barber.id,
						full_name: barber.first_name || barber.username,
						profile_picture: barber.profile_picture ?? null,
						is_present: Boolean(last?.present && toMinutes(last.end) >= Math.min(CLOSE, now.getHours() * 60 + now.getMinutes())),
						since: last?.start ?? null,
						present_minutes_today: day.present_minutes
					};
				})
			};
		}
	});
}

export const usePresenceHistory = (shop: number, barber: number | null, days = 7) =>
	useQuery({
		queryKey: ['presence', shop, barber, days],
		enabled: barber !== null,
		queryFn: () => {
			const now = new Date();
			return {
				days: Array.from({ length: days }, (_, i) => {
					const day = new Date(now);
					day.setDate(now.getDate() - i);
					return dayOf(barber ?? 0, isoDate(day), now);
				})
			};
		}
	});
