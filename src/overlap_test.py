# Text vs button overlap test: every canvas text box (recorded by txt()/fit() in debug builds) on the TITLE and END screens must not
# intersect any visible HTML button, and must sit inside the canvas. Runs on iPhone SE, iPhone 13 and iPhone 13 with a home-screen
# inset (47px top / 34px bottom via Emulation.setSafeAreaInsetsOverride). Usage: python3 overlap_test.py [BASE_URL]
import asyncio,sys,json
from playwright.async_api import async_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:18734/index.html'
OUT='/workspace/notorious-weasel/'
ok=True
def chk(n,c,info=''):
    global ok;ok&=bool(c);print(('PASS ' if c else 'FAIL ')+n,'' if c else info)
BTN=['modeBtn','boardBtn','tankBtn','muteBtn','musicBtn','shareBtn','againBtn','tankEndBtn','recapEndBtn']
SNAP='''(()=>{const c=document.getElementById('c').getBoundingClientRect();
  const btn=%s.map(id=>{const e=document.getElementById(id);if(!e||getComputedStyle(e).display==='none'||!e.offsetWidth)return null;const r=e.getBoundingClientRect();return{id,l:r.left,r:r.right,t:r.top,b:r.bottom}}).filter(Boolean);
  const tb=__NW.textBoxes.map(b=>({s:b.s,l:b.l+c.left,r:b.r+c.left,t:b.t+c.top,b:b.b+c.top}));
  return{c:{l:c.left,r:c.right,t:c.top,b:c.bottom},btn,tb,st:__NW.state}})()'''%json.dumps(BTN)
def hits(sn,tol=0.5):
    out=[]
    for t in sn['tb']:
        for b in sn['btn']:
            if t['l']<b['r']-tol and t['r']>b['l']+tol and t['t']<b['b']-tol and t['b']>b['t']+tol: out.append((t['s'][:40],b['id']))
    return out
def outside(sn,tol=1):
    c=sn['c'];return [t['s'][:40] for t in sn['tb'] if t['t']<c['t']-tol or t['b']>c['b']+tol]
async def sample(m,n=6,gap=700):
    H,O,L=set(),set(),[]
    for i in range(n):
        sn=await m.evaluate(SNAP);H|=set(hits(sn));O|=set(outside(sn));L.append(sn);await m.wait_for_timeout(gap)
    return H,O,L
async def one(p,b,name,devname,inset):
    d=dict(p.devices[devname]);d.pop('default_browser_type',None);ctx=await b.new_context(**d);m=await ctx.new_page();errs=[]
    m.on('pageerror',lambda e: errs.append(str(e)))
    await m.add_init_script("try{localStorage.setItem('nw_hi','320335')}catch(e){}")
    await m.goto(BASE+'?debug=1&lbboard=test');await m.wait_for_timeout(900)
    if inset:
        cdp=await ctx.new_cdp_session(m)
        try: await cdp.send('Emulation.setSafeAreaInsetsOverride',{'insets':{'top':47,'topMax':47,'bottom':34,'bottomMax':34,'left':0,'leftMax':0,'right':0,'rightMax':0}})
        except Exception: await m.evaluate('document.documentElement.style.cssText+=";--sa-t:47px;--sa-b:34px"')
        await m.evaluate('__NW.relayout()');await m.wait_for_timeout(300)
    c=await m.evaluate("(()=>{const r=document.getElementById('c').getBoundingClientRect();return[r.x+r.width/2,r.y+r.height/2]})()")
    await m.touchscreen.tap(*c);await m.wait_for_timeout(2500)   # unlock audio; league board loads
    H,O,L=await sample(m)
    lg=[t for t in L[-1]['tb'] if t['s'].startswith(('LEAGUE #1','YOUR BEST','BE THE FIRST'))]
    chk(f'[{name}] title: LEAGUE #1 / YOUR BEST line drawn',bool(lg),str([t['s'] for t in L[-1]['tb']][-6:]))
    chk(f'[{name}] title: no text under any button',not H,str(sorted(H)))
    chk(f'[{name}] title: all text inside the canvas (safe area)',not O,str(sorted(O)))
    if lg:
        bt=[x for x in L[-1]['btn'] if x['id'] in ('modeBtn','boardBtn','tankBtn')]
        chk(f'[{name}] title: LEAGUE #1 row sits between TAP and the button row',all(lg[0]['b']<=x['t'] for x in bt),json.dumps([lg[0],bt]))
    await m.screenshot(path=OUT+f'screenshot-overlap-title-{name}.png')
    # end screen
    await m.touchscreen.tap(*c);await m.wait_for_timeout(300);await m.touchscreen.tap(c[0],c[1]+80);await m.wait_for_timeout(500)
    await m.evaluate('__NW.lives=1;__NW.noInv();__NW.shot("int",__NW.player.x,__NW.player.y-30)')
    for i in range(60):
        st=await m.evaluate('__NW.state')
        if st=='end': break
        await m.wait_for_timeout(250)
    await m.wait_for_timeout(1800)
    if await m.is_visible('#hsSkip'): await m.tap('#hsSkip');await m.wait_for_timeout(900)
    H,O,L=await sample(m,5,600)
    vis=[x['id'] for x in L[-1]['btn']]
    chk(f'[{name}] end: share / again / tank buttons visible',L[-1]['st']=='end' and {'shareBtn','againBtn','tankEndBtn'}<=set(vis),str((L[-1]['st'],vis)))
    chk(f'[{name}] end: no text under any button',not H,str(sorted(H)))
    chk(f'[{name}] end: all text inside the canvas (safe area)',not O,str(sorted(O)))
    await m.screenshot(path=OUT+f'screenshot-overlap-end-{name}.png')
    chk(f'[{name}] no page errors',not errs,str(errs))
    await ctx.close()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        ONLY=sys.argv[2].split(',') if len(sys.argv)>2 else None
        for name,dev,ins in [('iphoneSE','iPhone SE',False),('iphone13','iPhone 13',False),('iphone13-homescreen','iPhone 13',True),('iphoneSE-homescreen','iPhone SE',True)]:
            if ONLY and name not in ONLY: continue
            await one(p,b,name,dev,ins)
        await b.close()
    print('ALL PASS' if ok else 'SOME FAIL')
asyncio.run(main())
