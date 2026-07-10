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
  const WEATHER_PHRASES = [];        // тон для клиента (портал): тёплый, приглашающий
  const WEATHER_PHRASES_STAFF = [];  // тон для команды (index.html): практичный
  function weatherPhrase(w, staff){
    const rules = staff ? WEATHER_PHRASES_STAFF : WEATHER_PHRASES;
    const rule = rules.find(r => r.match(w));
    if(!rule) return null;
    const i = (parseInt(localStorage.getItem('vibe_ph') || '0', 10) + 1) % rule.phrases.length;
    try{ localStorage.setItem('vibe_ph', String(i)); }catch(e){}
    return rule.phrases[i].replace('{t}', (w.t > 0 ? '+' : '') + w.t + '°');
  }

  // ── Плашка «наступил новый сезон» (Т3: реализует исполнитель) ──
  // Контракт: показать один раз при смене значения localStorage['vibe_last_season'], мягкая анимация, авто-скрытие.
  function seasonBanner(){ /* Т3 */ }

  // самопроверки
  console.assert(season(new Date('2026-01-15'))==='winter' && season(new Date('2026-07-15'))==='summer', 'Vibe.season');

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applySeason);
  else applySeason();

  return { season, SEASON_RU, applySeason, getWeather, weatherPhrase, seasonBanner,
           WEATHER_PHRASES, WEATHER_PHRASES_STAFF };
})();
