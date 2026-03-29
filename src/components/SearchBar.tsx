import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { searchHistoricalElement, SearchResult } from '../services/geminiService';
import { AIKeyButton } from './AIKeyButton';

interface SearchBarProps {
  lang: 'en' | 'fa';
  onSearchResult: (result: SearchResult) => void;
  setShowSettings: (show: boolean) => void;
}

export function SearchBar({ lang, onSearchResult, setShowSettings }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      const result = await searchHistoricalElement(query, lang);
      if (result) {
        onSearchResult(result);
        setQuery('');
      } else {
        setError(lang === 'en' ? 'No results found.' : 'نتیجه‌ای یافت نشد.');
      }
    } catch (err) {
      setError(lang === 'en' ? 'An error occurred during search.' : 'خطایی در جستجو رخ داد.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="relative pointer-events-auto flex items-center gap-2">
      <form onSubmit={handleSearch} className="relative flex items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={lang === 'en' ? 'AI Search...' : 'جستجوی هوشمند...'}
          className="w-40 sm:w-56 md:w-72 liquid-glass hover:border-indigo-500/30 text-white text-[13px] rounded-2xl py-2 px-10 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 placeholder-slate-500 transition-all shadow-inner"
          dir={lang === 'fa' ? 'rtl' : 'ltr'}
        />
        <div className="absolute left-3 p-1.5 text-indigo-400/50">
          <Search className="w-4 h-4" />
        </div>
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="absolute right-3 p-1.5 text-indigo-400 hover:text-indigo-300 disabled:opacity-50 transition-colors"
        >
          {isSearching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <div className="text-[10px] font-bold text-indigo-400/50 group-hover:text-indigo-400 transition-colors">GO</div>
          )}
        </button>
      </form>
      <AIKeyButton onClick={() => setShowSettings(true)} />
      {error && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] py-1 px-3 rounded-lg text-center backdrop-blur-md z-50">
          {error}
        </div>
      )}
    </div>
  );
}
