// Horizontal camera-to-building offset directions in the shared map frame.
// Street axes are measured from the supplied landmark footprints, not compass
// screen directions. Detailed rationale and approximate choices are documented.
const north = [0.5421, -0.8403], east = [0.8403, 0.5421];
const south = north.map(n => -n);
// Screenshot-based original views; height factors derive a lower viewing angle.
// Focus distance keeps the original fit, with explicit per-building pullback.
const screenshotView = (azimuth, polar, heightScale, basis) => ({
  front: [Math.sin(azimuth * Math.PI / 180), Math.cos(azimuth * Math.PI / 180)],
  polarAngle: polar * Math.PI / 180, heightScale, basis,
});
export const buildingViews = Object.freeze({
  'nyu-kimmel-center': screenshotView(117, 65, .8, 'User view: park-facing entrance and Bobst-side facade'),
  'nyu-global-center': screenshotView(181, 53, .8, 'User view: long patterned facade, Kimmel behind left'),
  'bobst-library': { ...screenshotView(175, 62, .8, 'User view: park-facing entrance and eastern facade'), distanceScale: 1.2 },
  'nyu-silver-center': { ...screenshotView(197, 60, .8, 'Latest user image: Silver Center park facade, Leslie eLab behind'), distanceScale: 1.2 },
  'nyu-leslie-elab-building': screenshotView(189, 41, .8, 'User view: Washington Place storefront and Greene Street corner'),
  'lipton-hall': { front: east, basis: 'Washington Square West park frontage' },
  'washington-square-arch': { front: south, basis: 'Park-facing side of arch' },
  'stern-school-of-business': {
    ...screenshotView(117, 65, .75, 'User view: Gould-facing Stern/Kaufman rotunda'),
    target: [85, 25, 193],
  },
  'courant-institute': screenshotView(15, 63, .8, 'User view: broad facade and side above garden'),
  'nyu-john-a-paulson-center': screenshotView(110, 46, .8, 'User view: student towers foreground, faculty tower behind left'),
});
export const buildingFocusPolarAngle = 65 * Math.PI / 180;
export const buildingFocusedMaxPolarAngle = 78 * Math.PI / 180;
