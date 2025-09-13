import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useConfigContext } from '../store/config';
import { InkeepClient } from '../lib/inkeepClient';
import { theme } from '../ui/theme';

export default function AgentsScreen({ navigation }: any) {
  const { config, activeManageBaseUrl, activeRunBaseUrl, ready } = useConfigContext();
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<{id:string;name:string;description?:string}[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      setLoading(true); setError(null);
      try {
        const client = new InkeepClient({
          manageBaseUrl: activeManageBaseUrl,
          runBaseUrl: activeRunBaseUrl,
          apiKey: config.apiKey,
          tenantId: config.tenantId,
          projectId: config.projectId,
          graphId: config.graphId,
          model: config.model,
        });
        const okManage = await client.health('manage');
        if (!okManage) {
          throw new Error(`Manage API health check failed at ${activeManageBaseUrl}/health`);
        }
        const data = await client.listAgents();
        setAgents(data);
      } catch (e:any) {
        setError(e.message || 'Failed to load agents');
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, config, activeManageBaseUrl, activeRunBaseUrl]);

  if (!ready) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Select an Agent</Text>
      {loading && <ActivityIndicator />}
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={agents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('Chat', { agentId: item.id })}>
            <Text style={styles.name}>{item.name}</Text>
            {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: theme.spacing.lg },
  h1: { ...theme.typography.h1, marginBottom: theme.spacing.sm },
  error: { color: theme.colors.danger, marginVertical: theme.spacing.sm },
  item: { ...theme.card, marginBottom: theme.spacing.md },
  name: { ...theme.typography.h2 },
  desc: { ...theme.typography.bodyMuted, marginTop: theme.spacing.xs },
});

