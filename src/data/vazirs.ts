// src/data/vazirs.ts

export interface Vazir {
  id: string;
  name: { en: string; fa: string };
  title: { en: string; fa: string };
  activeYearStart: number;               // year they became active (negative = BC)
  activeYearEnd: number;                 // year they ceased (death or fall from power)
  regionId: string;                      // MUST match an existing region ID in the map data
  rulerName: { en: string; fa: string }; // the ruler they served
  dynastyId: string;                     // MUST match a key in dynasties.ts
  contribution: { en: string; fa: string }; // one sentence
  preserved: { en: string; fa: string };    // what they saved or built
  paradox: { en: string; fa: string };      // the "man vs. empire" tension line
}

// CLUSTERING THRESHOLD — do not change this value without updating Map.tsx logic
export const VAZIR_CLUSTER_PX = 18;

export const vazirs: Vazir[] = [
  // ── Priority 6 entries (from the design spec) ───────────────────────────
  {
    id: 'burzoe',
    name: { en: 'Burzoe', fa: 'بُرزویه' },
    title: { en: 'Chief Physician & Vazir', fa: 'وزیر و پزشک دربار' },
    activeYearStart: 531,
    activeYearEnd: 579,
    regionId: 'jibal',                   
    rulerName: { en: 'Khosrow I', fa: 'خسرو اول' },
    dynastyId: 'sasanian',
    contribution: { en: 'Translated the Panchatantra from Sanskrit to Pahlavi', fa: 'ترجمه کلیله و دمنه از سانسکریت به پهلوی' },
    preserved: { en: 'Indian wisdom encoded in Persian storytelling tradition', fa: 'دانش هندی در قالب داستان‌های فارسی' },
    paradox: { en: 'While the empire weakened, he quietly preserved foreign wisdom as Iranian culture', fa: 'در حالی که امپراتوری ضعیف می‌شد، دانش بیگانه را در فرهنگ ایرانی حفظ کرد' },
  },
  {
    id: 'yahya_barmaki',
    name: { en: 'Yahya ibn Khalid al-Barmaki', fa: 'یحیی بن خالد برمکی' },
    title: { en: 'Grand Vazir of the Abbasid Caliphate', fa: 'وزیر بزرگ خلافت عباسی' },
    activeYearStart: 786,
    activeYearEnd: 803,
    regionId: 'khorasan',               
    rulerName: { en: 'Harun al-Rashid', fa: 'هارون الرشید' },
    dynastyId: 'abbasid',
    contribution: { en: 'Ran the Abbasid Caliphate as de facto ruler for 17 years', fa: 'خلافت عباسی را به مدت ۱۷ سال اداره کرد' },
    preserved: { en: 'Iranian administrative traditions within the Arab Caliphate', fa: 'سنت‌های اداری ایرانی در دستگاه خلافت عرب' },
    paradox: { en: 'A Buddhist family from Balkh who administered an Islamic empire in Persian', fa: 'خانواده‌ای بودایی از بلخ که امپراتوری اسلامی را به فارسی اداره کرد' },
  },
  {
    id: 'nizam_al_mulk',
    name: { en: 'Nizam al-Mulk', fa: 'نظام‌الملک' },
    title: { en: 'Grand Vazir of the Seljuk Empire', fa: 'وزیر بزرگ امپراتوری سلجوقی' },
    activeYearStart: 1064,
    activeYearEnd: 1092,
    regionId: 'jibal',                  
    rulerName: { en: 'Alp Arslan & Malik-Shah I', fa: 'الپ ارسلان و ملکشاه اول' },
    dynastyId: 'seljuk',
    contribution: { en: 'Built the Nizamiyya university network across the Islamic world', fa: 'شبکه دانشگاه‌های نظامیه را در سراسر جهان اسلام بنا کرد' },
    preserved: { en: 'Iranian bureaucratic system within the Turkic Seljuk conquest state', fa: 'سیستم اداری ایرانی در دولت فاتحان ترک سلجوقی' },
    paradox: { en: 'Ran a Turkic empire in Persian, using Iranian governance to outlast the conquerors', fa: 'یک امپراتوری ترک را به زبان فارسی اداره کرد' },
  },
  {
    id: 'nasir_al_din_tusi',
    name: { en: 'Khwaja Nasir al-Din Tusi', fa: 'خواجه نصیرالدین طوسی' },
    title: { en: 'Scholar-Advisor to Hulagu Khan', fa: 'مشاور علمی هولاکو خان' },
    activeYearStart: 1256,
    activeYearEnd: 1274,
    regionId: 'jibal',                  
    rulerName: { en: 'Hulagu Khan', fa: 'هولاکو خان' },
    dynastyId: 'ilkhanate',
    contribution: { en: 'Convinced the Mongols to spare the libraries of Baghdad', fa: 'مغول‌ها را متقاعد کرد که کتابخانه‌های بغداد را نسوزانند' },
    preserved: { en: 'Islamic-Iranian scientific tradition through the Mongol catastrophe', fa: 'سنت علمی ایرانی-اسلامی را از دل فاجعه مغول عبور داد' },
    paradox: { en: 'Served the destroyers of Islamic civilization to save it from within', fa: 'به ویرانگران تمدن اسلامی خدمت کرد تا آن را از درون نجات دهد' },
  },
  {
    id: 'ali_ibn_isa',
    name: { en: 'Ali ibn Isa al-Jarrah', fa: 'علی بن عیسی الجراح' },
    title: { en: 'Vazir of the Abbasid Caliphate', fa: 'وزیر خلافت عباسی' },
    activeYearStart: 908,
    activeYearEnd: 936,
    regionId: 'mesopotamia',             
    rulerName: { en: 'Multiple Abbasid Caliphs', fa: 'خلفای مختلف عباسی' },
    dynastyId: 'abbasid',
    contribution: { en: 'Reformed the tax system to protect the poor during economic collapse', fa: 'سیستم مالیاتی را اصلاح کرد تا در بحران اقتصادی از فقرا محافظت کند' },
    preserved: { en: 'Fiscal stability of the caliphate during its political fragmentation', fa: 'ثبات مالی خلافت در دوران تجزیه سیاسی آن' },
    paradox: { en: 'Three times fired, three times recalled — too competent to leave, too honest to keep', fa: 'سه بار اخراج شد، سه بار بازگشت — بیش از حد کاردان بود که رهایش کنند' },
  },
  {
    id: 'rashid_al_din',
    name: { en: 'Rashid al-Din Hamadani', fa: 'رشیدالدین فضل‌الله همدانی' },
    title: { en: 'Vazir of the Ilkhanate', fa: 'وزیر ایلخانان' },
    activeYearStart: 1298,
    activeYearEnd: 1318,
    regionId: 'caucasus',        
    rulerName: { en: 'Ghazan Khan & Öljaitü', fa: 'غازان خان و اولجایتو' },
    dynastyId: 'ilkhanate',
    contribution: { en: 'Authored the Jami al-Tawarikh — the first world history', fa: 'جامع التواریخ را نوشت — نخستین تاریخ جهانی' },
    preserved: { en: 'Global knowledge synthesis at the crossroads of the Mongol empire', fa: 'ترکیب دانش جهانی در تقاطع امپراتوری مغول' },
    paradox: { en: 'A Jewish convert who wrote the definitive history of Islam for a Mongol ruler', fa: 'یهودی مسلمان‌شده‌ای که تاریخ اسلام را برای یک حاکم مغول نوشت' },
  },
];
