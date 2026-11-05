import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
export const auditUrl=process.env.STREETSKATE_URL || 'http://127.0.0.1:4173/';
export function launchAuditBrowser() {
  const windowsChrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
  const executablePath=process.env.STREETSKATE_BROWSER_EXECUTABLE
    || (process.platform==='win32'&&existsSync(windowsChrome)?windowsChrome:undefined);
  return chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
}
