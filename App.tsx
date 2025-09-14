import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SettingsScreen from './src/screens/SettingsScreen';
import AgentsScreen from './src/screens/AgentsScreen';
import ChatScreen from './src/screens/ChatScreen';
import { ConfigContext, useConfig } from './src/store/config';
import { View, ActivityIndicator, Image } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { theme } from './src/ui/theme';

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: theme.colors.background },
};

function Root() {
  const cfg = useConfig();
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
          <Stack.Screen name="Agents" component={AgentsScreen} />
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
