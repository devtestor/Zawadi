// Web shim for `react-native-maps`.
//
// react-native-maps ships Fabric native component specs (codegenNativeComponent)
// that throw at module-load time when bundled for web, which crashes the whole
// app. Metro's platform-specific resolution loads this `.web` file on web (and
// `maps.ts` on native), so map screens render a harmless placeholder instead.
//
// Authored as `.ts` (no JSX, via React.createElement) to match the project's
// existing `.web.ts` resolution pattern (see useColorScheme.web.ts).
import { createElement } from "react";
import { View, Text, StyleSheet } from "react-native";
import type { ViewProps } from "react-native";

export const PROVIDER_DEFAULT = undefined;
export const PROVIDER_GOOGLE = "google";

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

// Markers/overlays have no visual on web — render nothing.
export function Marker(_props: any): null {
  return null;
}
export function Polygon(_props: any): null {
  return null;
}
export function Polyline(_props: any): null {
  return null;
}
export function Circle(_props: any): null {
  return null;
}
export function Callout(_props: any): null {
  return null;
}

function MapView({ style, children }: ViewProps & Record<string, any>) {
  return createElement(
    View,
    { style: [styles.container, style] },
    createElement(Text, { style: styles.label }, "Map view is unavailable on web"),
    children,
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e5e7eb",
  },
  label: {
    color: "#6b7280",
    fontSize: 13,
  },
});

export default MapView;
