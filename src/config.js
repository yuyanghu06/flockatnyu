import placements from '../yuyang-site-3d-assets/data/landmark-placements.json';
import extracted from '../campus-assets/data/extracted-buildings.json';

export { placements };
export const paulson = extracted.buildings['nyu-john-a-paulson-center'];
export const palette = { background: '#354345', ground: '#aaa9a1', grass: '#9dbd7c', selected: '#ad85ca', hovered: '#a7a07a' };
// The supplied view establishes starting zoom distance, not an orbit angle lock.
export const initialCamera = { version: 1, projection: 'perspective', position: [218.89015691721391, 141.77650826210711, 331.520781224766], target: [82.74069512437818, 11.999999999999865, 180.88733413482007], fov: 43, near: 0.5, far: 6000, zoom: 1 };
export const mapExtent = { minX: -960, maxX: 960, minZ: -960, maxZ: 1152 };
export const cameraLimits = {
  minDistance: 15,
  maxDistance: 700,
  minCameraHeight: 1,
  targetBounds: { minX: -780, maxX: 780, minY: 1, maxY: 150, minZ: -780, maxZ: 970 },
};
export const buildings = [
  { id: 'nyu-silver-center', name: 'Silver Center', description: 'The Silver Center for Arts and Science at 100 Washington Square East, with pale masonry, ornamental cornices and the gold-toned entrance on Washington Place.' },
  { id: 'nyu-kimmel-center', name: 'Kimmel Center', description: 'NYU’s Kimmel Center for University Life at 60 Washington Square South. Pale masonry, glazed corners and upper terraces overlook Washington Square Park.' },
  { id: 'nyu-leslie-elab-building', name: 'Leslie eLab building', description: 'The Leslie Entrepreneurs Lab occupies the ground floor at 16 Washington Place, within the stepped building at 12–16 Washington Place.' },
  { id: 'nyu-gould-plaza', name: 'Gould Plaza', description: 'The shared plaza beside Stern and Courant. Photo-informed paving, skylights and seating, with an added planting proposal of trees and shrubs around the court.' },
  { id: 'bobst-library', name: 'Bobst Library', description: 'NYU’s library on the south side of Washington Square Park.' },
  { id: 'washington-square-arch', name: 'Washington Square Arch', description: 'The marble arch at the northern entrance to Washington Square Park.' },
  { id: 'lipton-hall', name: 'Lipton Hall', description: 'An NYU residence hall beside Washington Square Park.' },
  { id: 'courant-institute', name: 'Courant Institute', description: 'NYU’s center for mathematics and computer science, southeast of Washington Square Park.' },
  { id: 'stern-school-of-business', name: 'Stern School of Business', description: 'NYU’s business school beside Gould Plaza, near Washington Square Park.' },
  { id: 'nyu-john-a-paulson-center', name: paulson.name, description: `${paulson.address}. Explore the student and faculty towers above a shared podium. This map model is an architectural approximation.` },
];
