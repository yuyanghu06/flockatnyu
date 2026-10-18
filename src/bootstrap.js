import { campusStartup } from './map-startup.js';
import { paintStartup } from './startup-visual.js';

// Keep real startup/import failures in the same recoverable loading overlay.
try {
  await paintStartup();
  await import('./main.js');
} catch (error) {
  console.error('Campus startup failed:', error);
  campusStartup.fail('The map could not start. Check your connection and WebGL support, then retry.');
}
