import { Tabs } from "expo-router";
import { View, Text } from "react-native";
import { Home, Search, PlusCircle, Heart, User } from "lucide-react-native";

interface TabIconProps {
  focused: boolean;
  icon: React.ReactNode;
  label: string;
}

function TabIcon({ focused, icon, label }: TabIconProps) {
  return (
    <View style={{ alignItems: "center", paddingTop: 8 }}>
      {icon}
      <Text style={{
        fontSize: 10, marginTop: 3,
        color: focused ? "#D4A843" : "#3A3A4A",
        fontWeight: focused ? "700" : "500",
      }}>
        {label}
      </Text>
    </View>
  );
}

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0E0E16",
          borderTopColor: "#1A1A2A",
          borderTopWidth: 1,
          height: 88,
          paddingBottom: 16,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={<Home size={22} color={focused ? "#D4A843" : "#3A3A4A"} strokeWidth={focused ? 2.5 : 2} />}
              label="Home"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={<Search size={22} color={focused ? "#D4A843" : "#3A3A4A"} strokeWidth={focused ? 2.5 : 2} />}
              label="Search"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="post"
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={{
              width: 52, height: 52, borderRadius: 26,
              backgroundColor: "#D4A843",
              alignItems: "center", justifyContent: "center",
              marginTop: -8,
              shadowColor: "#D4A843", shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4, shadowRadius: 12,
            }}>
              <PlusCircle size={26} color="#0A0A0F" strokeWidth={2.5} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={<Heart size={22} color={focused ? "#D4A843" : "#3A3A4A"} strokeWidth={focused ? 2.5 : 2} />}
              label="Saved"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={<User size={22} color={focused ? "#D4A843" : "#3A3A4A"} strokeWidth={focused ? 2.5 : 2} />}
              label="Profile"
            />
          ),
        }}
      />
    </Tabs>
  );
}
