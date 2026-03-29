import React, { useState } from 'react';
import { X, Key, Shield, AlertTriangle, CheckCircle, ExternalLink, Loader2 } from 'lucide-react';
import { useApiKey } from '../context/ApiKeyContext';

interface SettingsModalProps {
  onClose: () => void;
  lang: 'en' | 'fa';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, lang }) => {
  const { apiKey, setApiKey, persistMode } = useApiKey();
  const [inputKey, setInputKey] = useState(apiKey);
  const [localPersist, setLocalPersist] = useState(persistMode === 'local');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const t = {
    title: lang === 'en' ? 'API Settings' : 'تنظیمات API',
    keyPlaceholder: lang === 'en' ? 'Enter your Gemini API Key' : 'کلید API جمینای خود را وارد کنید',
    getFreeKey: lang === 'en' ? 'Get a free key at Google AI Studio' : 'دریافت کلید رایگان از Google AI Studio',
    persistenceHeader: lang === 'en' ? 'Save Mode' : 'حالت ذخیره',
    memoryMode: lang === 'en' ? 'Memory Only (Secure)' : 'فقط در حافظه (امن)',
    memoryDesc: lang === 'en' ? 'Cleared when you close the tab. Safest for shared devices.' : 'با بستن تب پاک می‌شود. امن‌ترین برای دستگاه‌های مشترک.',
    diskMode: lang === 'en' ? 'Save on this device' : 'ذخیره در این دستگاه',
    diskDesc: lang === 'en' ? 'Stored locally in your browser. Only use on your personal device. Do not use on shared or public computers.' : 'به صورت محلی در مرورگر شما ذخیره می‌شود. فقط در دستگاه شخصی خود استفاده کنید. در رایانه‌های مشترک یا عمومی استفاده نکنید.',
    validateSave: lang === 'en' ? 'Validate & Save' : 'اعتبارسنجی و ذخیره',
    validating: lang === 'en' ? 'Validating...' : 'در حال اعتبارسنجی...',
    success: lang === 'en' ? 'Key validated successfully!' : 'کلید با موفقیت تأیید شد!',
    clearKey: lang === 'en' ? 'Remove Key' : 'حذف کلید',
    neverStoredServer: lang === 'en' ? 'Your key is never sent to our servers. It communicates directly with Google.' : 'کلید شما هرگز به سرورهای ما ارسال نمی‌شود. ارتباط مستقیم با گوگل برقرار می‌کند.'
  };

  const handleValidateAndSave = async () => {
    if (!inputKey.trim()) {
      setError(lang === 'en' ? 'Please enter a key' : 'لطفاً یک کلید وارد کنید');
      return;
    }

    setIsValidating(true);
    setError(null);
    setSuccess(false);

    try {
      // Lightweight validation call
      const { GoogleGenAI } = await import('@google/genai');
      const testAi = new GoogleGenAI({ apiKey: inputKey.trim() });
      try {
        await testAi.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: 'reply "ok"',
        });
      } catch (validationErr: any) {
        // Fallback validation if 3-flash-preview is overloaded (503)
        if (validationErr?.message?.includes("503") || validationErr?.status === "UNAVAILABLE") {
          console.warn('Gemini 3 Flash busy, validating with 1.5 Flash instead...');
          await testAi.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: 'reply "ok"',
          });
        } else {
          throw validationErr;
        }
      }

      setApiKey(inputKey.trim(), localPersist ? 'local' : 'memory');
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Key validation failed:', err);
      setError(lang === 'en' ? 'Invalid API Key or network error.' : 'کلید API نامعتبر است یا خطای شبکه رخ داده است.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleClear = () => {
    setApiKey('', 'memory');
    setInputKey('');
    setSuccess(false);
    setError(null);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div 
        className="w-full max-w-md liquid-glass-heavy rounded-3xl p-6 shadow-2xl relative border border-white/10"
        dir={lang === 'fa' ? 'rtl' : 'ltr'}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 rtl:right-auto rtl:left-4 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-2xl">
            <Key className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white">{t.title}</h2>
        </div>

        <div className="space-y-6">
          {/* Key Input */}
          <div>
            <div className="relative">
              <input
                type="password"
                value={inputKey}
                onChange={(e) => {
                  setInputKey(e.target.value);
                  setError(null);
                }}
                placeholder={t.keyPlaceholder}
                className="w-full liquid-glass text-white placeholder-slate-500 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-sm"
              />
            </div>
            <a 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {t.getFreeKey}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Persistence Options */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-300">{t.persistenceHeader}</h3>
            
            <button
              onClick={() => setLocalPersist(false)}
              className={`w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
                !localPersist 
                  ? 'bg-indigo-500/10 border-indigo-500/50' 
                  : 'bg-black/20 border-white/5 hover:bg-black/30'
              }`}
            >
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                !localPersist ? 'border-indigo-400' : 'border-slate-500'
              }`}>
                {!localPersist && <div className="w-2 h-2 bg-indigo-400 rounded-full" />}
              </div>
              <div>
                <div className={`font-medium text-sm ${!localPersist ? 'text-indigo-200' : 'text-slate-300'}`}>
                  {t.memoryMode}
                </div>
                <div className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {t.memoryDesc}
                </div>
              </div>
            </button>

            <button
              onClick={() => setLocalPersist(true)}
              className={`w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all ${
                localPersist 
                  ? 'bg-amber-500/10 border-amber-500/50' 
                  : 'bg-black/20 border-white/5 hover:bg-black/30'
              }`}
            >
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                localPersist ? 'border-amber-400' : 'border-slate-500'
              }`}>
                {localPersist && <div className="w-2 h-2 bg-amber-400 rounded-full" />}
              </div>
              <div>
                <div className={`font-medium text-sm flex items-center gap-2 ${localPersist ? 'text-amber-200' : 'text-slate-300'}`}>
                  {t.diskMode}
                  {localPersist && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                </div>
                <div className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {t.diskDesc}
                </div>
              </div>
            </button>
          </div>

          {/* Messages */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          
          {success && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              {t.success}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            {apiKey && (
              <button
                onClick={handleClear}
                className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-medium transition-colors"
              >
                {t.clearKey}
              </button>
            )}
            <button
              onClick={handleValidateAndSave}
              disabled={isValidating || !inputKey.trim()}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-3 px-4 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t.validating}
                </>
              ) : (
                t.validateSave
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500 justify-center">
            <Shield className="w-3.5 h-3.5" />
            {t.neverStoredServer}
          </div>
        </div>
      </div>
    </div>
  );
};
