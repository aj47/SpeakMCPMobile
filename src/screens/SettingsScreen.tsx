import { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, Switch, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppConfig, saveConfig, useConfigContext } from '../store/config';
import { theme } from '../ui/theme';

export default function SettingsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { config, setConfig, ready } = useConfigContext();
  const [draft, setDraft] = useState<AppConfig>(config);

  useEffect(() => {
    setDraft(config);
  }, [ready]);

  const onSave = async () => {
    const normalizedDraft = {
      ...draft,
      baseUrl: draft.baseUrl?.trim?.() ?? '',
    };
    setConfig(normalizedDraft);
    await saveConfig(normalizedDraft);
    navigation.navigate('Chat');
  };

  if (!ready) return null;

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + theme.spacing.md }]}>
      <Text style={styles.h1}>OpenAI Chat Settings</Text>

      <Text style={styles.label}>API Key</Text>
      <TextInput style={styles.input} value={draft.apiKey} onChangeText={(t)=>setDraft({ ...draft, apiKey: t })} placeholder="sk-..." autoCapitalize='none' />

      <Text style={styles.label}>Base URL</Text>
      <TextInput style={styles.input} value={draft.baseUrl} onChangeText={(t)=>setDraft({ ...draft, baseUrl: t })} placeholder='https://api.openai.com/v1' autoCapitalize='none' />

      <Text style={styles.label}>Model</Text>
      <TextInput style={styles.input} value={draft.model} onChangeText={(t)=>setDraft({ ...draft, model: t })} placeholder='gpt-4o-mini' autoCapitalize='none' />

      <View style={styles.row}>
        <Text style={styles.label}>Hands-free Voice Mode</Text>
        <Switch value={!!draft.handsFree} onValueChange={(v)=>setDraft({ ...draft, handsFree: v })} />
      </View>

      <Button title="Save & Start Chatting" onPress={onSave} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, gap: theme.spacing.md },
  h1: { ...theme.typography.h1, marginBottom: theme.spacing.xs },
  label: { ...theme.typography.label, marginTop: theme.spacing.sm },
  input: { ...theme.input },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing.sm },
});
