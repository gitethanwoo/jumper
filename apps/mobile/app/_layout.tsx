import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import 'react-native-reanimated';

import '../global.css';

import { Drawer } from '@/components/drawer';
import { useColorScheme } from '@/components/useColorScheme';
import { BridgeProvider, useBridge } from '@/lib/bridge/bridge-provider';
import { DrawerProvider } from '@/lib/drawer-context';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <BridgeProvider>
      <DrawerProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <ConnectLinkHandler />
          <Stack
            screenOptions={{
              headerStyle: {
                backgroundColor: '#FAFAF9',
              },
              headerTintColor: '#1C1917',
              headerShadowVisible: false,
              headerTitleStyle: {
                fontWeight: '700',
                fontSize: 17,
              },
            }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="connect" options={{ headerShown: false }} />
            <Stack.Screen name="settings" />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          </Stack>
          <Drawer />
        </ThemeProvider>
      </DrawerProvider>
    </BridgeProvider>
  );
}

function ConnectLinkHandler() {
  const bridge = useBridge();
  const bridgeRef = useRef(bridge);

  useEffect(() => {
    bridgeRef.current = bridge;
  }, [bridge]);

  useEffect(() => {
    const processUrl = (url: string) => {
      void bridgeRef.current.handleConnectLink(url);
    };

    void Linking.getInitialURL().then((url) => {
      if (!url) return;
      processUrl(url);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      processUrl(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return null;
}
