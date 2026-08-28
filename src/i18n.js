/* ------------------------------------------------------------------ *
 *  Tiny fa/en i18n. Elements use data-i18n="key".                    *
 * ------------------------------------------------------------------ */

const STR = {
  en: {
    title: 'ROOZSHOMAR',
    tagline: 'a narrative platformer · feel & light study',
    start: 'begin',
    hintStart: 'press any key or tap',
    paused: 'paused',
    resume: 'resume',
    restart: 'return to checkpoint',
    checkpoint: 'checkpoint',
    hintMove: '← → / A D move',
    hintJump: 'space jump · hold = higher',
    hintPause: 'esc pause',
    hintScene: 'T scene · ` debug · 1-5 music',
    track: 'track',
    feel: 'feel room',
    showcase: 'showcase',
    langBtn: 'FA',
  },
  fa: {
    title: 'روزشمار',
    tagline: 'پلتفرمر روایی · مطالعهٔ حس و نور',
    start: 'آغاز',
    hintStart: 'کلیدی بزنید یا لمس کنید',
    paused: 'توقف',
    resume: 'ادامه',
    restart: 'بازگشت به نقطهٔ بازگشت',
    checkpoint: 'نقطهٔ بازگشت',
    hintMove: '← → / A D حرکت',
    hintJump: 'اسپیس پرش · نگه‌داشتن = بلندتر',
    hintPause: 'esc توقف',
    hintScene: 'T صحنه · ` دیباگ · 1-5 موسیقی',
    track: 'قطعه',
    feel: 'اتاق حس',
    showcase: 'ویترین',
    langBtn: 'EN',
  },
};

export class I18n {
  constructor() {
    this.lang = localStorage.getItem('rz_ng_lang')
      || (navigator.language?.startsWith('fa') ? 'fa' : 'en');
  }
  t(key) { return (STR[this.lang] || STR.en)[key] ?? key; }
  apply(root = document) {
    document.documentElement.lang = this.lang;
    document.documentElement.dir = this.lang === 'fa' ? 'rtl' : 'ltr';
    document.body?.classList.toggle('fa', this.lang === 'fa');
    root.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = this.t(el.getAttribute('data-i18n'));
    });
  }
  toggle() {
    this.lang = this.lang === 'fa' ? 'en' : 'fa';
    localStorage.setItem('rz_ng_lang', this.lang);
    this.apply();
  }
}
