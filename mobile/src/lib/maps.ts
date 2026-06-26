// Native entry point for map components.
//
// On web, metro resolves `maps.web.tsx` instead (platform-specific resolution),
// which keeps `react-native-maps` — whose Fabric native specs crash at load
// time on web — out of the web bundle entirely.
export {
  default,
  Marker,
  Polygon,
  Polyline,
  Circle,
  Callout,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
} from "react-native-maps";
export type { Region } from "react-native-maps";
