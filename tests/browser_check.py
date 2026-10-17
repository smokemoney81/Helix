"""Live smoke check. Uses public HF quota; run with server on port 3000."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUT=Path(__file__).resolve().parents[1] / 'test-results'
OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    context=browser.new_context(viewport={'width':1440,'height':1100},device_scale_factor=1,storage_state=str(OUT/'browser-session.json') if (OUT/'browser-session.json').exists() else None)
    page=context.new_page()
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('console',lambda m: errors.append(m.text) if m.type=='error' else None)
    page.goto('http://127.0.0.1:3000',wait_until='networkidle')
    page.screenshot(path=str(OUT/'discover-desktop.png'),full_page=True)
    assert page.locator('.model-card').count()==4
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    page.get_by_role('button',name='Voice',exact=True).first.click()
    assert page.locator('.model-card').count()==2
    page.locator('#search-input').fill('Qwen')
    assert page.locator('.model-card').count()==1
    page.locator('#search-input').fill('')
    page.locator('[data-select="kitten"]').first.click()
    page.locator('#prompt').fill('Welcome to Magnetic. Every great story begins with a small idea.')
    page.locator('#generate-button').click()
    expect(page.locator('#preview-status')).not_to_have_text('BEREIT FÜR IDEEN', timeout=15000)
    print('voice_started',page.locator('#preview-status').inner_text(),flush=True)
    page.context.storage_state(path=str(OUT/'browser-session.json'))
    expect(page.locator('#preview-content audio')).to_be_visible(timeout=60000)
    print('voice_completed_in_browser',flush=True)
    with page.expect_download() as download_info:
        page.locator('#preview-content a[download]').click()
    download_info.value.save_as(str(OUT/'voice-result.wav'))
    assert (OUT/'voice-result.wav').stat().st_size>1000
    page.reload(wait_until='networkidle')
    expect(page.locator('#preview-content audio')).to_be_visible()
    page.screenshot(path=str(OUT/'studio-desktop.png'),full_page=True)
    page.locator('[data-nav="library"]').click()
    expect(page.locator('.library-card audio').first).to_be_visible()
    page.screenshot(path=str(OUT/'library-desktop.png'),full_page=True)
    print('audio_download_and_reload: passed',flush=True)
    mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
    mobile.goto('http://127.0.0.1:3000',wait_until='networkidle')
    mobile.screenshot(path=str(OUT/'discover-mobile.png'),full_page=True)
    assert not mobile.evaluate('document.documentElement.scrollWidth > innerWidth')
    mobile.locator('[data-nav="studio"]').click()
    mobile.screenshot(path=str(OUT/'studio-mobile.png'),full_page=True)
    assert not mobile.evaluate('document.documentElement.scrollWidth > innerWidth')
    print('desktop_mobile_navigation_filter_search: passed; browser_errors:',errors,flush=True)
    assert not errors
    browser.close()
