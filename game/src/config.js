// Tuning for SKYPOST — Aurora Mail Run. All speeds in m/s, altitudes in metres,
// distances in metres. One knot is 0.51444 m/s; the HUD converts for display.
export const WORLD = {
  seaLevel: 0,
  size: 5200, // ocean plane spans this, centred on the origin
  fogNear: 900,
  fogFar: 4600,
};

export const PLANE = {
  maxSpeed: 82, // full throttle, level flight
  cruiseSpeed: 55,
  stallSpeed: 23, // below this she sinks and the controls go mushy
  accel: 14, // m/s^2 toward the throttle's target speed
  drag: 0.35, // extra speed loss with flaps out
  pitchRate: 0.9, // rad/s of pitch authority at cruise
  rollRate: 1.9, // rad/s
  turnRate: 0.55, // heading rad/s at full bank and cruise speed
  climbFactor: 1.0,
  sinkRate: 9, // m/s lost when stalled
  gearSpeedLimit: 46, // above this, gear down shakes the airframe
  flapSpeedLimit: 40,
};

export const FUEL = {
  capacity: 100,
  burnCruise: 0.45, // units per second at cruise throttle
  burnFull: 0.95, // units per second at full throttle
  burnIdle: 0.12,
  reserveWarn: 25,
};

// One leg: from one island strip to the next, through its rings.
export const LEGS = [
  {
    name: 'Gull Island → Pine Island',
    from: 'gull',
    to: 'pine',
    parcel: 'Letters for Pine Island',
    rings: [
      { x: -180, y: 95, z: -260 },
      { x: -420, y: 120, z: -420 },
      { x: -640, y: 105, z: -560 },
      { x: -820, y: 80, z: -660 },
    ],
  },
  {
    name: 'Pine Island → Lighthouse Rock',
    from: 'pine',
    to: 'light',
    parcel: 'Parcel for the lighthouse keeper',
    rings: [
      { x: -450, y: 110, z: -850 },
      { x: 50, y: 135, z: -980 },
      { x: 480, y: 100, z: -950 },
    ],
  },
  {
    name: 'Lighthouse Rock → Gull Island',
    from: 'light',
    to: 'gull',
    parcel: 'Post home to Gull Island',
    rings: [
      { x: 620, y: 115, z: -620 },
      { x: 420, y: 130, z: -320 },
      { x: 220, y: 100, z: -160 },
      { x: 80, y: 70, z: -60 },
    ],
  },
];

// Island strips: position, heading (deg, 0 = north = -z), length and width.
export const STRIPS = {
  gull: { x: 0, z: 40, heading: 90, length: 260, width: 22, name: 'Gull Island' },
  pine: { x: -900, z: -700, heading: 0, length: 230, width: 20, name: 'Pine Island' },
  light: { x: 800, z: -900, heading: 135, length: 180, width: 18, name: 'Lighthouse Rock' },
};

export const SCORE = {
  ring: 150,
  delivery: 1000,
  softLanding: 400, // scaled by how gentle the touchdown is
  timeBonusPerSecond: 4, // left over from the 12-minute par time
  parSeconds: 720,
};

export const WIND = {
  baseSpeed: 6, // m/s from the north-west
  baseDir: 315, // degrees, where it blows FROM
  gustAmp: 5,
  gustPeriod: 7, // seconds between gusts
};
