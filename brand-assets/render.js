const { chromium } = require('playwright');
const path = require('path');

const jobs = [
  { file: 'og-image.html', out: 'og-image.png', width: 1200, height: 630 },
  { file: 'linkedin-banner.html', out: 'linkedin-banner.png', width: 1584, height: 396 },
  { file: 'instagram-post.html', out: 'instagram-post.png', width: 1080, height: 1080 },
];

(async () => {
  const browser = await chromium.launch();
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width: job.width, height: job.height }, deviceScaleFactor: 1 });
    await page.goto('file://' + path.join(__dirname, job.file));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(__dirname, job.out) });
    await page.close();
    console.log('rendered', job.out);
  }
  await browser.close();
})();
