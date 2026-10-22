import placements from '../assets/yuyang-site-3d-assets/data/landmark-placements.json';
import extracted from '../assets/campus-assets/data/extracted-buildings.json';
import { goGreekPopup } from './go-greek-popup.js';

export { placements };
export const paulson = extracted.buildings['nyu-john-a-paulson-center'];
export const palette = { background: '#dce6e8', skyTop: '#94bdd7', skyHorizon: '#dce6e8', ground: '#c4c7c3', context: '#fdfaf0', grass: '#9dbd7c', selected: '#ad85ca', hovered: '#c1ace9' };
// A/B constrain tilt; C supplies distance only. Default composition follows the
// user's park-foreground screenshot, looking toward the south campus.
export const cameraSamples = {
  tiltA: { position: [117.35349150485345,259.31943639734726,-163.8728555240108], target: [21.731247858260843,11.999999999999913,96.99588542635166] },
  tiltB: { position: [-3.746212712553951,446.2840253171525,66.20806923174607], target: [-5.416688309936553,11.999999999999844,68.68824234354518] },
  zoom: { position: [166.96257528963366,228.71904255840525,-299.04692924731984], target: [8.666116347751665,11.999999999999824,42.400935106938746] },
};
const offset = sample => sample.position.map((n,i) => n-sample.target[i]);
const polar = sample => Math.acos(offset(sample)[1]/Math.hypot(...offset(sample)));
const zoomDistance = Math.hypot(...offset(cameraSamples.zoom));
const minPolarAngle = Math.min(polar(cameraSamples.tiltA),polar(cameraSamples.tiltB));
const maxPolarAngle = Math.max(polar(cameraSamples.tiltA),polar(cameraSamples.tiltB));
// Framing is biased toward the park's southeast side so the fountain/arch stay
// in the foreground and Bobst/Kimmel appear beyond it. This is an approximation
// of the supplied image, not an exact camera pose recovered from pixels.
const target = [74,12,116];
const azimuth = -172*Math.PI/180;
export const initialCamera = { version: 1, projection: 'perspective', position: [target[0]+zoomDistance*Math.sin(maxPolarAngle)*Math.sin(azimuth),target[1]+zoomDistance*Math.cos(maxPolarAngle),target[2]+zoomDistance*Math.sin(maxPolarAngle)*Math.cos(azimuth)], target, fov: 43, near: 0.5, far: 6000, zoom: 1 };
export const atmosphere = { fogNear: 430, fogFar: 1050, edgeFadeWidth: 220 };
export const mapExtent = { minX: -960, maxX: 960, minZ: -960, maxZ: 1152 };
export const cameraLimits = {
  minDistance: 15,
  maxDistance: zoomDistance,
  minPolarAngle,
  maxPolarAngle,
  minCameraHeight: 1,
  targetBounds: { minX: -780, maxX: 780, minY: 1, maxY: 150, minZ: -780, maxZ: 970 },
};
export const buildings = [
  ...(goGreekPopup.enabled ? [{ id: goGreekPopup.id, name: goGreekPopup.name, description: goGreekPopup.description }] : []),
  { id: 'nyu-silver-center', name: 'Silver Center', description: 'The Silver Center for Arts and Science at 100 Washington Square East, with pale masonry, ornamental cornices and the gold-toned entrance on Washington Place.' },
  { id: 'nyu-kimmel-center', name: 'Kimmel Center', description: 'NYU’s Kimmel Center for University Life at 60 Washington Square South. Pale masonry, glazed corners and upper terraces overlook Washington Square Park.' },
  { id: 'nyu-global-center', name: 'Global Center (GCASL)', description: 'NYU’s Global Center for Academic and Spiritual Life beside Kimmel. Its patterned ochre stone screen draws on a tree-of-life motif. This reference-informed exterior is an architectural approximation.' },
  { id: 'nyu-leslie-elab-building', name: 'Leslie eLab building', description: 'The Leslie Entrepreneurs Lab occupies the ground floor at 16 Washington Place, within the stepped building at 12–16 Washington Place.' },
  { id: 'bobst-library', name: 'Bobst Library', description: 'NYU’s library on the south side of Washington Square Park.' },
  { id: 'washington-square-arch', name: 'Washington Square Arch', description: 'The marble arch at the northern entrance to Washington Square Park.' },
  { id: 'courant-institute', name: 'Courant Institute', description: 'NYU’s center for mathematics and computer science, southeast of Washington Square Park.' },
  { id: 'stern-school-of-business', name: 'Stern School of Business', description: 'NYU’s business school and adjoining Gould Plaza, near Washington Square Park.' },
  { id: 'nyu-john-a-paulson-center', name: paulson.name, description: `${paulson.address}. Explore the student and faculty towers above a shared podium. This map model is an architectural approximation.` },
];
