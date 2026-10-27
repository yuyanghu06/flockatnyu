// Campus rectangle: x [-960,960], z [-960,1152] meters, matching config.js.
// Explicit imports include only this bounded map area in the production build.
import { tiles1 } from './tiles-1.js';
import { tiles2 } from './tiles-2.js';
export const tiles = [...tiles1, ...tiles2];

export const assets = {
  'bobst-library': new URL(
    '../../../assets/yuyang-site-3d-assets/models/buildings/bobst-library.glb',
    import.meta.url,
  ).href,
  'washington-square-arch': new URL(
    '../../../assets/yuyang-site-3d-assets/models/buildings/washington-square-arch.glb',
    import.meta.url,
  ).href,
  'lipton-hall': new URL(
    '../../../assets/yuyang-site-3d-assets/models/buildings/lipton-hall.glb',
    import.meta.url,
  ).href,
  '25-union-square-west': new URL(
    '../../../assets/yuyang-site-3d-assets/models/buildings/25-union-square-west.glb',
    import.meta.url,
  ).href,
  '235-park-avenue-south': new URL(
    '../../../assets/yuyang-site-3d-assets/models/buildings/235-park-avenue-south.glb',
    import.meta.url,
  ).href,
  'courant-institute': new URL(
    '../../../assets/yuyang-site-3d-assets/models/buildings/courant-institute.glb',
    import.meta.url,
  ).href,
  'stern-school-of-business': new URL(
    '../../../assets/yuyang-site-3d-assets/models/buildings/stern-school-of-business.glb',
    import.meta.url,
  ).href,
  'washington-square-trees': new URL(
    '../../../assets/yuyang-site-3d-assets/models/environment/washington-square-trees.glb',
    import.meta.url,
  ).href,
  'park-grass': new URL(
    '../../../assets/yuyang-site-3d-assets/models/environment/park-grass.glb',
    import.meta.url,
  ).href,
  'washington-square-fountain': new URL(
    '../../../assets/yuyang-site-3d-assets/models/environment/washington-square-fountain.glb',
    import.meta.url,
  ).href,
  'gould-plaza': new URL(
    '../../../assets/yuyang-site-3d-assets/models/environment/gould-plaza.glb',
    import.meta.url,
  ).href,
  'courant-garden': new URL(
    '../../../assets/yuyang-site-3d-assets/models/environment/courant-garden.glb',
    import.meta.url,
  ).href,
  'nyu-john-a-paulson-center': new URL(
    '../../../assets/campus-assets/models/buildings/john-a-paulson-center.glb',
    import.meta.url,
  ).href,
};
