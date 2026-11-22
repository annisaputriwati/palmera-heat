// Palmera Heat — tuning constants and the city layout parameters every other module shares.
// The world is a rectangle of pixels; roads are axis-aligned bands on a regular grid, the sea
// runs down the west edge, and the blocks between roads are filled with buildings by city.js.

/** World size in pixels. */
export const WORLD_W = 4800;
export const WORLD_H = 3480;

/** Width of every road, kerb to kerb; the lane offset is a quarter of it (right-hand traffic). */
export const ROAD_W = 120;
export const LANE_OFF = ROAD_W / 4;

/** Centre lines of the vertical avenues, west to east. The first is the coast road. */
export const V_ROADS = [560, 1160, 1760, 2360, 2960, 3560, 4160];
/** Centre lines of the horizontal streets, north to south. */
export const H_ROADS = [480, 1080, 1680, 2280, 2880];

/** The sea occupies x < SEA_W; the beach is the sand strip between SEA_W and BEACH_END. */
export const SEA_W = 300;
export const BEACH_END = 500;

/** Sidewalk band width along each road edge and around each block. */
export const SIDEWALK_W = 26;

/** Fixed simulation step, seconds. The loop never advances the world by any other amount. */
export const STEP = 1 / 60;

/** Player tuning. */
export const PLAYER = {
  radius: 13,
  walkSpeed: 168,
  sprintSpeed: 268,
  health: 100,
  meleeRange: 46,
  meleeDamage: 34,
  startCash: 120,
};

/** Wanted tuning: heat is a float; stars shown are ceil(heat) capped at maxStars. */
export const WANTED = {
  maxStars: 5,
  /** Heat added per crime kind. */
  crime: {
    stealCar: 1.0,
    hitCar: 0.55,
    hitPed: 1.6,
    shoot: 0.8,
    shootPed: 2.2,
    shootCar: 1.1,
    mission: 1.2,
  },
  /** Heat lost per second while no police unit can see the player. */
  cooldownPerSec: 0.16,
  /** Police cars the city fields at each star count (index = stars). */
  copsByStars: [0, 2, 3, 4, 6, 8],
  /** Seconds a cop must stay close to a slow or on-foot player to bust them. */
  bustSeconds: 2.4,
  bustRadius: 120,
};

/** Camera: how far ahead of a driven car it looks, as a fraction of its velocity. */
export const CAMERA_LEAD = 0.55;

/** Golden-hour palette: the whole game is lit like late afternoon on the coast. */
export const COLORS = {
  water: '#1d7a8c',
  waterDeep: '#155e73',
  sand: '#f2ddae',
  sandWet: '#e6c98f',
  blockGround: '#e3d3ac',
  blockGroundAlt: '#dccda6',
  sidewalk: '#cdbb96',
  asphalt: '#43404a',
  asphaltEdge: '#37343e',
  laneLine: '#e8c96a',
  crosswalk: '#e9e4d8',
  grass: '#a8bf6d',
};
