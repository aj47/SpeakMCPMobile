import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SettingsScreen from './src/screens/SettingsScreen';
import AgentsScreen from './src/screens/AgentsScreen';
import ChatScreen from './src/screens/ChatScreen';
import { ConfigContext, useConfig } from './src/store/config';
import { View, ActivityIndicator } from 'react-native';

const Stack = createNativeStackNavigator();

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
      <NavigationContainer>
        <Stack.Navigator>
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
      <StatusBar style="auto" />
      <Root />
    </>
  );
}
