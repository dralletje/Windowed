let puppeteer = require('puppeteer');
let path = require('path');



let extension_path = path.resolve(__dirname, '../extension');
let page_html = path.resolve(__dirname, 'page.html');

console.log(`extension_path:`, extension_path)

let run = async () => {
  try {
    let browser = await puppeteer.launch({
      devtools: false,
      headless: false,
      sloMo: true,
      args: [
        // I need this for CORS stuff
        '--disable-web-security',

        // Some things I saw on the internet idk if they make it better
        "--proxy-server='direct://'",
        '--proxy-bypass-list=*',
        '--no-sandbox',

        `--disable-extensions-except=${extension_path}/`,
        `--load-extension=${extension_path}/`,
      ],
    });

    let page = await browser.newPage();

    page.setDefaultTimeout = 5000;
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36'
    );

    // let browser_console = make_holy_console({
    //   name: 'From Browser',
    //   map_fn: (line) => chalk.dim(line),
    // });
    page.on('console', async (msg) => {
      let args = await Promise.all(msg.args().map((x) => x.jsonValue()));
      console.log('BROWSER:', ...args);
    });

    let url = `file://${page_html}`;
    page.goto(url).catch((err) => {
      console.log(`Error from page.goto:`, err.message);
    });

    await page._client.send('Emulation.clearDeviceMetricsOverride')

    await page.screenshot({
      path: path.resolve(__dirname, `./screenshots/normal.png`),
    });

    for (let window_target of ['windowed', 'in-window', 'fullscreen']) {
      let fullscreen_button = await page.waitForSelector(`.fullscreen`);
      await fullscreen_button.click();
      let windowed_button = await page.waitForSelector(`[data-target="${window_target}"]`);
      await windowed_button.click();

      // await new Promise((resolve) => {
      //   setTimeout(() => {
      //     resolve();
      //   }, 3000);
      // })

      let viewport = page.viewport();
      // console.log(`viewport:`, viewport)
      await page.screenshot({
        path: path.resolve(__dirname, `./screenshots/${window_target}.png`),
      });

      // let innerheight = await page.evaluate(() => document.querySelector('.video').innerHeight);
      // let innerwidth = await page.evaluate(() => document.querySelector('.video').innerWidth);

      let innerheight = await page.evaluate(() => window.innerHeight);
      let innerwidth = await page.evaluate(() => window.innerWidth);

      let body_innerheight = await page.evaluate(() => document.body.offsetHeight);
      let body_innerwidth = await page.evaluate(() => document.body.offsetWidth);

      console.log(`body_innerheight:`, body_innerheight)
      console.log(`body_innerwidth:`, body_innerwidth)

      console.log(`innerheight:`, innerheight);
      console.log(`innerwidth:`, innerwidth)

      let exit_fullscreen_button = await page.waitForSelector(`.exit-fullscreen`);
      await exit_fullscreen_button.click();
    }

    browser.close();
    console.log('Done');
    process.exit(0);
  } catch (error) {
    console.log(`error.stack:`, error.stack);
    process.exit(1);
  }
}

run();
