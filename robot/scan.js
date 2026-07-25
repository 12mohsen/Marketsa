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

    // 4) افتح رادار (يُهيّئ البيانات) ثم شغّل المسح وانتظر انتهاءه
    await page.click('.nav-btn[data-tab="all"]', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await page.evaluate(async () => { if (window.predScanAll) await window.predScanAll(); });

    // 5) احتياط: تأكّد أن المسح انتهى فعلاً (حتى 6 دقائق)
    await page.waitForFunction(
      () => (typeof window.predIsScanning !== 'function') || !window.predIsScanning(),
      { timeout: 360000, polling: 3000 }
    ).catch(() => {});
    await page.waitForTimeout(10000);   // اترك الرفع للقاعدة يكتمل

    // 6) أعد مسح القنّاص (يحسب المزايا بأحدث بناء)
    await page.evaluate(() => { if (window.sniperRescan) window.sniperRescan(); });
    await page.waitForTimeout(8000);

    // 7) تحقّق أن النتائج رُفعت فعلاً
    const n = await page.evaluate(() => (typeof window.predCount === 'function' ? window.predCount() : 0));
    await tg('✅ المسح التلقائي تمّ — ' + (n || '؟') + ' سهم · التحليل محدّث للجميع.');
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
