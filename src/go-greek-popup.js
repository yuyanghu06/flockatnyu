// Temporary visual-only popup. Set enabled:false and rebuild to restore the
// untouched source tower as ordinary context. No date was supplied for expiry.
// Keep this module pure data: importing configuration must not load the model.
export const goGreekPopup = Object.freeze({
  enabled: true,
  id: '683-broadway',
  tile: 'tile-1_1.glb',
  name: 'Go Greek',
  description: 'Go Greek is a temporary popup at 683 Broadway, within the 250 Mercer complex. This image-informed model approximates the red brick corner tower, pale masonry and planted rooftop with a water tank.',
  camera: Object.freeze({
    azimuth: 13,
    polar: 48,
    heightScale: .9,
    basis: 'User image: long W 3rd Street elevation and Broadway corner, planted rooftop visible',
  }),
});
