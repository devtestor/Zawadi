import { useEffect } from "react";
import { Platform, View } from "react-native";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "@/lib/useColorScheme";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useSession } from "@/lib/auth/use-session";
import { registerForPushNotifications } from "@/lib/push";
import { installOfflineFavoritesSync } from "@/lib/offline-favorites";
import ErrorBoundary from "@/components/ErrorBoundary";

SplashScreen.preventAutoHideAsync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const queryClient = new QueryClient();

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { data: session, isLoading } = useSession();

  useEffect(() => {
    if (!session?.user) return;
    registerForPushNotifications();
    installOfflineFavoritesSync();
  }, [session?.user]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string; conversationId?: string };
      if (data?.type === "chat" && data.conversationId) {
        router.push({ pathname: "/chat/[id]" as any, params: { id: data.conversationId } });
      }
    });
    return () => sub.remove();
  }, []);

  if (isLoading) return null;

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!session?.user}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="listing/[id]" />
          <Stack.Screen name="listing/edit/[id]" options={{ presentation: "modal" }} />
          <Stack.Screen name="boost/[id]" />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="seller/[id]" />
          <Stack.Screen name="listing/analytics/[id]" />
          <Stack.Screen name="listing/compare" />
          <Stack.Screen name="listing/bids/[id]" />
          <Stack.Screen name="trade/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={!session?.user}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="verify-otp" />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}

// On web, constrain the mobile-shaped UI to a phone-width column centered on a
// dark page background so desktop viewers see an app frame, not a stretched UI.
// Native platforms get the bare content.
function WebPhoneFrame({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== "web") return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: "#05050A", alignItems: "center" }}>
      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 480,
          backgroundColor: "#0A0A0F",
          boxShadow: "0 0 60px rgba(0,0,0,0.6)",
        }}
      >
        {children}
      </View>
    </View>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <WebPhoneFrame>
              <RootLayoutNav />
            </WebPhoneFrame>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
