// Horizontal camera-to-building offset directions in the shared map frame.
// Street axes are measured from the supplied landmark footprints, not compass
// screen directions. Detailed rationale and approximate choices are documented.
const north = [0.5421, -0.8403], east = [0.8403, 0.5421];
const south = north.map(n => -n), west = east.map(n => -n);
export const buildingViews = Object.freeze({
  'nyu-kimmel-center': { front: north, basis: 'Washington Square South park-facing entrance' },
  'nyu-global-center': { front: north, basis: 'Washington Square South patterned facade' },
  'bobst-library': { front: north, basis: 'Washington Square South main entrance' },
  'nyu-silver-center': { front: west, basis: 'Washington Square East park-facing facade' },
  'nyu-leslie-elab-building': { front: north, basis: 'Washington Place storefront and banner' },
  'lipton-hall': { front: east, basis: 'Washington Square West park frontage' },
  'washington-square-arch': { front: south, basis: 'Park-facing side of arch' },
  'stern-school-of-business': { front: east, basis: 'Gould-facing western Stern/Kaufman rotunda' },
  'courant-institute': { front: west, basis: 'Gould-facing Courant elevation' },
  'nyu-gould-plaza': { front: north, basis: 'West Fourth Street open approach' },
  'nyu-john-a-paulson-center': { front: east, basis: 'Mercer Street canopy and long frontage' },
});
export const buildingFocusPolarAngle = 65 * Math.PI / 180;
export const buildingFocusedMaxPolarAngle = 78 * Math.PI / 180;
