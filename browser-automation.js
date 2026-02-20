import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  
  try {
    console.log('Navigating to the page...');
    await page.goto('http://localhost:5000/recording/9f87964b-f3af-45fe-aba9-50d3dddab081', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    console.log('Page loaded. Waiting for content to render...');
    await page.waitForTimeout(2000);
    
    console.log('Looking for Transcript tab...');
    
    // Try multiple selectors to find the Transcript tab
    const transcriptSelectors = [
      'text=Transcript',
      '[role="tab"]:has-text("Transcript")',
      'button:has-text("Transcript")',
      'a:has-text("Transcript")',
      '[data-state]:has-text("Transcript")',
      '.tab:has-text("Transcript")'
    ];
    
    let transcriptTab = null;
    for (const selector of transcriptSelectors) {
      try {
        transcriptTab = await page.locator(selector).first();
        if (await transcriptTab.count() > 0) {
          console.log(`Found Transcript tab with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!transcriptTab || await transcriptTab.count() === 0) {
      console.log('Could not find Transcript tab. Getting page content...');
      const bodyText = await page.textContent('body');
      console.log('Page text content:', bodyText.substring(0, 1000));
      
      // Take screenshot of initial state
      await page.screenshot({ path: '/home/runner/workspace/screenshot-initial.png', fullPage: true });
      console.log('Screenshot saved to screenshot-initial.png');
      
      // Get all visible text elements
      const allText = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('*'))
          .filter(el => el.offsetParent !== null)
          .map(el => el.textContent?.trim())
          .filter(text => text && text.length > 0)
          .slice(0, 50);
      });
      console.log('Visible text elements:', JSON.stringify(allText, null, 2));
      
    } else {
      console.log('Clicking on Transcript tab...');
      await transcriptTab.click();
      
      console.log('Waiting for tab content to load...');
      await page.waitForTimeout(2000);
      
      console.log('Taking screenshot...');
      await page.screenshot({ path: '/home/runner/workspace/screenshot-transcript.png', fullPage: true });
      console.log('Screenshot saved to screenshot-transcript.png');
      
      // Get the transcript content
      console.log('\n=== TRANSCRIPT TAB CONTENT ===');
      const transcriptContent = await page.evaluate(() => {
        const body = document.body;
        
        // Try to find the transcript container
        const possibleContainers = [
          document.querySelector('[role="tabpanel"]'),
          document.querySelector('.transcript'),
          document.querySelector('[data-state="active"]'),
          body
        ];
        
        const container = possibleContainers.find(el => el !== null) || body;
        
        // Get all visible text
        const allText = container.innerText || container.textContent;
        
        // Also get structured data
        const speakers = Array.from(container.querySelectorAll('[data-speaker], .speaker, .message-speaker'))
          .map(el => el.textContent?.trim());
        
        const messages = Array.from(container.querySelectorAll('.message, [data-message], .transcript-item'))
          .map(el => ({
            speaker: el.querySelector('[data-speaker], .speaker')?.textContent?.trim(),
            text: el.textContent?.trim()
          }));
        
        const isEmpty = container.querySelector('.empty, [data-empty], .no-content, .no-data');
        const errorMsg = container.querySelector('.error, [data-error], .error-message');
        
        return {
          allText: allText?.substring(0, 5000),
          speakers: speakers,
          messages: messages.slice(0, 20),
          isEmpty: isEmpty ? isEmpty.textContent : null,
          errorMsg: errorMsg ? errorMsg.textContent : null,
          html: container.innerHTML?.substring(0, 2000)
        };
      });
      
      console.log(JSON.stringify(transcriptContent, null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    await page.screenshot({ path: '/home/runner/workspace/screenshot-error.png', fullPage: true });
    console.log('Error screenshot saved to screenshot-error.png');
  } finally {
    await browser.close();
  }
})();
