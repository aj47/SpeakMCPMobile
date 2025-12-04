/**
 * Session Store for Mobile App
 * Manages multiple chat sessions with persistence via AsyncStorage
 * Adapted from SpeakMCP/src/renderer/src/stores patterns
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Session,
  SessionListItem,
  ChatMessage,
  createSession,
  generateMessageId,
  sessionToListItem,
} from '../types/session';

const SESSIONS_STORAGE_KEY = 'speakmcp_sessions_v1';
const CURRENT_SESSION_KEY = 'speakmcp_current_session_v1';

export interface SessionStore {
  sessions: Session[];
  currentSessionId: string | null;
  isLoading: boolean;

  // Actions
  loadSessions: () => Promise<void>;
  createNewSession: (firstMessage?: string) => Session;
  setCurrentSession: (sessionId: string | null) => void;
  getCurrentSession: () => Session | null;
  addMessageToSession: (sessionId: string, role: 'user' | 'assistant', content: string) => void;
  updateSessionMessages: (sessionId: string, messages: ChatMessage[]) => void;
  setServerConversationId: (sessionId: string, serverConversationId: string) => void;
  deleteSession: (sessionId: string) => void;
  clearAllSessions: () => void;
  getSessionList: () => SessionListItem[];
}

/**
 * Load sessions from AsyncStorage
 */
async function loadSessionsFromStorage(): Promise<Session[]> {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[SessionStore] Failed to load sessions:', error);
    return [];
  }
}

/**
 * Save sessions to AsyncStorage
 */
async function saveSessionsToStorage(sessions: Session[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch (error) {
    console.error('[SessionStore] Failed to save sessions:', error);
  }
}

/**
 * Load current session ID from AsyncStorage
 */
async function loadCurrentSessionId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(CURRENT_SESSION_KEY);
  } catch {
    return null;
  }
}

/**
 * Save current session ID to AsyncStorage
 */
async function saveCurrentSessionId(sessionId: string | null): Promise<void> {
  try {
    if (sessionId) {
      await AsyncStorage.setItem(CURRENT_SESSION_KEY, sessionId);
    } else {
      await AsyncStorage.removeItem(CURRENT_SESSION_KEY);
    }
  } catch (error) {
    console.error('[SessionStore] Failed to save current session ID:', error);
  }
}

/**
 * Hook to create and manage the session store
 */
export function useSessionStore(): SessionStore {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load sessions on mount
  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    const [loadedSessions, savedCurrentId] = await Promise.all([
      loadSessionsFromStorage(),
      loadCurrentSessionId(),
    ]);
    setSessions(loadedSessions);
    // Only set current session if it exists in loaded sessions
    if (savedCurrentId && loadedSessions.some(s => s.id === savedCurrentId)) {
      setCurrentSessionIdState(savedCurrentId);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Persist sessions whenever they change
  useEffect(() => {
    if (!isLoading) {
      saveSessionsToStorage(sessions);
    }
  }, [sessions, isLoading]);

  const setCurrentSession = useCallback((sessionId: string | null) => {
    setCurrentSessionIdState(sessionId);
    saveCurrentSessionId(sessionId);
  }, []);

  const createNewSession = useCallback((firstMessage?: string): Session => {
    const newSession = createSession(firstMessage);
    setSessions(prev => [newSession, ...prev]);
    setCurrentSession(newSession.id);
    return newSession;
  }, [setCurrentSession]);

  const getCurrentSession = useCallback((): Session | null => {
    if (!currentSessionId) return null;
    return sessions.find(s => s.id === currentSessionId) || null;
  }, [currentSessionId, sessions]);

  const addMessageToSession = useCallback((
    sessionId: string,
    role: 'user' | 'assistant',
    content: string
  ) => {
    setSessions(prev => prev.map(session => {
      if (session.id !== sessionId) return session;
      const newMessage: ChatMessage = {
        id: generateMessageId(),
        role,
        content,
        timestamp: Date.now(),
      };
      return {
        ...session,
        updatedAt: Date.now(),
        messages: [...session.messages, newMessage],
      };
    }));
  }, []);

  const updateSessionMessages = useCallback((sessionId: string, messages: ChatMessage[]) => {
    setSessions(prev => prev.map(session => {
      if (session.id !== sessionId) return session;
      return { ...session, updatedAt: Date.now(), messages };
    }));
  }, []);

  const setServerConversationId = useCallback((sessionId: string, serverConversationId: string) => {
    console.log('[SessionStore] setServerConversationId called:', { sessionId, serverConversationId });
    setSessions(prev => {
      const updated = prev.map(session => {
        if (session.id !== sessionId) return session;
        console.log('[SessionStore] Updating session with serverConversationId:', serverConversationId);
        return { ...session, serverConversationId };
      });
      console.log('[SessionStore] Sessions after update:', updated.map(s => ({ id: s.id, serverConversationId: s.serverConversationId })));
      return updated;
    });
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      setCurrentSession(null);
    }
  }, [currentSessionId, setCurrentSession]);

  const clearAllSessions = useCallback(() => {
    setSessions([]);
    setCurrentSession(null);
  }, [setCurrentSession]);

  const getSessionList = useCallback((): SessionListItem[] => {
    return sessions
      .map(sessionToListItem)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [sessions]);

  return {
    sessions,
    currentSessionId,
    isLoading,
    loadSessions,
    createNewSession,
    setCurrentSession,
    getCurrentSession,
    addMessageToSession,
    updateSessionMessages,
    setServerConversationId,
    deleteSession,
    clearAllSessions,
    getSessionList,
  };
}

export const SessionContext = createContext<SessionStore | null>(null);

export function useSessionContext(): SessionStore {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('SessionContext missing - wrap your app with SessionContext.Provider');
  return ctx;
}

