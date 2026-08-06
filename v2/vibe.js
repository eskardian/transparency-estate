// vibe.js — эмоциональный слой: сезон, погода, тёплые фразы. Общий для index.html и share.html.
// Каркас — фаза 0. Наполнение WEATHER_PHRASES* (Т2) и seasonBanner (Т3) — задачи исполнителя.
window.Vibe = (() => {

  // ── Сезон ──
  function season(d = new Date()){
    const m = d.getMonth() + 1;
    return m>=3&&m<=5 ? 'spring' : m>=6&&m<=8 ? 'summer' : m>=9&&m<=11 ? 'autumn' : 'winter';
  }
  const SEASON_RU = { spring:'весна', summer:'лето', autumn:'осень', winter:'зима' };
  function applySeason(){
    document.body.classList.remove('season-spring','season-summer','season-autumn','season-winter');
    document.body.classList.add('season-' + season());
  }

  // ── Погода: open-meteo (без ключа), кэш в localStorage на 1 час ──
  async function getWeather(lat, lon){
    const key = 'vibe_w_' + lat.toFixed(2) + '_' + lon.toFixed(2);
    try{
      const c = JSON.parse(localStorage.getItem(key) || 'null');
      if(c && Date.now() - c.at < 3600e3) return c.w;
    }catch(e){}
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weather_code&timezone=auto`;
    const r = await fetch(url);
    if(!r.ok) throw new Error('weather http ' + r.status);
    const j = await r.json();
    const w = { t: Math.round(j.current.temperature_2m), precip: j.current.precipitation,
                code: j.current.weather_code, season: season() };
    try{ localStorage.setItem(key, JSON.stringify({ at: Date.now(), w })); }catch(e){}
    return w;
  }

  // ── Фразы (Т2: наполняет исполнитель) ──
  // Правило: { match: w => boolean, phrases: ['…{t}…', …] } — берётся первое подошедшее,
  // фразы внутри правила ротируются, {t} заменяется температурой («+26°»).
  // w = { t: °C, precip: мм, code: WMO weather code, season: 'spring'|'summer'|'autumn'|'winter' }
  // WMO weather code группы (open-meteo): 71-77,85,86 — снег; 51-67,80-82,95-99 — дождь/гроза; 0-1 — ясно.
  const isSnow = c => (c>=71&&c<=77) || c===85 || c===86;
  const isRain = c => (c>=51&&c<=67) || (c>=80&&c<=82) || (c>=95&&c<=99);
  const isClear = c => c<=1;

  // тон для клиента (портал): тёплый, приглашающий, без восклицаний. Первое подошедшее правило.
  const WEATHER_PHRASES = [
    { match: w => isSnow(w.code), phrases: [
      'За окном снег, на участке всё под белым покрывалом — зимой сад отдыхает и набирается сил.',
      'Сегодня снег и {t} — хорошее время представить, каким сад будет весной.',
      'Снежно и тихо. Сад ждёт тепла, а мы держим вас в курсе.' ] },
    { match: w => isRain(w.code) || w.precip >= 0.3, phrases: [
      'Сегодня дождь — растениям это на пользу, а работы продолжаются.',
      'На участке дождливо, {t}. Земля напитывается влагой, сад скажет спасибо.',
      'Дождливый день. Если собирались приехать — возьмите зонт, мы будем рады.' ] },
    { match: w => w.t >= 28, phrases: [
      'Жарко, {t} — на участке хочется в тень под кроны. Полив усилен, за садом следим.',
      'Сегодня {t} и солнце. Жаркий день, растения под присмотром и вовремя политы.' ] },
    { match: w => w.t <= -1, phrases: [
      'Морозно, {t} — сад укрыт и спит. Всё под контролем, ждём весны.',
      'На участке {t} и мороз. Зимой работы меньше, но объект не без внимания.' ] },
    { match: w => w.t >= 15 && isClear(w.code), phrases: [
      'Сегодня на участке {t} и солнце — отличный день приехать и посмотреть, как растёт ваш сад.',
      'Тепло и ясно, {t}. Самая та погода, чтобы пройтись по участку.',
      'На участке {t} и ни облачка. Сад в такие дни особенно хорош.' ] },
    { match: w => true, phrases: [
      'Сегодня на участке {t} — спокойный рабочий день, сад продвигается.',
      'Сейчас {t}. Заглядывайте — покажем, как растёт ваш сад.',
      'На участке {t}. Держим вас в курсе всего, что происходит.' ] },
  ];
  // тон для команды (index.html): практичный, про работы.
  const WEATHER_PHRASES_STAFF = [
    { match: w => isSnow(w.code), phrases: [
      'Снег, {t}. Бетон и посадки — по погоде, проверь укрытия крупномеров.',
      'Снегопад. Подъезд к участку может быть затруднён.' ] },
    { match: w => isRain(w.code) || w.precip >= 0.3, phrases: [
      'Дождь — бетонные и земляные работы лучше перенести.',
      'Сыро, {t}. Грунт размок, тяжёлую технику лучше не гонять.',
      'Дождливо. Проверь дренаж и накрытые материалы.' ] },
    { match: w => w.t >= 28, phrases: [
      'Жара {t} — усиль полив, свежие посадки приживаются хуже.',
      '{t} и солнце. Молодые посадки притеняй и поливай чаще.' ] },
    { match: w => w.t <= -1, phrases: [
      'Мороз {t} — раствор не встанет, бетонные работы стоп.',
      '{t}. Проверь укрытия, вода в шлангах замёрзнет.' ] },
    { match: w => w.t >= 15 && isClear(w.code), phrases: [
      'Тепло и ясно, {t} — хорошее окно для посадок и благоустройства.',
      'Ясно, {t}. Рабочий день без помех.' ] },
    { match: w => true, phrases: [
      'Сейчас {t}. Планируй работы по факту погоды.',
      '{t} на участке, ограничений по погоде нет.' ] },
  ];
  function weatherPhrase(w, staff){
    const rules = staff ? WEATHER_PHRASES_STAFF : WEATHER_PHRASES;
    const rule = rules.find(r => r.match(w));
    if(!rule) return null;
    const i = (parseInt(localStorage.getItem('vibe_ph') || '0', 10) + 1) % rule.phrases.length;
    try{ localStorage.setItem('vibe_ph', String(i)); }catch(e){}
    return rule.phrases[i].replace('{t}', (w.t > 0 ? '+' : '') + w.t + '°');
  }

  // ── Плашка «наступил новый сезон» (Т3) ──
  // Показывается один раз при смене сезона: мягкое появление, крестик, авто-скрытие через 8с.
  const SEASON_BANNER = {
    spring:'Наступила весна — скоро на вашем участке всё зацветёт.',
    summer:'Пришло лето — сад в самой силе, самое время им любоваться.',
    autumn:'Наступила осень — сад одевается в тёплые тона.',
    winter:'Пришла зима — сад отдыхает под снегом до весны.',
  };
  // Стили плашки инжектим из JS: она рендерится на обеих страницах, а share.html не грузит polish.css.
  function injectBannerCss(){
    if(document.getElementById('vibe-banner-css')) return;
    const s = document.createElement('style');
    s.id = 'vibe-banner-css';
    s.textContent = `
      .vibe-season-banner{ position:fixed; top:0; left:0; right:0; z-index:60;
        display:flex; align-items:center; gap:10px; justify-content:center;
        padding:12px 44px 12px 16px; font-size:14px; text-align:center;
        color:#fff; background:var(--accent,#6b7257); box-shadow:0 2px 10px rgba(0,0,0,.15);
        opacity:0; transform:translateY(-100%); transition:opacity .6s ease, transform .6s ease; }
      .vibe-season-banner.show{ opacity:1; transform:none; }
      .vibe-season-banner button{ position:absolute; right:10px; top:50%; transform:translateY(-50%);
        background:none; border:0; color:#fff; font-size:18px; line-height:1; cursor:pointer; padding:4px 8px; }`;
    document.head.appendChild(s);
  }
  function seasonBanner(){
    const cur = season();
    let last = null;
    try{ last = localStorage.getItem('vibe_last_season'); }catch(e){}
    if(last === cur) return;
    try{ localStorage.setItem('vibe_last_season', cur); }catch(e){}
    if(!last) return;               // первый визит — просто запоминаем сезон, без плашки
    injectBannerCss();
    const el = document.createElement('div');
    el.className = 'vibe-season-banner';
    el.innerHTML = '<span></span><button type="button" aria-label="Закрыть">✕</button>';
    el.querySelector('span').textContent = SEASON_BANNER[cur];   // без esc: текст свой, не из базы
    document.body.appendChild(el);
    requestAnimationFrame(()=> el.classList.add('show'));
    let t;
    const hide = ()=>{ clearTimeout(t); el.classList.remove('show'); setTimeout(()=>el.remove(), 600); };
    el.querySelector('button').onclick = hide;
    t = setTimeout(hide, 8000);
  }

  // самопроверки
  console.assert(season(new Date('2026-01-15'))==='winter' && season(new Date('2026-07-15'))==='summer', 'Vibe.season');
  console.assert(typeof weatherPhrase({t:32,precip:0,code:0,season:'summer'},false)==='string', 'Vibe.weatherPhrase heat');
  console.assert(weatherPhrase({t:32,precip:0,code:0,season:'summer'},false).indexOf('32')>=0, 'Vibe.weatherPhrase inserts temp');
  console.assert(weatherPhrase({t:-8,precip:1,code:73,season:'winter'},true)!==null, 'Vibe.weatherPhrase staff snow');
  console.assert(weatherPhrase({t:10,precip:0,code:3,season:'autumn'},false)!==null, 'Vibe.weatherPhrase default');

  function init(){ applySeason(); seasonBanner(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { season, SEASON_RU, applySeason, getWeather, weatherPhrase, seasonBanner,
           WEATHER_PHRASES, WEATHER_PHRASES_STAFF };
})();
