import { campusStartup } from './map-startup.js';

// Report startup/import failures without introducing a full-screen entry gate.
try {
  await import('./main.js');
} catch (error) {
  console.error('Campus startup failed:', error);
  campusStartup.fail('The map could not start. Check your connection and WebGL support, then retry.');
}
