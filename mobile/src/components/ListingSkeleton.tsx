import React, { useEffect } from "react";
import { View, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

const { width } = Dimensions.get("window");

export default function ListingSkeleton() {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.9, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        style,
        {
          width: width - 32,
          backgroundColor: "#12121A",
          borderRadius: 20,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "#1E1E2A",
        },
      ]}
    >
      <View style={{ height: 200, backgroundColor: "#1A1A24" }} />
      <View style={{ padding: 16, gap: 8 }}>
        <View style={{ height: 24, width: "40%", backgroundColor: "#1A1A24", borderRadius: 6 }} />
        <View style={{ height: 16, width: "80%", backgroundColor: "#1A1A24", borderRadius: 6 }} />
        <View style={{ height: 12, width: "50%", backgroundColor: "#1A1A24", borderRadius: 6 }} />
      </View>
    </Animated.View>
  );
}

export function ListingSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <ListingSkeleton key={i} />
      ))}
    </View>
  );
}
