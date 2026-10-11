import { loadingScreen } from './loading-screen.js';

// Keep the static opaque screen available even if the map module cannot start.
try {
  await import('./main.js');
} catch (error) {
  console.error('Campus startup failed:', error);
  loadingScreen.fail('The map could not start. Check your connection and WebGL support, then retry.');
}
