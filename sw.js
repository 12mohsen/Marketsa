/* ══════════════════════════════════════════════════════════════════
   ⚙️ Service Worker — تداول بلس
   الفلسفة: لا نخاطر بعرض نسخة قديمة من التطبيق.
     • التنقّل (index.html): الشبكة أولاً — فتظهر أحدث نسخة دائماً،
       ونرجع للكاش فقط عند انقطاع الشبكة (عمل دون اتصال).
     • مكتبات CDN (ثابتة): الكاش أولاً — أسرع بلا مخاطرة (نسخ مثبّتة).
     • بيانات ياهو/Supabase: لا نتدخّل — تمرّ مباشرة (يجب أن تكون حيّة).
   ══════════════════════════════════════════════════════════════════ */
const CACHE = 'tadawul-plus-v2';   /* 🔄 رُفع الرقم لإسقاط الكاش القديم (كان يعرض بوابة اشتراك قديمة) */
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
];

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* 🌐 بيانات حيّة: لا نلمسها (ياهو · Supabase · بروكسي · Google Sheets) */
  if (/query1\.finance\.yahoo|supabase\.co|allorigins|corsproxy|codetabs|cors\.sh|script\.google|docs\.google|tadawul-proxy|api\.telegram/.test(url.href)) return;

  /* 📦 مكتبات CDN الثابتة: الكاش أولاً */
  if (CDN.indexOf(url.href) >= 0) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res; }
      catch (_) { return hit || Response.error(); }
    })());
    return;
  }

  /* 🏠 التطبيق نفسه (نفس النطاق): الشبكة أولاً، والكاش احتياطٌ عند الانقطاع */
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
        return res;
      } catch (_) {
        const c = await caches.open(CACHE);
        const hit = await c.match(req) || await c.match('/index.html') || await c.match('/');
        return hit || Response.error();
      }
    })());
  }
});
