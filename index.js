require('dotenv').config();
const puppeteer = require('puppeteer');
const autoScroll = require('./lib/autoscroll').autoScroll;

const KROGER_COUPON_LIMIT = 150;

// login page selectors
const emailSelector = '#SignIn-emailInput';
const passwordSelector = '#SignIn-passwordInput';
const submitButton = '#SignIn-submitButton';

// coupon page selectors
const inStoreCheckbox = '#SearchableList-item-In-Store';
const couponCountXpath = '//div[contains(@aria-label, "clickable item.")]';
const allClipButtons = 'div.CouponCard-ButtonSection > button.kds-Button.kds-Button--primary';

function delay(timeInSeconds) {
  return new Promise(function(resolve) { 
      setTimeout(resolve, timeInSeconds * 1000);
  });
}

async function clickAndEnterText(page, selector, text) {
  await page.click(selector);
  await delay(1);
  await page.type(selector, text);
}

(async () => {
  const browser = await puppeteer.launch({headless: false, slowMo: 150, args: ["--disable-web-security"]});
  const page = await browser.newPage();

  // browser config stuffs
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.72 Safari/537.36');
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
    });
  });
  await page.setRequestInterception(true);
  var disallowedUrlTest = RegExp(`adobe|mbox|ruxitagentjs|akam|sstats.kroger.com|rb_[A-Za-z0-9]{8}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{12}`);

  page.on('request', (request) => {
      const url = request.url();
      // Check request if it is for the file
      // that we want to block, and if it is, abort it
      // otherwise just let it run
      if (disallowedUrlTest.test(url)) {
          request.abort();
      } else {
          request.continue();
      }
  });
  
  await page.goto('https://www.kroger.com/signin', { waitUntil: 'networkidle2' });
  await page.waitForSelector(emailSelector);
  
  const email = process.env.KROGER_EMAIL;
  const password = process.env.KROGER_PASSWORD;

  console.log(email);
  console.log(password);

  // intentionally delay things to hopefully avoid whatever detection kroger is using
  await delay(3);
  await clickAndEnterText(page, emailSelector, email);
  await delay(2);
  await clickAndEnterText(page, passwordSelector, password);
  await delay(1);
  await page.click(submitButton);

  await delay(30);
  await page.goto('https://www.kroger.com/savings/cl/coupons/', { waitUntil: 'networkidle2' });
  await delay(15);
  // get current # of coupons clipped because there's a limit
  const clickableDivs = await page.$x(couponCountXpath);
  const clippedCount = await clickableDivs[0].evaluate(el => parseInt(el.textContent));
  
  // set inStore filter
  await page.waitForSelector(inStoreCheckbox);
  await page.click(inStoreCheckbox);

  // kroger does the infinite scroll thing -- let's assume no more than 10 "pages" of coupons
  for (let scrolls = 0; scrolls < 10; scrolls += 1) {
    await autoScroll(page);
    await delay(3);
  }

  // finally let's do the thing
  const clipButtonList = await page.$$(allClipButtons);

  let added = 0;
  for (const clipButton of clipButtonList) {
    if (clippedCount + added >= KROGER_COUPON_LIMIT) {
      break;
    }

    await clipButton.click();
    added += 1;
    
    await delay(5);
  }

  console.log('Finished clipping!');

})();