// Lightweight design tokens and common styles for consistent, readable UI
import { Platform } from 'react-native';

export const theme = {
  colors: {
    background: '#F8FAFC', // slate-50
    surface: '#FFFFFF',
    text: '#111827', // gray-900
    muted: '#4B5563', // gray-600
    border: '#E5E7EB', // gray-200
    danger: '#DC2626', // red-600
    primary: '#2563EB', // blue-600
    primarySoft: '#DBEAFE', // blue-100
  },
  spacing: {
    xs: 6,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  typography: {
    h1: { fontSize: 24, lineHeight: 32, fontWeight: '600' as const, color: '#111827' },
    h2: { fontSize: 18, lineHeight: 26, fontWeight: '600' as const, color: '#111827' },
    body: { fontSize: 16, lineHeight: 24, color: '#111827' },
    bodyMuted: { fontSize: 16, lineHeight: 24, color: '#4B5563' },
    label: { fontSize: 15, lineHeight: 20, color: '#374151', fontWeight: '500' as const },
    caption: { fontSize: 12, lineHeight: 16, color: '#6B7280' },
  },
  hairline: Platform.select({ ios: 0.5, default: 1 }) as number,
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    // subtle shadow
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 10, android: 8, default: 10 }),
    backgroundColor: '#FFFFFF',
    fontSize: 16,
  },
} as const;

