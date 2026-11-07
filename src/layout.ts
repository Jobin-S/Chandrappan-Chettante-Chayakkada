/**
 * Shared street layout. Traffic keeps to the left (as in India):
 * eastbound (+x) uses the lane nearer the shop, westbound the far lane.
 */
export const ROAD = {
  center: 6.55,
  width: 4.3,
  /** Eastbound lane (+x), shop side – the bus stops here. */
  laneEast: 5.6,
  /** Westbound lane (−x), far side. */
  laneWest: 7.55,
  /** Footpath on the shop side (customers and walkers). */
  walkNear: 4.0,
  /** Footpath on the far side of the road. */
  walkFar: 9.05,
  /** Where the valley starts to drop away. */
  valleyZ: 9.8,
};

/** Bus shelter beside the shop (centre x on the shop-side footpath). */
export const BUS_STOP = { x: -7.6, z: 3.05 };
