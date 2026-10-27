# Map camera and input

`camera-focus.js` manages smooth focus/return, `map-focus-layout.js` reserves
screen space for cards and portraits, `map-interactions.js` handles map gestures,
and `keyboard-pan.js` handles WASD navigation. These modules receive the camera
and controls from `src/app`; preserve exact external-camera restoration and
selection behavior.
