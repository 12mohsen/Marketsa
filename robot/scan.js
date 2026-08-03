/* ══════════════════════════════════════════════════════════════════
   🤖 روبوت المسح اليومي — يفتح تطبيقك ويضغط «إعادة المسح» نيابةً عنك
   لا محرّك ثانٍ — نفس كود التطبيق بالحرف. حقيقة واحدة، صفر تناقض.
   يعمل على GitHub Actions كل يوم تداول بعد الإغلاق.
   ══════════════════════════════════════════════════════════════════ */
const { chromium } = require('playwright');

const SITE  = 'https://markets-a.com';
const EMAIL = process.env.BOT_EMAIL;   // بريد حساب الروبوت (أدمن)
const PASS  = process.env.BOT_PASS;    // كلمة مروره
const TG_TOKEN = process.env.TG_TOKEN; // توكن بوت تلجرام (للإبلاغ)
const TG_CHAT  = process.env.TG_CHAT;  // مجموعة الإشعارات

async function tg(msg) {
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text: msg }),
    });
  } catch (_) {}
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  try {
    // 1) افتح الموقع وانتظر إقلاع التطبيق
    await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    // 2) افتح نافذة الدخول وسجّل دخولاً بحساب الروبوت
    await page.click('#btnAuth', { timeout: 15000 });
    await page.fill('[data-testid="login-email"]', EMAIL);
    await page.fill('[data-testid="login-password"]', PASS);
    await page.click('[data-testid="login-submit"]');
    await page.waitForTimeout(7000);   // الجلسة + تحميل بيانات الأدمن

    // 3) تأكّد أن الروبوت أدمن (وإلا لن يُرفع المسح)
    const admin = await page.evaluate(() => (typeof isAdmin === 'function' && isAdmin()));
    if (!admin) throw new Error('حساب الروبوت ليس أدمن — أضف بريده لقائمة الأدمن.');

    // 4) افتح رادار (يُهيّئ البيانات) — لازمٌ قبل المزامنة، فهي تقرأ `rows`
    await page.click('.nav-btn[data-tab="all"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(4000);

    /* 4.5) 🌙 مزامنة الشموع الناقصة — آخر عشر جلسات لكل رمز
       العلّة المُصلَحة: `historical_prices` كان يملؤه زرّ الأدمن وحده،
       فتتقادم شموع الشارت بينما السعر الحيّ يتقدّم — رُصد على 4009:
       الشارت 31.02 والترويسة 32.46 وجلسةُ اليوم غائبة.
       ▸ شهرٌ واحد لا خمس سنوات: تلك 62 ألف صفّ وقد زاحمت المسحَ من قبل
         حتى تجاوز مهلته. وهذه ~2700 صفّ تنتهي في دقيقة.
       ▸ ولا تُسقِط المهمّة إن تعثّرت: المسح أهمّ منها، والتأخّر صار
         مُعلَناً على الشارت نفسه. نُبلّغ ولا نُفشِل. */
    let syncMsg = '';
    try {
      const s = await page.evaluate(async () => {
        if (!window.histSyncRecent) return null;
        return await window.histSyncRecent({ keep: 10, budgetMs: 240000 });
      });
      if (s && s.skipped) syncMsg = '\n🌙 الشموع: تُخطّيت (' + s.skipped + ')';
      else if (s) syncMsg = '\n🌙 الشموع: ' + s.ok + '/' + (s.total || '?') + ' رمز · ' + s.rows + ' صف'
        + (s.fail ? ' · ' + s.fail + ' فشل' : '')
        + (s.cut ? ' · ⏱️ بلغت السقف (٤ د) وتُستكمل غداً' : '');
      else syncMsg = '\n🌙 الشموع: الدالّة غير موجودة في هذا البناء';
    } catch (e) {
      syncMsg = '\n⚠️ الشموع: تعثّرت المزامنة (' + (e && e.message ? e.message.slice(0, 80) : '؟') + ') — المسح مضى';
    }

    // 5) شغّل المسح وانتظر انتهاءه
    await page.evaluate(async () => { if (window.predScanAll) await window.predScanAll(); });

    /* 5.5) احتياط: تأكّد أن المسح انتهى فعلاً
       ⚠️ كان هنا `.catch(() => {})` — ابتلاعٌ صامت للمهلة. فلو تجاوز
       المسح ستّ دقائق ولم يكتمل، يمضي الروبوت ويُرسل «✅ تمّ — 269 سهم»
       وهو رقم المسح **السابق** المحفوظ. أي إعلان نجاحٍ عن عملٍ لم يتمّ،
       والمستخدمون على تحليل الأمس ولا أحد يعلم.
       وهذا سادسُ فشلٍ صامت نكسره في هذا المشروع. */
    /* ⏱️ المهلة رُفعت 6 ← 10 دقائق.
       رُصد فشلٌ حقيقيّ: المسح تلا `sync-historical` (270 رمزاً · 62 ألف
       صفّ) فتزاحما على نفس القاعدة وتجاوز الستّ. والمسح يجلب شموع 269
       رمزاً بتزامنٍ محدود — ستّ دقائق كانت تكفي بالكاد، وأيّ بطءٍ عارض
       يقصمها. وحدّ المهمّة في الـworkflow 20 دقيقة، فالعشر آمنة. */
    const WAIT_MS = 600000;
    let timedOut = false;
    await page.waitForFunction(
      () => (typeof window.predIsScanning !== 'function') || !window.predIsScanning(),
      { timeout: WAIT_MS, polling: 3000 }
    ).catch(() => { timedOut = true; });
    if (timedOut) {
      /* 📊 كم بلغ قبل أن تنقضي المهلة؟ يفرّق بين «بطيء» و«عالق». */
      let got = 0;
      try { got = await page.evaluate(() => (typeof window.predCount === 'function' ? window.predCount() : 0)); } catch (_) {}
      throw new Error('تجاوز المسح ' + (WAIT_MS / 60000) + ' دقائق ولم يكتمل (بلغ '
        + (got || 0) + ' سهماً) — لم تُرفع نتائج جديدة.');
    }
    await page.waitForTimeout(10000);   // اترك الرفع للقاعدة يكتمل

    // 6) أعد مسح القنّاص (يحسب المزايا بأحدث بناء)
    await page.evaluate(() => { if (window.sniperRescan) window.sniperRescan(); });
    await page.waitForTimeout(8000);

    /* 7) تحقّق أن النتائج رُفعت فعلاً
       ⚠️ ورقمٌ صفرٌ أو ضئيل ليس نجاحاً: السوق السعودي ~269 رمزاً، فإن
       عاد العدّ دون المئتين فقد سقط شطرٌ من المسح. لا نُعلن «محدّث
       للجميع» عن نصف مسح. */
    const n = await page.evaluate(() => (typeof window.predCount === 'function' ? window.predCount() : 0));
    if (!n || n < 200) {
      throw new Error('النتائج ناقصة: ' + (n || 0) + ' سهم فقط (المتوقّع ~269).');
    }
    /* 8) 🩺 تقرير صحّة البيانات — أن تعرف العطل قبل أن يسألك مستخدم
       العطل الصامت هو ما كلّفنا الثقة: بقيت الشموع متأخّرة ولا شيء
       يُنبّه، حتى فتح أحدهم سهماً فرأى إغلاق الأمس تحت سعر اليوم.
       فصار كل مسحٍ يُبلّغ حالَ البيانات لا نجاحَه فقط. */
    let health = '';
    try {
      const h = await page.evaluate(() => (window.dataHealthReport ? window.dataHealthReport() : null));
      if (h && h.ok) {
        health = '\n\n🩺 صحّة البيانات (آخر جلسة ' + h.expected + ')'
          + '\n✅ محدّث: ' + h.fresh + ' · 🟡 متأخّر جلسة: ' + h.late1
          + ' · 🔴 متأخّر جلستين+: ' + h.late2
          + (h.unknown ? ' · ❔ بلا تاريخ: ' + h.unknown : '');
        if (h.late2 > 0) {
          health += '\n⛔ خطط التنفيذ محجوبة على ' + h.late2 + ' سهماً.';
          if (h.worst && h.worst.length) {
            health += '\nأسوأها: ' + h.worst.map(w => w.sym + ' (' + w.lag + ')').join(' · ');
          }
        }
      }
    } catch (_) {}
    await tg('✅ المسح التلقائي تمّ — ' + n + ' سهم · التحليل محدّث للجميع.' + syncMsg + health);
    console.log('done · results:', n);
  } catch (e) {
    const msg = (e && e.message) || String(e);
    await tg('⚠️ فشل المسح التلقائي: ' + msg);
    console.error('FAILED:', msg);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
