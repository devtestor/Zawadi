import React from "react";
import { View, Text, Pressable } from "react-native";
import { captureException } from "@/lib/sentry";

interface State {
  err: Error | null;
}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    captureException(err, { componentStack: info.componentStack });
  }

  reset = () => this.setState({ err: null });

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: "#0A0A0F", padding: 32, justifyContent: "center" }}>
        <Text style={{ fontSize: 36, marginBottom: 12 }}>🛠️</Text>
        <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "800", marginBottom: 8 }}>
          Something went wrong
        </Text>
        <Text style={{ color: "#888", fontSize: 14, lineHeight: 20, marginBottom: 20 }}>
          {this.state.err.message || "An unexpected error occurred."}
        </Text>
        <Pressable
          onPress={this.reset}
          style={{ backgroundColor: "#D4A843", padding: 14, borderRadius: 12, alignItems: "center" }}
        >
          <Text style={{ color: "#0A0A0F", fontWeight: "800" }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}
