/**
 * Time of day and sky model. `t` is the fraction of a day: 0 = midnight, 0.25 = sunrise,
 * 0.5 = noon, 0.75 = sunset. The sun travels east → overhead → west on a slightly tilted arc.
 */
export type Vec3Tuple = [number, number, number];

export interface SkyState {
  /** Unit vector towards the sun. */
  sunDir: Vec3Tuple;
  /** Key light (sun by day, moon by night): direction, colour and intensity. */
  lightDir: Vec3Tuple;
  lightColor: Vec3Tuple;
  lightIntensity: number;
  sunColor: Vec3Tuple;
  sunVisibility: number;
  moonVisibility: number;
  starVisibility: number;
  zenith: Vec3Tuple;
  horizon: Vec3Tuple;
  /** 0 at night, 1 in full daylight. */
  daylight: number;
}

const DAY_ZENITH: Vec3Tuple = [0.12, 0.3, 0.72];
const DAY_HORIZON: Vec3Tuple = [0.52, 0.66, 0.84];
const DUSK_ZENITH: Vec3Tuple = [0.16, 0.18, 0.38];
const DUSK_HORIZON: Vec3Tuple = [0.95, 0.47, 0.22];
const NIGHT_ZENITH: Vec3Tuple = [0.004, 0.008, 0.025];
const NIGHT_HORIZON: Vec3Tuple = [0.02, 0.03, 0.065];
const DAY_SUN: Vec3Tuple = [1.0, 0.93, 0.8];
const DUSK_SUN: Vec3Tuple = [1.0, 0.5, 0.22];
const MOON_COLOR: Vec3Tuple = [0.55, 0.65, 1.0];
const SUN_INTENSITY = 3.1;
const MOON_INTENSITY = 0.3;

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

function mix(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function wrapTime(t: number): number {
  return t - Math.floor(t);
}

export function sunDirection(t: number): Vec3Tuple {
  const theta = (wrapTime(t) - 0.25) * Math.PI * 2;
  const x = Math.cos(theta), y = Math.sin(theta) * 0.93, z = 0.36;
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
}

export function computeSky(t: number): SkyState {
  const sunDir = sunDirection(t);
  const elevation = sunDir[1];
  const daylight = smoothstep(-0.06, 0.28, elevation);
  // Twilight peaks while the sun crosses the horizon.
  const twilight = Math.exp(-((elevation / 0.14) ** 2)) * smoothstep(-0.3, -0.05, elevation);
  const zenith = mix(mix(NIGHT_ZENITH, DAY_ZENITH, daylight), DUSK_ZENITH, twilight * 0.45);
  const horizon = mix(mix(NIGHT_HORIZON, DAY_HORIZON, daylight), DUSK_HORIZON, twilight * 0.75);
  const sunColor = mix(DUSK_SUN, DAY_SUN, smoothstep(0.0, 0.4, elevation));
  const sunVisibility = smoothstep(-0.04, 0.02, elevation);
  const moonVisibility = smoothstep(-0.04, 0.02, -elevation);
  const sunIntensity = SUN_INTENSITY * smoothstep(-0.03, 0.14, elevation);
  const moonIntensity = MOON_INTENSITY * smoothstep(-0.03, 0.14, -elevation);
  const useSun = sunIntensity >= moonIntensity;
  const moonDir: Vec3Tuple = [-sunDir[0], -sunDir[1], -sunDir[2]];
  return {
    sunDir,
    lightDir: useSun ? sunDir : moonDir,
    lightColor: useSun ? sunColor : MOON_COLOR,
    lightIntensity: useSun ? sunIntensity : moonIntensity,
    sunColor,
    sunVisibility,
    moonVisibility,
    starVisibility: 1 - smoothstep(-0.25, 0.02, elevation),
    zenith,
    horizon,
    daylight,
  };
}

/** "HH:MM" clock time and a coarse phase name for the HUD. */
export function formatTimeOfDay(t: number): string {
  const minutes = Math.floor(wrapTime(t) * 24 * 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  const elevation = sunDirection(t)[1];
  const phase = elevation > 0.25 ? 'Day' : elevation > -0.12 ? (wrapTime(t) < 0.5 ? 'Dawn' : 'Dusk') : 'Night';
  return `${hh}:${mm} ${phase}`;
}
