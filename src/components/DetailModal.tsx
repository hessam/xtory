import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MapPin, Calendar, Crown, Shield, Sparkles, BookOpen, Send, Globe, Swords, Skull, Landmark, Globe2, Users } from 'lucide-react';
import { ReignEvent } from '../data/events';
import { Ruler } from '../data/rulers';
import { Dynasty } from '../data/dynasties';
import { regions } from '../data/regions';
import { HistoricalEvent } from '../data/historicalEvents';
import { HistoricalFigure } from '../data/figures';
import { Artifact } from '../data/artifacts';
import { generateBiography, generateAlternateHistory, chatWithAssistant, generateHistoricalEventWhatIf, generateLineage, LineageData, SearchResult } from '../services/geminiService';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markAIUsed } from '../services/tagManager';

const LineageDisplay = ({ data, lang }: { data: LineageData, lang: 'en' | 'fa' }) => {
  const renderSection = (titleEn: string, titleFa: string, items: any[]) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="mb-4 last:mb-0">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{lang === 'en' ? titleEn : titleFa}</h4>
        <div className="flex flex-col gap-2">
          {items.map((item, idx) => (
            <div key={idx} className="p-3 liquid-glass rounded-xl border border-white/10 flex flex-col gap-1 shrink-0">
              <div className="flex justify-between items-start">
                <span className="font-medium text-white text-sm">{lang === 'en' ? item.nameEn : item.nameFa}</span>
                <span className="text-xs text-rose-300 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">{lang === 'en' ? item.relationEn : item.relationFa}</span>
              </div>
              {(item.noteEn || item.noteFa) && (
                <p className="text-xs text-slate-400 mt-1">{lang === 'en' ? item.noteEn : item.noteFa}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-1">
      {renderSection('Parents', 'والدین', data.parents)}
      {renderSection('Spouses', 'همسران', data.spouses)}
      {renderSection('Children', 'فرزندان', data.children)}
      {renderSection('Notable Relatives', 'بستگان سرشناس', data.notableRelatives)}
      {(!data.parents?.length && !data.spouses?.length && !data.children?.length && !data.notableRelatives?.length) && (
        <p className="text-sm text-slate-400 italic text-center py-4">
          {lang === 'en' ? 'No detailed lineage records found.' : 'هیچ سابقه تبارنامه دقیقی یافت نشد.'}
        </p>
      )}
    </div>
  );
};

const WikipediaLink = ({ query, lang }: { query: string, lang: 'en' | 'fa' }) => (
  <a
    href={`https://${lang}.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 ml-3 text-xs font-sans font-medium text-slate-300 bg-slate-800/80 border border-slate-700 hover:bg-slate-700 hover:text-white hover:border-slate-600 rounded-lg transition-all align-middle shadow-sm"
    title={lang === 'en' ? 'Search on Wikipedia' : 'جستجو در ویکی‌پدیا'}
    onClick={(e) => e.stopPropagation()}
  >
    <Globe className="w-3.5 h-3.5" />
    <span>{lang === 'en' ? 'Wikipedia' : 'ویکی‌پدیا'}</span>
  </a>
);

function getControlExplanation(lang: 'en' | 'fa', status: string, isAiGenerated?: boolean): string {
  const statusMappings: Record<string, {en: string, fa: string}> = {
    'Direct Control': {
      en: 'The ruling power holds direct administrative and military control over this region, integrating it fully into the state apparatus.',
      fa: 'قدرت حاکم کنترل مستقیم اداری و نظامی بر این منطقه دارد و آن را کاملاً در دستگاه دولتی ادغام کرده است.'
    },
    'Partial Control': {
      en: 'The dynasty held full sovereignty over the portion of this region within its borders. The mapped area extends beyond the actual territory — parts of this region belonged to other polities.',
      fa: 'این سلسله حاکمیت کامل بر بخشی از این منطقه که در مرزهایش قرار داشت، اعمال می‌کرد. منطقه نمایش داده شده فراتر از قلمرو واقعی گسترش می‌یابد — بخش‌هایی از این منطقه تحت حکومت‌های دیگر بود.'
    },
    'Vassal State': {
      en: 'Operates under local autonomy but pays tribute and absolute political allegiance to the central dynasty.',
      fa: 'تحت استقلال محلی عمل می‌کند اما به خاندان مرکزی خراج و وفاداری سیاسی مطلق می‌پردازد.'
    },
    'Sphere of Influence': {
      en: 'Not directly administered, but firmly under the cultural, economic, or diplomatic dominance of the ruling dynasty.',
      fa: 'به‌طور مستقیم اداره نمی‌شود، اما کاملاً تحت تسلط فرهنگی، اقتصادی یا دیپلماتیک خاندان حاکم است.'
    },
    'Contested/Warzone': {
      en: 'A volatile frontier currently experiencing active conflict, shifting borders, or fractured rival control.',
      fa: 'مرزی ناپایدار که در حال حاضر درگیر جنگ فعال، جابجایی مرزها یا کنترل تکه‌تکه شده است.'
    }
  };
  const baseDef = statusMappings[status] ? statusMappings[status][lang] : statusMappings['Direct Control'][lang];
  const aiNote = isAiGenerated 
    ? (lang === 'en' ? ' This evaluation was dynamically inferred by AI based on surrounding historical contexts.' : ' این ارزیابی به‌صورت پویا توسط هوش مصنوعی بر اساس زمینه‌های تاریخی پیرامون تخمین زده شده است.') 
    : (lang === 'en' ? ' Based on verified, static historical records.' : ' تایید شده بر اساس اسناد تاریخی قطعی.');
  
  return baseDef + aiNote;
}


interface DetailModalProps {
  eventId: string | null;
  regionId: string | null;
  historicalEvent?: HistoricalEvent | null;
  figure?: HistoricalFigure | null;
  artifact?: Artifact | null;
  searchResult?: SearchResult | null;
  year: number;
  lang: 'en' | 'fa';
  onClose: () => void;
  events: ReignEvent[];
  rulers: Record<string, Ruler>;
  dynasties: Record<string, Dynasty>;
}

export const DetailModal: React.FC<DetailModalProps> = ({ eventId, regionId, historicalEvent, figure, artifact, searchResult, year, lang, onClose, events, rulers, dynasties }) => {
  const [activeTab, setActiveTab] = useState<'details' | 'biography' | 'whatif' | 'context' | 'lineage'>('details');
  const [aiContent, setAiContent] = useState<string | null>(null);
  const [lineageData, setLineageData] = useState<LineageData | string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customWhatIf, setCustomWhatIf] = useState('');

  if (!eventId && !regionId && !historicalEvent && !figure && !artifact && !searchResult) return null;

  const handleGenerateLineage = async (personName: string, context: string) => {
    markAIUsed();
    setIsGenerating(true);
    setActiveTab('lineage');
    const data = await generateLineage(personName, context, lang);
    setLineageData(data);
    setIsGenerating(false);
  };

  const handleGenerateBiography = async (name: string, title: string, dynasty: string, startYear?: number) => {
    markAIUsed();
    setIsGenerating(true);
    setActiveTab('biography');
    const content = await generateBiography(name, title, dynasty, lang, startYear || year);
    setAiContent(content);
    setIsGenerating(false);
  };

  const handleGenerateWhatIf = async (eventDesc: string, rulerName: string, regionName: string, year: number, customPrompt?: string) => {
    markAIUsed();
    setIsGenerating(true);
    setActiveTab('whatif');
    const content = await generateAlternateHistory(eventDesc, rulerName, regionName, year, lang, customPrompt);
    setAiContent(content);
    setIsGenerating(false);
  };

  const handleGenerateHistoricalEventWhatIfAction = async (eventTitle: string, eventDesc: string, year: number, customPrompt?: string) => {
    markAIUsed();
    setIsGenerating(true);
    setActiveTab('whatif');
    const content = await generateHistoricalEventWhatIf(eventTitle, eventDesc, year, lang, customPrompt);
    setAiContent(content);
    setIsGenerating(false);
  };

  const handleGenerateRegionContext = async (regionName: string, year: number) => {
    markAIUsed();
    setIsGenerating(true);
    setActiveTab('context');
    const prompt = lang === 'en'
      ? `Provide a brief historical context for the region of ${regionName} around the year ${Math.abs(year)} ${year < 0 ? 'BC' : 'AD'}. What was life like? Who was in control? What were the major cultural or political shifts happening? Keep it engaging and around 150-200 words.`
      : `یک زمینه تاریخی مختصر برای منطقه ${regionName} در حدود سال ${Math.abs(year)} ${year < 0 ? 'ق.م' : 'م'} ارائه دهید. زندگی چگونه بود؟ چه کسی کنترل را در دست داشت؟ تغییرات عمده فرهنگی یا سیاسی چه بود؟ جذاب و حدود ۱۵۰ تا ۲۰۰ کلمه باشد.`;
    
    const content = await chatWithAssistant([], prompt, lang);
    setAiContent(content);
    setIsGenerating(false);
  };

  const handleGenerateEventContext = async (eventTitle: string, eventDesc: string, year: number) => {
    markAIUsed();
    setIsGenerating(true);
    setActiveTab('context');
    const prompt = lang === 'en'
      ? `Provide a detailed historical context and the aftermath of the event "${eventTitle}" (${eventDesc}) which occurred around ${Math.abs(year)} ${year < 0 ? 'BC' : 'AD'}. Why did it happen and what were its consequences? Keep it engaging and around 200-300 words.`
      : `زمینه تاریخی دقیق و پیامدهای رویداد "${eventTitle}" (${eventDesc}) که در حدود سال ${Math.abs(year)} ${year < 0 ? 'ق.م' : 'م'} رخ داد را ارائه دهید. چرا اتفاق افتاد و پیامدهای آن چه بود؟ جذاب و حدود ۲۰۰ تا ۳۰۰ کلمه باشد.`;
    
    const content = await chatWithAssistant([], prompt, lang);
    setAiContent(content);
    setIsGenerating(false);
  };

  const handleGenerateArtifactContext = async (artifactName: string, artifactDesc: string, year: number) => {
    markAIUsed();
    setIsGenerating(true);
    setActiveTab('context');
    const prompt = lang === 'en'
      ? `Provide a detailed historical context about the heritage/artifact "${artifactName}" (${artifactDesc}) from around ${Math.abs(year)} ${year < 0 ? 'BC' : 'AD'}. Discuss its significance, creation, and its journey to its current location. Keep it engaging and around 200-300 words.`
      : `زمینه تاریخی دقیقی درباره میراث/اثر باستانی "${artifactName}" (${artifactDesc}) از حدود سال ${Math.abs(year)} ${year < 0 ? 'ق.م' : 'م'} ارائه دهید. در مورد اهمیت، ساخت، و سفر آن به مکان فعلی‌اش بحث کنید. جذاب و حدود ۲۰۰ تا ۳۰۰ کلمه باشد.`;
    
    const content = await chatWithAssistant([], prompt, lang);
    setAiContent(content);
    setIsGenerating(false);
  };

  let content = null;

  if (searchResult) {
    const getIcon = (type: string) => {
      switch (type) {
        case 'event': 
        case 'tradition': return <Sparkles className="w-5 h-5 text-amber-400" />;
        case 'figure': return <BookOpen className="w-5 h-5 text-purple-400" />;
        case 'ruler': return <Crown className="w-5 h-5 text-emerald-400" />;
        case 'dynasty': return <Shield className="w-5 h-5 text-rose-400" />;
        case 'region': return <MapPin className="w-5 h-5 text-sky-400" />;
        default: return <Sparkles className="w-5 h-5 text-slate-400" />;
      }
    };

    const typeColorMap: Record<string, string> = {
      event: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      tradition: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      figure: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      ruler: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      dynasty: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      region: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    };

    content = (
      <div className="flex flex-col gap-0" dir={lang === 'fa' ? 'rtl' : 'ltr'}>
        {/* ── Hero Band ── */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${typeColorMap[searchResult.type] || 'bg-slate-500/20 text-slate-300 border-slate-500/30'}`}>
                {getIcon(searchResult.type)}
                <span className="capitalize">{searchResult.type}</span>
              </span>
              <WikipediaLink query={lang === 'en' ? searchResult.nameEn : searchResult.nameFa} lang={lang} />
            </div>
            <h2 className={`text-2xl font-bold text-white leading-tight ${lang === 'fa' ? 'font-vazirmatn' : 'font-serif'}`}>{lang === 'en' ? searchResult.nameEn : searchResult.nameFa}</h2>
            <div className="flex items-center gap-2 text-sm text-slate-400">
                <Calendar className="w-4 h-4" />
                <span>{Math.abs(searchResult.year)}{searchResult.year < 0 ? (lang === 'en' ? ' BC' : ' ق.م') : (lang === 'en' ? ' AD' : ' م')}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white shrink-0 mt-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <div className="p-3 liquid-glass rounded-2xl border border-white/5 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{lang === 'en' ? 'Type' : 'نوع'}</span>
            <span className="text-sm font-semibold text-white capitalize">{searchResult.type}</span>
          </div>
          <div className="p-3 liquid-glass rounded-2xl border border-white/5 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{lang === 'en' ? 'Year' : 'سال'}</span>
            <span className="text-sm font-semibold text-white">{Math.abs(searchResult.year)} {searchResult.year < 0 ? (lang === 'en' ? 'BC' : 'ق.م') : (lang === 'en' ? 'AD' : 'م')}</span>
          </div>
        </div>

        {/* ── Description ── */}
        <div className="mb-5 p-4 liquid-glass rounded-2xl border border-white/5">
          <p className="text-sm text-slate-300 leading-relaxed">{lang === 'en' ? searchResult.descriptionEn : searchResult.descriptionFa}</p>
        </div>

        {/* ── AI Content Area ── */}
        {(activeTab === 'biography' || activeTab === 'lineage') && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 p-4 liquid-glass rounded-2xl border border-white/5 max-h-[40vh] overflow-y-auto custom-scrollbar">
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3">
                <div className="w-8 h-8 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                <p className="text-sm text-slate-400 animate-pulse">{lang === 'en' ? 'Generating...' : 'در حال پردازش...'}</p>
              </div>
            ) : typeof lineageData === 'string' ? (
              <div className="prose prose-sm prose-invert max-w-none ai-prose">
                <Markdown components={{ html: () => null }} remarkPlugins={[remarkGfm]}>{lineageData}</Markdown>
              </div>
            ) : activeTab === 'lineage' && lineageData ? (
              <LineageDisplay data={lineageData} lang={lang} />
            ) : (
              <div className="prose prose-invert prose-sm max-w-none ai-prose">
                <Markdown components={{ html: () => null }} remarkPlugins={[remarkGfm]}>{aiContent || ''}</Markdown>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Always-Visible Actions ── */}
        {(searchResult.type === 'ruler' || searchResult.type === 'figure') && (
          <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
            <button
              onClick={() => {
                if (activeTab !== 'biography') {
                  setActiveTab('biography');
                  setIsGenerating(true);
                  const prompt = lang === 'en'
                    ? `Write a detailed biography of the historical figure ${searchResult.nameEn}. Discuss their major works, contributions, and impact on history.`
                    : `یک بیوگرافی مفصل از شخصیت تاریخی ${searchResult.nameFa} بنویسید. در مورد آثار عمده، کمک‌ها و تأثیر آنها بر تاریخ بحث کنید.`;
                  chatWithAssistant([], prompt, lang).then(c => { setAiContent(c); setIsGenerating(false); });
                } else {
                  setActiveTab('details');
                }
              }}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold calm-transition border ${activeTab === 'biography' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'liquid-glass border-white/5 text-slate-300 hover:text-white hover:bg-white/10'}`}
            >
              <Sparkles className="w-4 h-4" />
              {lang === 'en' ? 'AI Biography' : 'بیوگرافی هوش مصنوعی'}
            </button>
            <button
              onClick={() => { if (activeTab !== 'lineage') { handleGenerateLineage(lang === 'en' ? searchResult.nameEn : searchResult.nameFa, searchResult.descriptionEn); } else { setActiveTab('details'); } }}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium calm-transition border ${activeTab === 'lineage' ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' : 'liquid-glass border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
            >
              <Users className="w-3.5 h-3.5" />
              {lang === 'en' ? 'View full lineage' : 'مشاهده تبارنامه'}
            </button>
          </div>
        )}
      </div>
    );
  } else if (artifact) {
    const getArtifactIcon = (type: string) => {
      switch (type) {
        case 'monument': return <Landmark className="w-5 h-5 text-amber-400" />;
        case 'architecture': return <Landmark className="w-5 h-5 text-sky-400" />;
        case 'manuscript': return <BookOpen className="w-5 h-5 text-purple-400" />;
        default: return <Sparkles className="w-5 h-5 text-emerald-400" />;
      }
    };

    content = (
      <div className="flex flex-col gap-0" dir={lang === 'fa' ? 'rtl' : 'ltr'}>

        {/* ── Hero Band ── */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-teal-500/20 text-teal-300 border-teal-500/30">
                {getArtifactIcon(artifact.type)}
                <span className="capitalize">{artifact.type}</span>
              </span>
              <WikipediaLink query={artifact.name[lang]} lang={lang} />
            </div>
            <h2 className={`text-2xl font-bold text-white leading-tight ${lang === 'fa' ? 'font-vazirmatn' : 'font-serif'}`}>{artifact.name[lang]}</h2>
            <p className="text-sm text-slate-400">
              {Math.abs(artifact.year)} {artifact.year < 0 ? (lang === 'en' ? 'BC' : 'ق.م') : (lang === 'en' ? 'AD' : 'م')}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white shrink-0 mt-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <div className="p-3 liquid-glass rounded-2xl border border-white/5 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{lang === 'en' ? 'Type' : 'نوع'}</span>
            <span className="text-sm font-semibold text-white capitalize">{artifact.type}</span>
          </div>
          <div className="p-3 liquid-glass rounded-2xl border border-white/5 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{lang === 'en' ? 'Date' : 'تاریخ'}</span>
            <span className="text-sm font-semibold text-white">{Math.abs(artifact.year)} {artifact.year < 0 ? (lang === 'en' ? 'BC' : 'ق.م') : (lang === 'en' ? 'AD' : 'م')}</span>
          </div>
        </div>

        {/* ── Description ── */}
        <div className="mb-5 p-4 liquid-glass rounded-2xl border border-white/5">
          <p className="text-sm text-slate-300 leading-relaxed">{artifact.description[lang]}</p>
        </div>

        {/* ── Location ── */}
        <div className="mb-5 flex items-center gap-2 px-4 py-3 liquid-glass rounded-2xl border border-white/5">
          <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="text-xs text-slate-400 font-medium">{lang === 'en' ? 'Current Location' : 'مکان فعلی'}:</span>
          <span className="text-sm text-white font-medium">{artifact.currentLocation[lang]}</span>
        </div>

        {/* ── AI Content Area ── */}
        {activeTab === 'context' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 p-4 liquid-glass rounded-2xl border border-white/5 max-h-[40vh] overflow-y-auto custom-scrollbar">
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3">
                <div className="w-8 h-8 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                <p className="text-sm text-slate-400 animate-pulse">{lang === 'en' ? 'Consulting the archives...' : 'در حال مشورت با آرشیوها...'}</p>
              </div>
            ) : (
              <div className="prose prose-invert prose-sm max-w-none ai-prose">
                <Markdown components={{ html: () => null }} remarkPlugins={[remarkGfm]}>{aiContent || ''}</Markdown>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Always-Visible Action ── */}
        <div className="pt-2 border-t border-white/5">
          <button
            onClick={() => { if (activeTab !== 'context') { handleGenerateArtifactContext(artifact.name[lang], artifact.description[lang], artifact.year); } else { setActiveTab('details'); } }}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold calm-transition border ${activeTab === 'context' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'liquid-glass border-white/5 text-slate-300 hover:text-white hover:bg-white/10'}`}
          >
            <Sparkles className="w-4 h-4" />
            {lang === 'en' ? 'AI Deep Dive' : 'بررسی عمیق هوش مصنوعی'}
          </button>
        </div>

      </div>
    );
  } else if (figure) {
    const getFigureIcon = (type: string) => {
      switch (type) {
        case 'philosopher': return <BookOpen className="w-5 h-5 text-amber-400" />;
        case 'poet': return <BookOpen className="w-5 h-5 text-purple-400" />;
        case 'scientist': return <Globe2 className="w-5 h-5 text-sky-400" />;
        case 'artist': return <Sparkles className="w-5 h-5 text-rose-400" />;
        default: return <Crown className="w-5 h-5 text-emerald-400" />;
      }
    };

    content = (
      <div className="flex flex-col gap-0" dir={lang === 'fa' ? 'rtl' : 'ltr'}>

        {/* ── Hero Band ── */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-purple-500/20 text-purple-300 border-purple-500/30">
                {getFigureIcon(figure.type)}
                <span className="capitalize">{figure.type}</span>
              </span>
              <WikipediaLink query={figure.name[lang]} lang={lang} />
            </div>
            <h2 className={`text-2xl font-bold text-white leading-tight ${lang === 'fa' ? 'font-vazirmatn' : 'font-serif'}`}>{figure.name[lang]}</h2>
            <p className="text-sm text-slate-400">
              {Math.abs(figure.birthYear)}{figure.birthYear < 0 ? (lang === 'en' ? ' BC' : ' ق.م') : ''}
              {' – '}
              {Math.abs(figure.deathYear)}{figure.deathYear < 0 ? (lang === 'en' ? ' BC' : ' ق.م') : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white shrink-0 mt-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="p-3 liquid-glass rounded-2xl border border-white/5 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{lang === 'en' ? 'Born' : 'تولد'}</span>
            <span className="text-sm font-semibold text-white">{Math.abs(figure.birthYear)}{figure.birthYear < 0 ? (lang === 'en' ? ' BC' : ' ق.م') : ''}</span>
          </div>
          <div className="p-3 liquid-glass rounded-2xl border border-white/5 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{lang === 'en' ? 'Died' : 'وفات'}</span>
            <span className="text-sm font-semibold text-white">{Math.abs(figure.deathYear)}{figure.deathYear < 0 ? (lang === 'en' ? ' BC' : ' ق.م') : ''}</span>
          </div>
          <div className="p-3 liquid-glass rounded-2xl border border-white/5 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{lang === 'en' ? 'Field' : 'حوزه'}</span>
            <span className="text-sm font-semibold text-white capitalize">{figure.type}</span>
          </div>
        </div>

        {/* ── Description ── */}
        <div className="mb-5 p-4 liquid-glass rounded-2xl border border-white/5">
          <p className="text-sm text-slate-300 leading-relaxed">{figure.description[lang]}</p>
        </div>

        {/* ── AI Content Area ── */}
        {(activeTab === 'biography' || activeTab === 'lineage') && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 p-4 liquid-glass rounded-2xl border border-white/5 max-h-[40vh] overflow-y-auto custom-scrollbar">
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3">
                <div className="w-8 h-8 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                <p className="text-sm text-slate-400 animate-pulse">{lang === 'en' ? 'Generating...' : 'در حال پردازش...'}</p>
                </div>
              ) : typeof lineageData === 'string' ? (
                <div className="prose prose-sm prose-invert max-w-none ai-prose">
                  <Markdown components={{ html: () => null }} remarkPlugins={[remarkGfm]}>{lineageData}</Markdown>
                </div>
              ) : activeTab === 'lineage' && lineageData ? (
                <LineageDisplay data={lineageData} lang={lang} />
              ) : (
              <div className="prose prose-invert prose-sm max-w-none ai-prose">
                <Markdown components={{ html: () => null }} remarkPlugins={[remarkGfm]}>{aiContent || ''}</Markdown>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Always-Visible Actions ── */}
        <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
          <button
            onClick={() => {
              if (activeTab !== 'biography') {
                setActiveTab('biography');
                setIsGenerating(true);
                const prompt = lang === 'en'
                  ? `Write a detailed biography of the historical figure ${figure.name.en} (${Math.abs(figure.birthYear)}${figure.birthYear < 0 ? 'BC' : ''} - ${Math.abs(figure.deathYear)}${figure.deathYear < 0 ? 'BC' : ''}). Discuss their major works, philosophical or scientific contributions, and their impact on history.`
                  : `یک بیوگرافی مفصل از شخصیت تاریخی ${figure.name.fa} (${Math.abs(figure.birthYear)}${figure.birthYear < 0 ? 'ق.م' : ''} - ${Math.abs(figure.deathYear)}${figure.deathYear < 0 ? 'ق.م' : ''}) بنویسید. در مورد آثار عمده، کمک‌های فلسفی یا علمی و تأثیر آنها بر تاریخ بحث کنید.`;
                chatWithAssistant([], prompt, lang).then(c => { setAiContent(c); setIsGenerating(false); });
              } else {
                setActiveTab('details');
              }
            }}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold calm-transition border ${activeTab === 'biography' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'liquid-glass border-white/5 text-slate-300 hover:text-white hover:bg-white/10'}`}
          >
            <Sparkles className="w-4 h-4" />
            {lang === 'en' ? 'AI Biography' : 'بیوگرافی هوش مصنوعی'}
          </button>
          <button
            onClick={() => { if (activeTab !== 'lineage') { handleGenerateLineage(figure.name[lang], figure.description.en); } else { setActiveTab('details'); } }}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium calm-transition border ${activeTab === 'lineage' ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' : 'liquid-glass border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
          >
            <Users className="w-3.5 h-3.5" />
            {lang === 'en' ? 'View full lineage' : 'مشاهده تبارنامه'}
          </button>
        </div>

      </div>
    );
  } else if (historicalEvent) {
    const getIcon = (type: string) => {
      switch (type) {
        case 'battle': return <Swords className="w-5 h-5 text-rose-400" />;
        case 'downfall': return <Skull className="w-5 h-5 text-purple-400" />;
        case 'political': return <Landmark className="w-5 h-5 text-sky-400" />;
        case 'cultural': return <Globe2 className="w-5 h-5 text-emerald-400" />;
        case 'tradition': return <Sparkles className="w-5 h-5 text-amber-400" />;
        default: return <Sparkles className="w-5 h-5 text-amber-400" />;
      }
    };

    const historicalEventColorMap: Record<string, string> = {
      battle: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      downfall: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      political: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
      cultural: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      tradition: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    };

    content = (
      <div className="flex flex-col gap-0" dir={lang === 'fa' ? 'rtl' : 'ltr'}>

        {/* ── Hero Band ── */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${historicalEventColorMap[historicalEvent.type] || 'bg-slate-500/20 text-slate-300 border-slate-500/30'}`}>
                {getIcon(historicalEvent.type)}
                <span className="capitalize">{historicalEvent.type}</span>
              </span>
              <WikipediaLink query={historicalEvent.title[lang]} lang={lang} />
            </div>
            <h2 className={`text-2xl font-bold text-white leading-tight ${lang === 'fa' ? 'font-vazirmatn' : 'font-serif'}`}>{historicalEvent.title[lang]}</h2>
            <p className="text-sm text-slate-400">
              {Math.abs(historicalEvent.year)} {historicalEvent.year < 0 ? (lang === 'en' ? 'BC' : 'ق.م') : (lang === 'en' ? 'AD' : 'م')}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white shrink-0 mt-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Description ── */}
        <div className="mb-5 p-4 liquid-glass rounded-2xl border border-white/5">
          <p className="text-sm text-slate-300 leading-relaxed">{historicalEvent.description[lang]}</p>
        </div>

        {/* ── AI Content Area ── */}
        {(activeTab === 'context' || activeTab === 'whatif') && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 p-4 liquid-glass rounded-2xl border border-white/5 max-h-[40vh] overflow-y-auto custom-scrollbar">
            {activeTab === 'whatif' && (
              <div className="flex gap-2 mb-3 pb-3 border-b border-white/10">
                <input
                  type="text"
                  value={customWhatIf}
                  onChange={(e) => setCustomWhatIf(e.target.value)}
                  placeholder={lang === 'en' ? 'Ask your own "What if..."' : 'سوال خود را بپرسید...'}
                  className="flex-1 px-3 py-2 liquid-glass border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 calm-transition"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customWhatIf.trim()) {
                      handleGenerateHistoricalEventWhatIfAction(historicalEvent.title[lang], historicalEvent.description[lang], historicalEvent.year, customWhatIf);
                    }
                  }}
                />
                <button
                  onClick={() => handleGenerateHistoricalEventWhatIfAction(historicalEvent.title[lang], historicalEvent.description[lang], historicalEvent.year, customWhatIf)}
                  disabled={!customWhatIf.trim() || isGenerating}
                  className="p-2 liquid-glass text-emerald-400 border border-white/10 rounded-xl hover:bg-white/10 disabled:opacity-50 calm-transition"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            )}
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3">
                <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-sm text-slate-400 animate-pulse">{lang === 'en' ? 'Consulting the archives...' : 'در حال مشورت با آرشیوها...'}</p>
              </div>
            ) : (
              <div className="prose prose-sm prose-invert max-w-none ai-prose">
                <Markdown components={{ html: () => null }} remarkPlugins={[remarkGfm]}>{aiContent || ''}</Markdown>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Always-Visible Actions ── */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
          <button
            onClick={() => { if (activeTab !== 'context') { handleGenerateEventContext(historicalEvent.title[lang], historicalEvent.description[lang], historicalEvent.year); } else { setActiveTab('details'); } }}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold calm-transition border ${activeTab === 'context' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'liquid-glass border-white/5 text-slate-300 hover:text-white hover:bg-white/10'}`}
          >
            <BookOpen className="w-4 h-4" />
            {lang === 'en' ? 'AI Deep Dive' : 'بررسی عمیق'}
          </button>
          <button
            onClick={() => { if (activeTab !== 'whatif') { handleGenerateHistoricalEventWhatIfAction(historicalEvent.title[lang], historicalEvent.description[lang], historicalEvent.year); } else { setActiveTab('details'); } }}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold calm-transition border ${activeTab === 'whatif' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'liquid-glass border-white/5 text-slate-300 hover:text-white hover:bg-white/10'}`}
          >
            <Sparkles className="w-4 h-4" />
            {lang === 'en' ? 'What If?' : 'چه می‌شد؟'}
          </button>
        </div>

      </div>
    );
  } else if (eventId) {
    const event = events.find((e) => e.id === eventId);
    if (!event) return null;
    const ruler = rulers[event.rulerId];
    const dynasty = dynasties[ruler.dynastyId];
    const region = regions.find((r) => r.id === event.regionId);

    const reignDuration = ruler.endDate - ruler.startDate;
    const formatYear = (y: number) => `${Math.abs(y)} ${y < 0 ? (lang === 'en' ? 'BC' : 'ق.م') : (lang === 'en' ? 'AD' : 'م')}`;

    const dynastyColors: Record<string, string> = {
      persian: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      turkic: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
      mongol: 'bg-red-500/20 text-red-300 border-red-500/30',
      arab: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      greek: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      afghan: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    };
    const dynastyColorClass = dynastyColors[dynasty.classification?.toLowerCase?.()] || 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';

    const isDirect = event.status?.toLowerCase().includes('direct');

    content = (
      <div className="flex flex-col gap-0" dir={lang === 'fa' ? 'rtl' : 'ltr'}>

        {/* ── Hero Band ── */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex flex-col gap-2">
            {/* Dynasty pill */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${dynastyColorClass}`}>
                <Shield className="w-3 h-3" />
                {dynasty.name[lang]}
              </span>
              <WikipediaLink query={ruler.name[lang]} lang={lang} />
            </div>
            {/* Ruler name */}
            <h2 className={`text-2xl font-bold text-white leading-tight ${lang === 'fa' ? 'font-vazirmatn' : 'font-serif'}`}>{ruler.name[lang]}</h2>
            {/* Title · Capital */}
            <p className="text-sm text-slate-400">{ruler.title[lang]} · {dynasty.capitalCity[lang]}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white shrink-0 mt-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Reign Bar ── */}
        <div className="mb-5">
          <div className="flex justify-between text-xs text-slate-500 mb-1.5 font-mono">
            <span>{formatYear(ruler.startDate)}</span>
            <span>{formatYear(ruler.endDate)}</span>
          </div>
          <div className="relative h-2 bg-white/5 rounded-full overflow-hidden border border-white/10">
            <div className="absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full" />
          </div>
          <p className="text-center text-xs text-slate-400 mt-1.5">
            {Math.abs(reignDuration)}{lang === 'en' ? '-year reign' : ' سال حکومت'}
          </p>
        </div>

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div className="p-3 liquid-glass rounded-2xl border border-white/5 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{lang === 'en' ? 'Title' : 'لقب'}</span>
            <span className="text-sm font-semibold text-white truncate">{ruler.title[lang]}</span>
          </div>
          <div className="p-3 liquid-glass rounded-2xl border border-white/5 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{lang === 'en' ? 'Capital' : 'پایتخت'}</span>
            <span className="text-sm font-semibold text-white truncate">{dynasty.capitalCity[lang]}</span>
          </div>
          <div className="p-3 liquid-glass rounded-2xl border border-white/5 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{lang === 'en' ? 'Control' : 'کنترل'}</span>
            <span className={`text-sm font-semibold ${isDirect ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isDirect ? (lang === 'en' ? 'Direct' : 'مستقیم') : (lang === 'en' ? 'Indirect' : 'غیرمستقیم')}
            </span>
          </div>
        </div>

        {/* ── Regional Status ── */}
        <div className="mb-5 p-4 liquid-glass rounded-2xl border border-white/5">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">{region?.displayName[lang]?.full.toUpperCase()}</p>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`w-2 h-2 rounded-full shrink-0 ${isDirect ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <p className="text-sm text-slate-300 leading-none font-semibold">{event.status}</p>
            {event.isAiGenerated && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {lang === 'en' ? 'AI Inferred' : 'تخمین هوش مصنوعی'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed border-l-2 border-white/10 pl-2 mt-2">
            {getControlExplanation(lang, event.status, event.isAiGenerated)}
          </p>
        </div>

        {/* ── AI Content Area ── */}
        {(activeTab === 'biography' || activeTab === 'whatif' || activeTab === 'lineage') && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 p-4 liquid-glass rounded-2xl border border-white/5 max-h-[40vh] overflow-y-auto custom-scrollbar">
            {activeTab === 'whatif' && (
              <div className="flex gap-2 mb-3 pb-3 border-b border-white/10">
                <input
                  type="text"
                  value={customWhatIf}
                  onChange={(e) => setCustomWhatIf(e.target.value)}
                  placeholder={lang === 'en' ? 'Ask your own "What if..."' : 'سوال خود را بپرسید...'}
                  className="flex-1 px-3 py-2 liquid-glass border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 calm-transition"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customWhatIf.trim()) {
                      handleGenerateWhatIf(event.status, ruler.name[lang], region?.displayName[lang]?.full || '', year, customWhatIf);
                    }
                  }}
                />
                <button
                  onClick={() => handleGenerateWhatIf(event.status, ruler.name[lang], region?.displayName[lang]?.full || '', year, customWhatIf)}
                  disabled={!customWhatIf.trim() || isGenerating}
                  className="p-2 liquid-glass text-emerald-400 border border-white/10 rounded-xl hover:bg-white/10 disabled:opacity-50 calm-transition"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            )}
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3">
                <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-sm text-slate-400 animate-pulse">{lang === 'en' ? 'Consulting the archives...' : 'در حال مشورت با آرشیوها...'}</p>
              </div>
            ) : activeTab === 'lineage' && lineageData ? (
              <LineageDisplay data={lineageData} lang={lang} />
            ) : (
              <div className="prose prose-sm prose-invert max-w-none ai-prose">
                <Markdown components={{ html: () => null }} remarkPlugins={[remarkGfm]}>{aiContent || ''}</Markdown>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Always-Visible Action Buttons ── */}
        <div className="flex flex-col gap-2 pt-2 border-t border-white/5">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                if (activeTab !== 'biography') {
                  handleGenerateBiography(ruler.name[lang], ruler.title[lang], dynasty.name[lang], ruler.startDate);
                } else {
                  setActiveTab('details');
                }
              }}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold calm-transition border ${activeTab === 'biography' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'liquid-glass border-white/5 text-slate-300 hover:text-white hover:bg-white/10'}`}
            >
              <Sparkles className="w-4 h-4" />
              {lang === 'en' ? 'AI Biography' : 'بیوگرافی'}
            </button>
            <button
              onClick={() => {
                if (activeTab !== 'whatif') {
                  handleGenerateWhatIf(event.status, ruler.name[lang], region?.displayName[lang]?.full || '', year);
                } else {
                  setActiveTab('details');
                }
              }}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold calm-transition border ${activeTab === 'whatif' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'liquid-glass border-white/5 text-slate-300 hover:text-white hover:bg-white/10'}`}
            >
              <Send className="w-4 h-4" />
              {lang === 'en' ? 'What If?' : 'چه می‌شد؟'}
            </button>
          </div>
          <button
            onClick={() => {
              if (activeTab !== 'lineage') {
                handleGenerateLineage(ruler.name[lang], `${ruler.title.en} of the ${dynasty.name.en} dynasty`);
              } else {
                setActiveTab('details');
              }
            }}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium calm-transition border ${activeTab === 'lineage' ? 'bg-rose-500/10 text-rose-300 border-rose-500/20' : 'liquid-glass border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
          >
            <Users className="w-3.5 h-3.5" />
            {lang === 'en' ? 'View full lineage' : 'مشاهده تبارنامه'}
          </button>
        </div>

      </div>
    );
  } else if (regionId) {
    const isGlobal = regionId === 'global';
    const region = isGlobal ? null : regions.find((r) => r.id === regionId);
    if (!isGlobal && !region) return null;

    const activeEvents = isGlobal 
      ? events.filter((e) => year >= e.startDate && year <= e.endDate)
      : events.filter((e) => e.regionId === regionId && year >= e.startDate && year <= e.endDate);

    content = (
      <div className="flex flex-col gap-0" dir={lang === 'fa' ? 'rtl' : 'ltr'}>

        {/* ── Hero Band ── */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-sky-500/20 text-sky-300 border-sky-500/30">
                <MapPin className="w-3 h-3" />
                {lang === 'en' ? 'Region' : 'منطقه'}
              </span>
              <WikipediaLink query={isGlobal ? 'Greater Iran' : (region?.displayName[lang]?.full || '')} lang={lang} />
            </div>
            <h2 className={`text-2xl font-bold text-white leading-tight ${lang === 'fa' ? 'font-vazirmatn' : 'font-serif'}`}>
              {isGlobal ? (lang === 'en' ? 'Greater Iran' : 'ایران بزرگ') : region?.displayName[lang]?.full}
            </h2>
            <p className="text-sm text-slate-400">
              {Math.abs(year)} {year < 0 ? (lang === 'en' ? 'BC' : 'ق.م') : (lang === 'en' ? 'AD' : 'م')}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white shrink-0 mt-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <div className="p-3 liquid-glass rounded-2xl border border-white/5 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{lang === 'en' ? 'Year' : 'سال'}</span>
            <span className="text-sm font-semibold text-white">{Math.abs(year)} {year < 0 ? (lang === 'en' ? 'BC' : 'ق.م') : (lang === 'en' ? 'AD' : 'م')}</span>
          </div>
          <div className="p-3 liquid-glass rounded-2xl border border-white/5 flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{lang === 'en' ? 'Active Rulers' : 'حاکمان فعال'}</span>
            <span className="text-sm font-semibold text-white">{activeEvents.length}</span>
          </div>
        </div>

        {/* ── Active Rulers List ── */}
        <div className="mb-5 max-h-[30vh] overflow-y-auto custom-scrollbar flex flex-col gap-2">
          {activeEvents.length > 0 ? (
            activeEvents.map((event) => {
              const r = rulers[event.rulerId];
              const d = dynasties[r.dynastyId];
              const eventRegion = regions.find(reg => reg.id === event.regionId);
              return (
                <div key={event.id} className="p-3 liquid-glass rounded-2xl border border-white/5 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-y-2">
                    <div>
                      <div className="font-semibold text-sm text-white">{r.name[lang]}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {d.name[lang]}{isGlobal && eventRegion ? ` · ${eventRegion.displayName[lang].full}` : ''}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full border flex-shrink-0 ${event.isAiGenerated ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'}`}>
                      {event.status} {event.isAiGenerated && (lang === 'en' ? '(AI)' : '(تخمین)')}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 border-t border-white/5 pt-2 mt-1 leading-relaxed">
                     {getControlExplanation(lang, event.status, event.isAiGenerated)}
                  </p>
                </div>
              );
            })
          ) : (
            <div className="p-4 liquid-glass rounded-2xl border border-white/5 text-sm text-slate-400 text-center italic">
              {lang === 'en' ? 'No recorded rulers for this region in this year.' : 'هیچ حاکمی برای این منطقه در این سال ثبت نشده است.'}
            </div>
          )}
        </div>

        {/* ── AI Content Area ── */}
        {activeTab === 'context' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-5 p-4 liquid-glass rounded-2xl border border-white/5 max-h-[40vh] overflow-y-auto custom-scrollbar">
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3">
                <div className="w-8 h-8 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                <p className="text-sm text-slate-400 animate-pulse">{lang === 'en' ? 'Consulting the archives...' : 'در حال مشورت با آرشیوها...'}</p>
              </div>
            ) : (
              <div className="prose prose-sm prose-invert max-w-none">
                <Markdown components={{ html: () => null }} remarkPlugins={[remarkGfm]}>{aiContent || ''}</Markdown>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Always-Visible Action ── */}
        <div className="pt-2 border-t border-white/5">
          <button
            onClick={() => { if (activeTab !== 'context') { handleGenerateRegionContext(isGlobal ? (lang === 'en' ? 'Greater Iran' : 'ایران بزرگ') : region?.displayName[lang]?.full || '', year); } else { setActiveTab('details'); } }}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold calm-transition border ${activeTab === 'context' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'liquid-glass border-white/5 text-slate-300 hover:text-white hover:bg-white/10'}`}
          >
            <Globe className="w-4 h-4" />
            {lang === 'en' ? 'AI Historical Context' : 'زمینه تاریخی هوش مصنوعی'}
          </button>
        </div>

      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="liquid-glass-heavy rounded-3xl shadow-2xl w-full max-w-md p-6 border border-white/10 max-h-[90vh] overflow-hidden flex flex-col calm-transition"
        >
          {content}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
