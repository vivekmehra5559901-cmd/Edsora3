"""Headless Chromium visual/interaction smoke tests for Edsora.

Navigation to localhost/file URLs is restricted in this execution environment, so the
exact HTML bytes are loaded with page.set_content(). This validates rendered DOM/UI
interactions but is not a live-origin/backend E2E test.
"""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]; DEP=ROOT/'DEPLOYABLE'; OUT=ROOT/'evidence'; OUT.mkdir(exist_ok=True)
app=(DEP/'index.html').read_text(encoding='utf-8'); admin=(DEP/'admin/index.html').read_text(encoding='utf-8')
results=[]
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1000}); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(app,wait_until='commit',timeout=20000); page.wait_for_timeout(1500)
 assert page.locator('#googleSignup').count()==1 and page.locator('#seatGrid').count()==1 and page.locator('#pwaSheet').count()==1
 assert 'Update files with new or modified records' in page.locator('body').inner_text()
 def shot(name):
  page.screenshot(path=str(OUT/(name+'.png')),full_page=True,animations='disabled',timeout=15000)
  results.append({'name':name,'viewport':page.viewport_size,'dark':'dark' in (page.locator('html').get_attribute('class') or ''),'pageErrors':list(errors)})
 shot('01-dashboard-light')
 page.evaluate("document.documentElement.classList.add('dark');document.body.classList.add('dark')"); shot('02-dashboard-dark')
 page.set_viewport_size({'width':390,'height':844}); page.evaluate("document.documentElement.classList.remove('dark');document.body.classList.remove('dark')"); shot('03-dashboard-mobile-light')
 page.evaluate("document.documentElement.classList.add('dark');document.body.classList.add('dark')"); shot('04-dashboard-mobile-dark')
 page.evaluate("document.documentElement.classList.remove('dark');document.body.classList.remove('dark')")
 page.evaluate("document.querySelector('#sgnPop').classList.add('open');document.querySelector('#sgnPop').setAttribute('aria-hidden','false')"); page.wait_for_timeout(200); assert page.locator('#sgnPop.open').count()==1
 assert page.get_by_text('Terms & Conditions').count()>=1 and page.get_by_text('Privacy Policy').count()>=1
 shot('05-signup-popover-light')
 page.evaluate("document.querySelector('#sgnPop').classList.remove('open');document.documentElement.classList.add('dark');document.body.classList.add('dark');document.querySelector('#sgnPop').classList.add('open')"); page.wait_for_timeout(200); shot('06-signup-popover-dark')
 page.evaluate("document.querySelector('#sgnPop').classList.remove('open');document.documentElement.classList.remove('dark');document.body.classList.remove('dark');document.querySelector('#seatPop').classList.add('open');document.querySelector('#seatPop').setAttribute('aria-hidden','false')")
 assert page.locator('#spTitle').inner_text()=='Knock knock... Admin?'; shot('07-seat-popover-light')
 page.evaluate("document.querySelector('#spForm').hidden=false;document.querySelector('.sp-line').hidden=true;document.querySelector('#seatPop').classList.add('emailstep')"); assert not page.locator('#spForm').evaluate('(e)=>e.hidden'); shot('08-seat-email-step')
 page.evaluate("document.querySelector('#seatPop').classList.remove('open');document.querySelector('#pwaSheet').classList.add('open');document.querySelector('#pwaSheet').setAttribute('aria-hidden','false')")
 assert page.locator('#pwaTitle').inner_text()=='Install Edsora'; shot('09-pwa-sheet-light')
 page.evaluate("document.querySelector('#pwaGift').classList.add('open','opening');document.querySelector('.pg-face').setAttribute('aria-hidden','true');document.querySelector('.pg-reveal').setAttribute('aria-hidden','false');document.querySelector('#pwaMsg').textContent='🎉 Congratulations! Your ready-made Excel template is here. Just open it, fill in the details row by row, and upload it to Edsora. Set it up once. Enjoy the benefits all year long!'"); shot('10-free-gift-unpacked')
 page.evaluate("document.documentElement.classList.add('dark');document.body.classList.add('dark')"); shot('11-pwa-sheet-dark')
 page.close()
 ap=b.new_page(viewport={'width':1440,'height':1000}); aerr=[]; ap.on('pageerror',lambda e:aerr.append(str(e))); ap.set_content(admin,wait_until='commit',timeout=20000); ap.wait_for_timeout(250); ap.screenshot(path=str(OUT/'12-admin-light.png'),full_page=True,animations='disabled',timeout=15000); results.append({'name':'12-admin-light','viewport':ap.viewport_size,'dark':False,'pageErrors':aerr}); ap.close()
 b.close()
 doc={'method':'Playwright + system Chromium; exact deployable HTML rendered via page.set_content because navigation is blocked here; popover states are displayed by toggling their DOM state, not by claiming live backend interaction','screenshots':results,'notes':['Visual rendering checks; modal states are toggled locally for screenshot evidence. Browser click handlers and live backend/API E2E are not verified in this environment.','Razorpay, Google auth, D1 persistence, WhatsApp delivery and signed webhook require deployment credentials and origin-based testing.'],'counts':{'screenshots':len(results),'pageErrors':sum(len(x['pageErrors']) for x in results)}}
 (OUT/'browser-results.json').write_text(json.dumps(doc,indent=2),encoding='utf-8'); print(json.dumps(doc['counts'],indent=2)); print('page errors:',[(x['name'],x['pageErrors']) for x in results if x['pageErrors']])
