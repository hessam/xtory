import * as fs from 'fs';

let content = fs.readFileSync('src/data/rulers.ts', 'utf8');

// The original file had 372 lines. The new file has 1017 lines.
// Let's just restore the original file from memory or fix it manually.
// Wait, I can just write a script to fix it.

const newRulers = {
  bahram_chobin: { id: 'bahram_chobin', name: { en: 'Bahram Chobin', fa: 'بهرام چوبین' }, title: { en: 'Shahanshah', fa: 'شاهنشاه' }, dynastyId: 'sasanian', rulerType: 'Rival/Usurper', startDate: 590, endDate: 591 },
  shervin_i: { id: 'shervin_i', name: { en: 'Shervin I', fa: 'شروین یکم' }, title: { en: 'Ispahbad', fa: 'اسپهبد' }, dynastyId: 'bavandid', rulerType: 'Vassal/Sub-king', startDate: 772, endDate: 817 },
  nicholas_ii: { id: 'nicholas_ii', name: { en: 'Nicholas II', fa: 'نیکلای دوم' }, title: { en: 'Emperor', fa: 'امپراتور' }, dynastyId: 'russian_empire', rulerType: 'Foreign Occupier', startDate: 1894, endDate: 1917 },
  george_v: { id: 'george_v', name: { en: 'George V', fa: 'جرج پنجم' }, title: { en: 'King', fa: 'پادشاه' }, dynastyId: 'british_empire', rulerType: 'Foreign Occupier', startDate: 1910, endDate: 1936 },
  mardavij_ziyarid: { id: 'mardavij_ziyarid', name: { en: 'Mardavij', fa: 'مرداویج زیاری' }, title: { en: 'Emir', fa: 'امیر' }, dynastyId: 'ziyarid', rulerType: 'Central Monarch', startDate: 930, endDate: 935 },
  hasan_buzurg: { id: 'hasan_buzurg', name: { en: 'Hasan Buzurg', fa: 'حسن بزرگ' }, title: { en: 'Sultan', fa: 'سلطان' }, dynastyId: 'jalayirid', rulerType: 'Central Monarch', startDate: 1336, endDate: 1356 },
  mubariz_al_din: { id: 'mubariz_al_din', name: { en: 'Mubariz al-Din Muhammad', fa: 'امیر مبارزالدین محمد' }, title: { en: 'Emir', fa: 'امیر' }, dynastyId: 'muzaffarid', rulerType: 'Central Monarch', startDate: 1314, endDate: 1358 },
  shutruk_nahhunte: { id: 'shutruk_nahhunte', name: { en: 'Shutruk-Nahhunte', fa: 'شوتروک-ناخونته' }, title: { en: 'King', fa: 'پادشاه' }, dynastyId: 'elamite', rulerType: 'Central Monarch', startDate: -1184, endDate: -1155 },
  humban_haltash_iii: { id: 'humban_haltash_iii', name: { en: 'Humban-Haltash III', fa: 'هومبان-هالتاش سوم' }, title: { en: 'King', fa: 'پادشاه' }, dynastyId: 'elamite', rulerType: 'Central Monarch', startDate: -650, endDate: -640 },
  antiochus_iii: { id: 'antiochus_iii', name: { en: 'Antiochus III', fa: 'آنتیوخوس سوم' }, title: { en: 'Basileus', fa: 'باسیلئوس' }, dynastyId: 'seleucid', rulerType: 'Central Monarch', startDate: -222, endDate: -187 },
  antiochus_vii: { id: 'antiochus_vii', name: { en: 'Antiochus VII', fa: 'آنتیوخوس هفتم' }, title: { en: 'Basileus', fa: 'باسیلئوس' }, dynastyId: 'seleucid', rulerType: 'Central Monarch', startDate: -138, endDate: -129 },
  diodotus_i: { id: 'diodotus_i', name: { en: 'Diodotus I', fa: 'دیودوت یکم' }, title: { en: 'Basileus', fa: 'باسیلئوس' }, dynastyId: 'greco_bactrian', rulerType: 'Central Monarch', startDate: -250, endDate: -230 },
  heliocles_i: { id: 'heliocles_i', name: { en: 'Heliocles I', fa: 'هلیوکل یکم' }, title: { en: 'Basileus', fa: 'باسیلئوس' }, dynastyId: 'greco_bactrian', rulerType: 'Central Monarch', startDate: -145, endDate: -130 },
  ardashir_i: { id: 'ardashir_i', name: { en: 'Ardashir I', fa: 'اردشیر بابکان' }, title: { en: 'Shahanshah', fa: 'شاهنشاه' }, dynastyId: 'sasanian', rulerType: 'Central Monarch', startDate: 224, endDate: 242 },
  al_mansur: { id: 'al_mansur', name: { en: 'Al-Mansur', fa: 'المنصور' }, title: { en: 'Caliph', fa: 'خلیفه' }, dynastyId: 'abbasid', rulerType: 'Central Monarch', startDate: 754, endDate: 775 },
  al_mustasim: { id: 'al_mustasim', name: { en: 'Al-Musta\'sim', fa: 'المستعصم' }, title: { en: 'Caliph', fa: 'خلیفه' }, dynastyId: 'abbasid', rulerType: 'Central Monarch', startDate: 1242, endDate: 1258 },
  muhammad_ibn_tahir: { id: 'muhammad_ibn_tahir', name: { en: 'Muhammad ibn Tahir', fa: 'محمد بن طاهر' }, title: { en: 'Emir', fa: 'امیر' }, dynastyId: 'tahirid', rulerType: 'Vassal/Sub-king', startDate: 862, endDate: 873 },
  amr_ibn_al_layth: { id: 'amr_ibn_al_layth', name: { en: 'Amr ibn al-Layth', fa: 'عمرو لیث صفاری' }, title: { en: 'Emir', fa: 'امیر' }, dynastyId: 'saffarid', rulerType: 'Central Monarch', startDate: 879, endDate: 901 },
  khalaf_ibn_ahmad: { id: 'khalaf_ibn_ahmad', name: { en: 'Khalaf ibn Ahmad', fa: 'خلف بن احمد' }, title: { en: 'Emir', fa: 'امیر' }, dynastyId: 'saffarid', rulerType: 'Central Monarch', startDate: 963, endDate: 1002 },
  qabus_ibn_voshmgir: { id: 'qabus_ibn_voshmgir', name: { en: 'Qabus ibn Voshmgir', fa: 'قابوس بن وشمگیر' }, title: { en: 'Emir', fa: 'امیر' }, dynastyId: 'ziyarid', rulerType: 'Central Monarch', startDate: 977, endDate: 1012 },
  gilanshah: { id: 'gilanshah', name: { en: 'Gilanshah', fa: 'گیلانشاه' }, title: { en: 'Emir', fa: 'امیر' }, dynastyId: 'ziyarid', rulerType: 'Central Monarch', startDate: 1087, endDate: 1090 },
  abu_kalijar: { id: 'abu_kalijar', name: { en: 'Abu Kalijar', fa: 'ابوکالیجار' }, title: { en: 'Emir', fa: 'امیر' }, dynastyId: 'buyid', rulerType: 'Central Monarch', startDate: 1024, endDate: 1048 },
  tughril_beg: { id: 'tughril_beg', name: { en: 'Tughril Beg', fa: 'طغرل بیک' }, title: { en: 'Sultan', fa: 'سلطان' }, dynastyId: 'seljuk', rulerType: 'Central Monarch', startDate: 1037, endDate: 1063 },
  ahmad_sanjar: { id: 'ahmad_sanjar', name: { en: 'Ahmad Sanjar', fa: 'احمد سنجر' }, title: { en: 'Sultan', fa: 'سلطان' }, dynastyId: 'seljuk', rulerType: 'Central Monarch', startDate: 1118, endDate: 1153 },
  tughril_iii: { id: 'tughril_iii', name: { en: 'Tughril III', fa: 'طغرل سوم' }, title: { en: 'Sultan', fa: 'سلطان' }, dynastyId: 'seljuk', rulerType: 'Central Monarch', startDate: 1176, endDate: 1194 },
  ala_al_din_tekish: { id: 'ala_al_din_tekish', name: { en: 'Ala al-Din Tekish', fa: 'علاءالدین تکش' }, title: { en: 'Shah', fa: 'شاه' }, dynastyId: 'khwarazmian', rulerType: 'Central Monarch', startDate: 1172, endDate: 1200 },
  hulagu_khan: { id: 'hulagu_khan', name: { en: 'Hulagu Khan', fa: 'هولاکو خان' }, title: { en: 'Ilkhan', fa: 'ایلخان' }, dynastyId: 'ilkhanate', rulerType: 'Central Monarch', startDate: 1256, endDate: 1265 },
  abu_said_bahadur: { id: 'abu_said_bahadur', name: { en: 'Abu Sa\'id Bahadur Khan', fa: 'ابوسعید بهادرخان' }, title: { en: 'Ilkhan', fa: 'ایلخان' }, dynastyId: 'ilkhanate', rulerType: 'Central Monarch', startDate: 1316, endDate: 1335 },
  shaykh_uways: { id: 'shaykh_uways', name: { en: 'Shaykh Uways', fa: 'شیخ اویس' }, title: { en: 'Sultan', fa: 'سلطان' }, dynastyId: 'jalayirid', rulerType: 'Central Monarch', startDate: 1356, endDate: 1374 },
  husayn_jalayir: { id: 'husayn_jalayir', name: { en: 'Husayn Jalayir', fa: 'حسین جلایر' }, title: { en: 'Sultan', fa: 'سلطان' }, dynastyId: 'jalayirid', rulerType: 'Central Monarch', startDate: 1374, endDate: 1382 },
  shah_shuja: { id: 'shah_shuja', name: { en: 'Shah Shuja', fa: 'شاه شجاع' }, title: { en: 'Emir', fa: 'امیر' }, dynastyId: 'muzaffarid', rulerType: 'Central Monarch', startDate: 1358, endDate: 1384 },
  shah_mansur: { id: 'shah_mansur', name: { en: 'Shah Mansur', fa: 'شاه منصور' }, title: { en: 'Emir', fa: 'امیر' }, dynastyId: 'muzaffarid', rulerType: 'Central Monarch', startDate: 1387, endDate: 1393 },
  timur: { id: 'timur', name: { en: 'Timur', fa: 'تیمور لنگ' }, title: { en: 'Emir', fa: 'امیر' }, dynastyId: 'timurid', rulerType: 'Central Monarch', startDate: 1370, endDate: 1405 },
  shahrukh: { id: 'shahrukh', name: { en: 'Shahrukh', fa: 'شاهرخ' }, title: { en: 'Emir', fa: 'امیر' }, dynastyId: 'timurid', rulerType: 'Central Monarch', startDate: 1405, endDate: 1447 },
  husayn_bayqara: { id: 'husayn_bayqara', name: { en: 'Husayn Bayqara', fa: 'سلطان حسین بایقرا' }, title: { en: 'Emir', fa: 'امیر' }, dynastyId: 'timurid', rulerType: 'Central Monarch', startDate: 1469, endDate: 1506 },
  murad_aq_qoyunlu: { id: 'murad_aq_qoyunlu', name: { en: 'Sultan Murad', fa: 'سلطان مراد' }, title: { en: 'Sultan', fa: 'سلطان' }, dynastyId: 'aq_qoyunlu', rulerType: 'Central Monarch', startDate: 1497, endDate: 1508 },
  ismail_i: { id: 'ismail_i', name: { en: 'Ismail I', fa: 'شاه اسماعیل یکم' }, title: { en: 'Shah', fa: 'شاه' }, dynastyId: 'safavid', rulerType: 'Central Monarch', startDate: 1501, endDate: 1524 },
  shahrokh_afshar: { id: 'shahrokh_afshar', name: { en: 'Shahrokh Shah', fa: 'شاهرخ میرزا' }, title: { en: 'Shah', fa: 'شاه' }, dynastyId: 'afsharid', rulerType: 'Central Monarch', startDate: 1748, endDate: 1796 },
  lotf_ali_khan: { id: 'lotf_ali_khan', name: { en: 'Lotf Ali Khan', fa: 'لطفعلی‌خان زند' }, title: { en: 'Vakil', fa: 'وکیل' }, dynastyId: 'zand', rulerType: 'Central Monarch', startDate: 1789, endDate: 1794 },
  agha_mohammad_khan: { id: 'agha_mohammad_khan', name: { en: 'Agha Mohammad Khan', fa: 'آقامحمدخان قاجار' }, title: { en: 'Shah', fa: 'شاه' }, dynastyId: 'qajar', rulerType: 'Central Monarch', startDate: 1789, endDate: 1797 },
  ahmad_shah_qajar: { id: 'ahmad_shah_qajar', name: { en: 'Ahmad Shah', fa: 'احمدشاه قاجار' }, title: { en: 'Shah', fa: 'شاه' }, dynastyId: 'qajar', rulerType: 'Central Monarch', startDate: 1909, endDate: 1925 },
  khomeini: { id: 'khomeini', name: { en: 'Ruhollah Khomeini', fa: 'روح‌الله خمینی' }, title: { en: 'Supreme Leader', fa: 'رهبر' }, dynastyId: 'islamic_republic', rulerType: 'Central Monarch', startDate: 1979, endDate: 1989 },
  khamenei: { id: 'khamenei', name: { en: 'Ali Khamenei', fa: 'علی خامنه‌ای' }, title: { en: 'Supreme Leader', fa: 'رهبر' }, dynastyId: 'islamic_republic', rulerType: 'Central Monarch', startDate: 1989, endDate: 2024 },
};

let newRulersStr = '';
for (const [key, value] of Object.entries(newRulers)) {
  newRulersStr += `  ${key}: ${JSON.stringify(value, null, 2).replace(/\n/g, '\n  ')},\n`;
}

// Remove the wrongly inserted block
const startIdx = content.indexOf('  bahram_chobin: {');
const endIdx = content.lastIndexOf('  khamenei: {');
if (startIdx !== -1 && endIdx !== -1) {
  const endOfWrongBlock = content.indexOf('},', endIdx) + 3;
  content = content.substring(0, startIdx) + '};\n' + content.substring(endOfWrongBlock);
}

// Now append properly
const lastBraceIdx = content.lastIndexOf('};');
content = content.substring(0, lastBraceIdx) + newRulersStr + '};\n';

fs.writeFileSync('src/data/rulers.ts', content);
