import React, { useState } from 'react';
import { X, Heart, Copy, CheckCircle, ExternalLink, Coffee, Share2, Send, Wallet } from 'lucide-react';

interface SupportModalProps {
  onClose: () => void;
  lang: 'en' | 'fa';
}

export const SupportModal: React.FC<SupportModalProps> = ({ onClose, lang }) => {
  const [activeTab, setActiveTab] = useState<'support' | 'about'>('support');
  const [copied, setCopied] = useState(false);
  const usdcAddress = "TH62fRLdkhexDM4FRHMFG8oLS5B1dyXaKZ";
  const trustWalletUrl = "https://link.trustwallet.com/send?coin=195&address=TH62fRLdkhexDM4FRHMFG8oLS5B1dyXaKZ&token_id=TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8";

  const t = {
    supportTab: lang === 'en' ? 'Support' : 'حمایت',
    aboutTab: lang === 'en' ? 'About' : 'درباره',
    title: lang === 'en' ? 'Support Xtory' : 'حمایت از Xtory',
    desc: lang === 'en' ? 'Xtory is an open-source, ad-free project. If you find it valuable, consider supporting the development and server costs.' : 'Xtory یک پروژه متن‌باز و بدون تبلیغات است. اگر آن را مفید می‌دانید، از توسعه و هزینه‌های سرور حمایت کنید.',
    usdcTitle: lang === 'en' ? 'Crypto (USDC TRC20)' : 'کریپتو (USDC TRC20)',
    trustWallet: lang === 'en' ? 'Pay via Trust Wallet' : 'پرداخت با تراست ولت',
    bmcTitle: lang === 'en' ? 'Help keep this free for Iran' : 'به رایگان ماندن این پروژه کمک کنید',
    copied: lang === 'en' ? 'Copied!' : 'کپی شد!',
    copyButton: lang === 'en' ? 'Copy Address' : 'کپی آدرس',
    contribTitle: lang === 'en' ? 'Contribution' : 'مشارکت معنوی',
    contribDesc: lang === 'en' 
      ? "Can't donate? Share this with one person who loves Iranian history — that helps us more than you know." 
      : "حمایت مالی جای خودش، حمایت معنوی هم مهمه. ایکستوری رو با کسی که به تاریخ ایران علاقه داره به اشتراک بگذار، این کار بیشتر از اونی که فکر میکنی به ما کمک میکنه.",
    shareText: lang === 'en' ? 'Explore the interactive History of Greater Iran with Xtory' : 'تاریخ ایران بزرگ را به صورت تعاملی در ایکس‌توری کاوش کنید',
    aboutTitle: lang === 'en' ? 'About this project' : 'درباره این پروژه',
    about1: lang === 'en' 
      ? "Greater Iran — or Irānzamin — refers to the broad cultural and historical sphere centered on the Iranian plateau, stretching across what is today Iran, Afghanistan, Tajikistan, Uzbekistan, parts of Iraq, Turkey, the Caucasus, and Central Asia. It is not a political claim. It is a civilizational reality: a region that has continuously produced language, art, philosophy, and governance for over four thousand years."
      : "ایرانزمین — یا ایران بزرگ — به حوزه فرهنگی و تاریخی گستردهای اشاره دارد که مرکز آن فلات ایران است و سرزمینهای امروزی ایران، افغانستان، تاجیکستان، ازبکستان، بخشهایی از عراق، ترکیه، قفقاز و آسیای مرکزی را در بر میگیرد. این یک ادعای سیاسی نیست. این یک واقعیت تمدنی است: منطقهای که بیش از چهار هزار سال بهپیوستگی زبان، هنر، فلسفه و حکمرانی تولید کرده است.",
    about2: lang === 'en'
      ? "This region has never been still. Empires rose here, collided here, and dissolved here. The Achaemenids unified it. Alexander broke it. The Parthians reclaimed it. The Sasanians refined it. The Arab conquest transformed it. The Mongols shattered it. The Safavids rebuilt it. Each wave left its mark — in architecture, in language, in the borders that exist today."
      : "این سرزمین هرگز آرام نبوده. امپراتوریها در اینجا برخاستند، با هم برخورد کردند و فروپاشیدند. هخامنشیان آن را یکپارچه کردند. اسکندر آن را شکست. اشکانیان آن را بازپس گرفتند. ساسانیان آن را پرورش دادند. فتح اعراب آن را دگرگون کرد. مغولان آن را ویران کردند. صفویان آن را بازساختند. هر موج ردپایی بر جای گذاشت — در معماری، در زبان، در مرزهایی که امروز وجود دارند.",
    about3: lang === 'en'
      ? "Xtory was built to make this complexity visible. Not as a textbook, and not as a political argument — but as an honest, interactive map of time. A place where anyone, regardless of background, can explore who ruled, who fought, who built, and what endured."
      : "ایکستُری ساخته شد تا این پیچیدگی را قابل مشاهده کند. نه بهعنوان یک کتاب درسی، و نه بهعنوان یک استدلال سیاسی — بلکه بهعنوان نقشهای صادقانه و تعاملی از زمان. مکانی که هر کسی، صرفنظر از پیشینهاش، بتواند بررسی کند که چه کسی حکومت کرد، چه کسی جنگید، چه کسی ساخت، و چه چیزی پایدار ماند.",
    about4: lang === 'en'
      ? "History this layered deserves more than a Wikipedia article. It deserves to be seen."
      : "تاریخی به این عمق، بیش از یک مقاله ویکیپدیا را میطلبد. شایسته است که دیده شود.",
    credits: lang === 'en' ? 'Developed by Wayward Son' : 'ساخته شده توسط Wayward Son',
    creditsSmall: lang === 'en' ? 'A small team that believes the past is worth exploring.' : 'تیمی کوچک که معتقد است گذشته ارزش کشف کردن دارد.',
  };

  const [linkCopied, setLinkCopied] = useState(false);
  const shareUrl = "https://xtroy.sbs";

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(usdcAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div 
        className="w-full max-w-md liquid-glass-heavy rounded-3xl p-6 shadow-2xl relative border border-white/10"
        dir={lang === 'fa' ? 'rtl' : 'ltr'}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 rtl:right-auto rtl:left-4 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex justify-center mb-6">
          <img 
            src="/logo.jpeg" 
            alt="Xtory Logo" 
            className="h-12 w-auto rounded-2xl shadow-2xl border border-white/20 object-cover" 
          />
        </div>

        {/* Tabs */}
        <div className="flex bg-black/20 p-1 rounded-2xl mb-6 border border-white/5 w-fit">
          <button
            onClick={() => setActiveTab('support')}
            className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === 'support' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {t.supportTab}
          </button>
          <button
            onClick={() => setActiveTab('about')}
            className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all ${activeTab === 'about' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {t.aboutTab}
          </button>
        </div>

        {activeTab === 'support' ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-rose-500/20 text-rose-400 rounded-2xl">
                <Heart className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white">{t.title}</h2>
            </div>

            <p className="text-sm text-slate-300 mb-6 leading-relaxed">
              {t.desc}
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-black/20 rounded-2xl border border-white/5">
                <h3 className="text-sm font-medium text-slate-200 mb-3">{t.usdcTitle}</h3>
                <div className="flex items-center gap-2 mb-3">
                  <code className="flex-1 px-3 py-2 bg-black/40 rounded-xl text-xs font-mono text-slate-300 overflow-hidden text-ellipsis">
                    {usdcAddress}
                  </code>
                  <button 
                    onClick={handleCopy}
                    className="shrink-0 p-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-xl transition-colors flex items-center justify-center"
                    title={t.copyButton}
                  >
                    {copied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <a 
                  href={trustWalletUrl}
                  target="_blank" rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-xl text-xs font-semibold transition-colors"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  {t.trustWallet}
                </a>
              </div>

              <a 
                href="https://www.buymeacoffee.com/drang" 
                target="_blank" 
                rel="noopener noreferrer"
                className="w-full flex items-center justify-between p-4 bg-[#FFDD00] hover:bg-[#FFDD00]/90 border border-black/5 text-black rounded-2xl transition-all transform hover:scale-[1.02] group shadow-xl"
              >
                <div className="flex items-center gap-3">
                  <img 
                    src="https://cdn.buymeacoffee.com/buttons/bmc-new-btn-logo.svg" 
                    alt="BMC Logo" 
                    className="w-5 h-5"
                  />
                  <span className="font-bold text-sm tracking-tight">{t.bmcTitle}</span>
                </div>
                <ExternalLink className="w-4 h-4 opacity-50 transition-opacity" />
              </a>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2">
                <Share2 className="w-3 h-3" />
                {t.contribTitle}
              </h3>
              <p className="text-sm text-slate-400 mb-4 leading-relaxed font-medium">
                {t.contribDesc}
              </p>
              <div className="flex items-center gap-2">
                <a 
                  href={`https://x.com/intent/post?text=${encodeURIComponent(t.shareText)}&url=${encodeURIComponent(shareUrl)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-slate-300 hover:text-white"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
                  </svg>
                </a>
                <a 
                  href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(t.shareText)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-slate-300 hover:text-white"
                >
                  <Send className="w-4 h-4" />
                </a>
                <button 
                  onClick={handleCopyLink}
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-slate-300 hover:text-white"
                >
                  {linkCopied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2 rtl:pr-0 rtl:pl-2">
            <h2 className="text-xl font-bold text-white mb-4">{t.aboutTitle}</h2>
            <div className="space-y-4 text-sm text-slate-300 leading-relaxed text-pretty">
              <p>{t.about1}</p>
              <p>{t.about2}</p>
              <p>{t.about3}</p>
              <p className="font-medium text-white">{t.about4}</p>
            </div>
            
            <div className="mt-8 pt-6 border-t border-white/5 pb-2">
              <p className="text-[12px] text-slate-500 font-bold mb-1">
                {t.credits}
              </p>
              <p className="text-[11px] text-slate-600 italic mb-5">
                {t.creditsSmall}
              </p>

              {/* ── Built with Love for Iran ─────────────────── */}
              <div className="flex items-center justify-center gap-1.5 pt-4 border-t border-white/5">
                <span
                  className="text-[10px] font-light tracking-[0.18em] uppercase"
                  style={{ color: 'rgba(180,170,150,0.5)' }}
                >
                  {lang === 'fa' ? 'ساخته شده با' : 'Built with'}
                </span>

                <svg
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  style={{
                    animation: 'heartPulse 2s ease-in-out infinite',
                    filter: 'drop-shadow(0 0 4px rgba(244,63,94,0.35))',
                  }}
                >
                  <defs>
                    <linearGradient id="support-heart-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#fb7185" />
                      <stop offset="100%" stopColor="#e11d48" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                    fill="url(#support-heart-grad)"
                  />
                </svg>

                <span
                  className="text-[10px] font-light tracking-[0.18em] uppercase"
                  style={{
                    background: 'linear-gradient(90deg, rgba(180,170,150,0.5) 0%, rgba(180,170,150,0.5) 40%, rgba(212,184,122,1) 50%, rgba(180,170,150,0.5) 60%, rgba(180,170,150,0.5) 100%)',
                    backgroundSize: '200% 100%',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    animation: 'loveShimmer 3s ease-in-out infinite',
                  }}
                >
                  {lang === 'fa' ? 'برای ایران' : 'for Iran'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
