import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SettingsScreen from './src/screens/SettingsScreen';
import ChatScreen from './src/screens/ChatScreen';
import { ConfigContext, useConfig, saveConfig } from './src/store/config';
import { View, ActivityIndicator, Image } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { theme } from './src/ui/theme';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: theme.colors.background },
};

function parseDeepLink(url: string | null) {
  if (!url) return null;
  try {
    const parsed = Linking.parse(url);
    // Handle speakmcp://config?baseUrl=...&apiKey=...
    if (parsed.path === 'config' || parsed.hostname === 'config') {
      const { baseUrl, apiKey } = parsed.queryParams || {};
      if (baseUrl || apiKey) {
        return {
          baseUrl: typeof baseUrl === 'string' ? baseUrl : undefined,
          apiKey: typeof apiKey === 'string' ? apiKey : undefined,
        };
      }
    }
  } catch (e) {
    console.warn('Failed to parse deep link:', e);
  }
  return null;
}

function Root() {
  const cfg = useConfig();

  // Handle deep links
  useEffect(() => {
    if (!cfg.ready) return;

    const handleUrl = async (url: string | null) => {
      const params = parseDeepLink(url);
      if (params) {
        const newConfig = {
          ...cfg.config,
          ...(params.baseUrl && { baseUrl: params.baseUrl }),
          ...(params.apiKey && { apiKey: params.apiKey }),
        };
        cfg.setConfig(newConfig);
        await saveConfig(newConfig);
      }
    };

    // Handle initial URL (app opened via deep link)
    Linking.getInitialURL().then(handleUrl);

    // Handle URL when app is already open
    const subscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });

    return () => subscription.remove();
  }, [cfg.ready]);

  if (!cfg.ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <ConfigContext.Provider value={cfg}>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          screenOptions={{
            headerTitleStyle: { ...theme.typography.h2 },
            contentStyle: { backgroundColor: theme.colors.background },
            headerLeft: () => (
              <Image
                source={require('./assets/favicon.png')}
                style={{ width: 28, height: 28, marginLeft: 12, marginRight: 8 }}
                resizeMode="contain"
              />
            ),
          }}
        >
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </ConfigContext.Provider>
  );
}

export default function App() {
  return (
    <>
      <StatusBar style="dark" />
      <SafeAreaProvider>
        <Root />
      </SafeAreaProvider>
    </>
  );
}
