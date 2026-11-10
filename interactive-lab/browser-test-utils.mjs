import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

// Use an installed desktop browser; never download a browser during tests.
export const browserChannel = process.env.TEST_BROWSER_CHANNEL ||
  (process.platform === 'darwin' && !existsSync('/Applications/Google Chrome.app') &&
   existsSync('/Applications/Microsoft Edge.app') ? 'msedge' : 'chrome');
export const launchBrowser = async () => {
  const browser = await chromium.launch({channel: browserChannel, headless: true});
  const newContext = browser.newContext.bind(browser);
  // Existing scenarios assert Chinese copy; locale tests explicitly override this default.
  browser.newContext = options => newContext({locale:'zh-CN', ...options});
  return browser;
};
