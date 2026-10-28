import React, { createContext, useContext, useState, useEffect } from 'react';
import { isFlagOn } from '../lib/flags';
import { fetchServerAiStatus } from '../services/aiTransport';


type PersistMode = 'memory' | 'local';

interface ApiKeyContextType {
  apiKey: string;
  setApiKey: (key: string, persistMode?: PersistMode) => void;
  persistMode: PersistMode;
  isReady: boolean;
  /** shared server AI is switched on (ff_server_ai + server kill switch off): AI works without a personal key */
  serverAi: boolean;
  /** a personal key OR the shared server AI: use this to enable AI buttons */
  canUseAi: boolean;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

export const ApiKeyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiKey, setApiKeyState] = useState('');
  const [persistMode, setPersistModeState] = useState<PersistMode>('memory');
  const [isReady, setIsReady] = useState(false);
  const [serverAi, setServerAi] = useState(false);

  useEffect(() => {
    if (isFlagOn('server_ai')) fetchServerAiStatus().then(setServerAi);
  }, []);

  useEffect(() => {
    const storedKey = localStorage.getItem('user_gemini_key');
    if (storedKey) {
      setApiKeyState(storedKey);
      setPersistModeState('local');
    }
    setIsReady(true);
  }, []);

  const setApiKey = (key: string, newPersistMode: PersistMode = 'memory') => {
    setApiKeyState(key);
    setPersistModeState(newPersistMode);

    if (newPersistMode === 'local' && key) {
      localStorage.setItem('user_gemini_key', key);
    } else {
      localStorage.removeItem('user_gemini_key');
    }
  };

  return (
    <ApiKeyContext.Provider value={{ apiKey, setApiKey, persistMode, isReady, serverAi, canUseAi: !!apiKey || serverAi }}>
      {children}
    </ApiKeyContext.Provider>
  );
};

export const useApiKey = () => {
  const context = useContext(ApiKeyContext);
  if (context === undefined) {
    throw new Error('useApiKey must be used within an ApiKeyProvider');
  }
  return context;
};
