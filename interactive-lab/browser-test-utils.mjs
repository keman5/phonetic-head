import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

// Use an installed desktop browser; never download a browser during tests.
export const browserChannel = process.env.TEST_BROWSER_CHANNEL ||
  (process.platform === 'darwin' && !existsSync('/Applications/Google Chrome.app') &&
   existsSync('/Applications/Microsoft Edge.app') ? 'msedge' : 'chrome');
export const launchBrowser = () => chromium.launch({channel: browserChannel, headless: true});
