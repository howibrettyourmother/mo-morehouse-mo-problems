# Game <-> Tank Watch round trip: TANK WATCH (title) and SEE JOE'S TANK (end) open the tank page in the same tab; BACK TO THE GAME returns.
# usage: python3 nav_test.py [game index.html url] [tank page url]
import asyncio,sys,urllib.parse
from playwright.async_api import async_playwright
GAME=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:18734/index.html'
TANK=sys.argv[2] if len(sys.argv)>2 else 'http://127.0.0.1:18740/index.html'
fails=0
def chk(n,ok,info=''):
    global fails;print(('PASS ' if ok else 'FAIL ')+n,info if not ok else '');fails+=0 if ok else 1
async def one(p,b,dev,standalone):
    d=dict(p.devices[dev]);d.pop('default_browser_type',None);c=await b.new_context(**d);m=await c.new_page();errs=[]
    m.on('pageerror',lambda e:errs.append(str(e)))
    if standalone: await m.add_init_script("Object.defineProperty(navigator,'standalone',{get:()=>true});const _mm=matchMedia;window.matchMedia=q=>q.includes('standalone')?{matches:true,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}:_mm(q)")
    tag=f'[{dev}{" standalone" if standalone else ""}]'
    url=GAME+'?debug=1&lbboard=test'+('&tank='+urllib.parse.quote(TANK,safe='') if 'github.io' not in GAME else '')
    await m.goto(url);await m.wait_for_timeout(1200)
    r=await m.evaluate('(()=>{const r=document.getElementById("c").getBoundingClientRect();return[r.x+r.width/2,r.y+r.height/2]})()')
    await m.mouse.click(*r) if 'Desktop' in dev else await m.touchscreen.tap(*r)
    await m.wait_for_timeout(800)
    await (m.click('#tankBtn') if 'Desktop' in dev else m.tap('#tankBtn'))
    await m.wait_for_url('**/*from=game*',timeout=10000)
    chk(tag+' TANK WATCH opens the tank page in the same tab','tank' in m.url or TANK.split('?')[0] in m.url,m.url)
    await m.wait_for_selector('#backBtn')
    bb=await m.evaluate("(()=>{const r=document.getElementById('backBtn').getBoundingClientRect();return{h:r.height,top:r.top,t:document.getElementById('backBtn').innerText}})()")
    chk(tag+' BACK TO THE GAME button: visible, 44px+',bb['h']>=44 and 'BACK TO THE GAME' in bb['t'],str(bb))
    await m.wait_for_timeout(2500)
    await m.evaluate('scrollTo(0,document.body.scrollHeight/2)');await m.wait_for_timeout(300)
    bb2=await m.evaluate("document.getElementById('backBtn').getBoundingClientRect().top")
    chk(tag+' back button stays pinned while scrolling',-1<=bb2<=60,str(bb2))
    await (m.click('#backBtn') if 'Desktop' in dev else m.tap('#backBtn'))
    await m.wait_for_url(lambda u:'mo-morehouse' in u or GAME.split('?')[0] in u,timeout=10000);await m.wait_for_timeout(1200)
    chk(tag+' BACK TO THE GAME returns to the game',await m.evaluate("!!document.getElementById('c')"),m.url)
    chk(tag+' no page errors',not errs,str(errs))
    await c.close()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        for dev,sa in [('iPhone SE',False),('iPhone 13',True),('Desktop Chrome',False)]: await one(p,b,dev,sa)
        await b.close()
    print('ALL PASS' if not fails else f'{fails} FAIL')
asyncio.run(main())
