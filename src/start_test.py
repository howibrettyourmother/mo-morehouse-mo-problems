# Start-by-tap test: ONE tap anywhere outside the bottom buttons leaves the title screen. Safari-browser viewports (toolbar visible) +
# home-screen mode, Chromium + WebKit. Usage: python3 start_test.py [BASE_URL]
import asyncio,sys
from playwright.async_api import async_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:18734/index.html'
ok=True
def chk(n,c,info=''):
    global ok;ok&=bool(c);print(('PASS ' if c else 'FAIL ')+n,'' if c else info)
CASES=[('SE-safari','iPhone SE',548,None),('13-safari','iPhone 13',664,None),('13-home','iPhone 13',844,(47,34))]
async def one(p,eng,name,dev,vh,ins):
    b=await (p.webkit.launch() if eng=='webkit' else p.chromium.launch(executable_path='/usr/bin/google-chrome'))
    d=dict(p.devices[dev]);d.pop('default_browser_type',None);d['viewport']={'width':d['viewport']['width'],'height':vh}
    c=await b.new_context(**d);m=await c.new_page();errs=[];m.on('pageerror',lambda x:errs.append(str(x)));m.on('console',lambda x:x.type=='error' and not any(k in x.text for k in ('Access-Control','CORS','Failed to load resource','access control')) and errs.append(x.text))
    if ins and eng=='chromium':
        cdp=await c.new_cdp_session(m);await cdp.send('Emulation.setSafeAreaInsetsOverride',{'insets':{'top':ins[0],'topMax':ins[0],'bottom':ins[1],'bottomMax':ins[1],'left':0,'leftMax':0,'right':0,'rightMax':0}})
    tag=f'[{eng} {name}]'
    spots=lambda L,cw,ch:[('TAP button',cw/2,L['by']),('top',cw*0.3,ch*0.12),('middle',cw*0.5,ch*0.45),('left edge',8,ch*0.6)]
    for label in ['TAP button','top','middle','left edge']:
        await m.goto(BASE+('&' if '?' in BASE else '?')+'debug=1');await m.wait_for_function("window.__NW&&__NW.state==='title'");await m.wait_for_timeout(900)
        g=await m.evaluate("(()=>{const r=document.getElementById('c').getBoundingClientRect(),L=__NW.titleLayout,s=r.width/360;return{l:r.left,t:r.top,s,by:L.by,w:r.width,h:r.height}})()")
        x,y=[(px,py) for (lb,px,py) in spots({'by':g['by']*g['s']},g['w'],g['h']) if lb==label][0]
        await m.touchscreen.tap(g['l']+x,g['t']+y);await m.wait_for_timeout(400)
        st=await m.evaluate("__NW.state");chk(f'{tag} one tap on {label} starts',st in('intro','play'),st)
        if label=='TAP button':
            await m.wait_for_timeout(2200);chk(f'{tag} intro runs into play',await m.evaluate("__NW.state")=='play')
            if eng=='chromium' and name=='13-safari':await m.screenshot(path='/workspace/notorious-weasel/screenshot-start-13-safari.png')
    # tapping a bottom button must NOT start
    await m.goto(BASE+('&' if '?' in BASE else '?')+'debug=1');await m.wait_for_function("window.__NW&&__NW.state==='title'");await m.wait_for_timeout(900)
    await m.evaluate("window.__NW_noNav=1");await m.tap('#modeBtn');await m.wait_for_timeout(400)
    chk(f'{tag} MODE button does not start',await m.evaluate("__NW.state")=='title')
    chk(f'{tag} no JS errors',not errs,errs[:3]);await b.close()
async def main():
    async with async_playwright() as p:
        for eng in ['chromium','webkit']:
            for n,dv,vh,ins in CASES:await one(p,eng,n,dv,vh,ins)
    print('ALL PASS' if ok else 'SOME FAIL')
asyncio.run(main())
