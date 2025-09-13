import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type EnvChoice = 'local' | 'cloud';

export type AppConfig = {
  apiKey: string;
  tenantId: string;
  projectId: string;
  graphId: string;
  model: string; // model name required by /v1/chat/completions
  env: EnvChoice;
  // Separate base URLs for Manage API (CRUD) and Run API (chat)
  manageBaseUrlLocal: string; // e.g., http://localhost:3002
  manageBaseUrlCloud: string; // e.g., https://manage-api.example.com
  runBaseUrlLocal: string;    // e.g., http://localhost:3003
  runBaseUrlCloud: string;    // e.g., https://run-api.example.com
};

const DEFAULTS: AppConfig = {
  apiKey: '',
  tenantId: '',
  projectId: '',
  graphId: '',
  model: 'gpt-4o-mini',
  env: 'cloud',
  manageBaseUrlLocal: 'http://localhost:3002',
  manageBaseUrlCloud: 'https://manage-api.example.com',
  runBaseUrlLocal: 'http://localhost:3003',
  runBaseUrlCloud: 'https://run-api.example.com',
};

const STORAGE_KEY = 'app_config_v1';

export async function loadConfig(): Promise<AppConfig> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed } as AppConfig;
  } catch {
    return DEFAULTS;
  }
}

export async function saveConfig(cfg: AppConfig) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function useConfig() {
  const [config, setConfig] = useState<AppConfig>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const cfg = await loadConfig();
      setConfig(cfg);
      setReady(true);
    })();
  }, []);

  const activeManageBaseUrl = useMemo(
    () => (config.env === 'cloud' ? config.manageBaseUrlCloud : config.manageBaseUrlLocal),
    [config.env, config.manageBaseUrlCloud, config.manageBaseUrlLocal]
  );
  const activeRunBaseUrl = useMemo(
    () => (config.env === 'cloud' ? config.runBaseUrlCloud : config.runBaseUrlLocal),
    [config.env, config.runBaseUrlCloud, config.runBaseUrlLocal]
  );

  return { config, setConfig, ready, activeManageBaseUrl, activeRunBaseUrl } as const;
}

export const ConfigContext = createContext<ReturnType<typeof useConfig> | null>(null);
export function useConfigContext() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('ConfigContext missing');
  return ctx;
}

