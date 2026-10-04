# Safe-area (iOS home-screen / standalone) layout test: emulates a 47px top inset (+34px home indicator) on iPhone 13 and SE sizes
# via Chrome's Emulation.setSafeAreaInsetsOverride, so the real env(safe-area-inset-*) path is exercised. Also checks the normal
# (no inset) layout is unchanged. Usage: python3 safearea_test.py [BASE_URL]
import asyncio,sys,json
from playwright.async_api import async_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:18734/index.html'
OUT='/workspace/notorious-weasel/'
ok=True
def chk(n,c,info=''):
    global ok;ok&=bool(c);print(('PASS ' if c else 'FAIL ')+n,info)
async def one(p,b,name,dev):
    ctx=await b.new_context(**dev);m=await ctx.new_page();errs=[]
    m.on('pageerror',lambda e: errs.append(str(e)))
    cdp=await ctx.new_cdp_session(m)
    await m.goto(BASE+'?debug=1&lbboard=test');await m.wait_for_timeout(800)
    base=await m.evaluate('({sa:__NW.safe,c:__NW.canvasRect(),vw:innerWidth,vh:innerHeight,mute:__NW.btnRect("muteBtn")})')
    # what the pre-safe-area layout produced (canvas fit to the full viewport, centered)
    W=360;H=round(min(max(W*base['vh']/base['vw'],580),780));S=min(base['vw']/W,base['vh']/H);ew,eh=round(W*S),round(H*S)
    chk(f'[{name}] normal Safari: zero insets, layout unchanged',base['sa']=={'t':0,'r':0,'b':0,'l':0} and abs(base['c']['w']-ew)<=1 and abs(base['c']['h']-eh)<=1 and abs(base['c']['y']-(base['vh']-eh)/2)<=1,json.dumps(base))
    how='cdp'
    try: await cdp.send('Emulation.setSafeAreaInsetsOverride',{'insets':{'top':47,'topMax':47,'bottom':34,'bottomMax':34,'left':0,'leftMax':0,'right':0,'rightMax':0}})
    except Exception as e:
        how='css-var';await m.evaluate('document.documentElement.style.cssText+=";--sa-t:47px;--sa-b:34px"')
    await m.evaluate('__NW.relayout()');await m.wait_for_timeout(300)
    r=await m.evaluate('({sa:__NW.safe,c:__NW.canvasRect(),vw:innerWidth,vh:innerHeight,mute:__NW.btnRect("muteBtn"),music:__NW.btnRect("musicBtn")})')
    c=r['c']
    chk(f'[{name}] 47px inset read via env() probe ({how})',r['sa']['t']==47 and r['sa']['b']==34,json.dumps(r['sa']))
    chk(f'[{name}] canvas/HUD starts below the status bar + above home indicator',c['y']>=47-0.5 and c['y']+c['h']<=r['vh']-34+0.5 and c['x']>=0 and c['x']+c['w']<=r['vw']+0.5,json.dumps(c))
    chk(f'[{name}] music/mute buttons fully visible below the inset',r['mute']['y']>=47 and r['music']['y']>=47 and r['mute']['x']+r['mute']['w']<=r['vw'],json.dumps([r['mute'],r['music']]))
    # tap the real mute button where it is drawn now -> it toggles (hit area moved with it)
    mu0=await m.evaluate('__NW.audio.muted');x=r['mute']['x']+r['mute']['w']/2;y=r['mute']['y']+r['mute']['h']/2
    await m.touchscreen.tap(x,y);await m.wait_for_timeout(200);mu1=await m.evaluate('__NW.audio.muted')
    await m.touchscreen.tap(x,y);await m.wait_for_timeout(200);mu2=await m.evaluate('__NW.audio.muted')
    chk(f'[{name}] mute button hit area works at its offset position',mu1!=mu0 and mu2==mu0,str((mu0,mu1,mu2)))
    if name=='iphone13': await m.screenshot(path=OUT+'screenshot-safearea-title.png')
    # start a run: HUD rows (score, MO PROBLEMS, seasons) inside the safe box; banners below the HUD
    await m.evaluate('__NW.startGame?__NW.startGame():0')
    if not await m.evaluate('__NW.state==="intro"||__NW.state==="play"'):
        await m.touchscreen.tap(c['x']+c['w']/2,c['y']+c['h']*0.8);await m.wait_for_timeout(300)
    await m.wait_for_timeout(2600)
    g=await m.evaluate('({st:__NW.state,hudTop:__NW.clientOf(0,8).y,hudBot:__NW.clientOf(0,58).y,score:__NW.clientOf(8,14).y,bn:__NW.clientOf(0,__NW.H*0.56-22).y,bn2:__NW.clientOf(0,__NW.H*0.62-22).y,cap:__NW.clientOf(0,88-12).y})')
    chk(f'[{name}] in play: score + MO PROBLEMS rows sit below the status bar',g['st'] in ('intro','play') and g['hudTop']>=47 and g['score']>=47+6,json.dumps(g))
    chk(f'[{name}] track/power banners + captions sit below the HUD',g['bn']>g['hudBot'] and g['bn2']>g['hudBot'] and g['cap']>=g['hudBot'],json.dumps(g))
    # drag input still maps correctly with the offset
    await m.evaluate('__NW.movePlayer(180,__NW.player.y)');t=await m.evaluate('__NW.clientOf(80,__NW.player.y)')
    await m.touchscreen.tap(t['x'],t['y']);await m.wait_for_timeout(100)
    if name=='iphone13' or name=='iphoneSE': await m.screenshot(path=OUT+f'screenshot-safearea-{name}.png')
    chk(f'[{name}] no page errors',not errs,str(errs[:3]))
    await ctx.close()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        for name,d in [('iphone13','iPhone 13'),('iphoneSE','iPhone SE')]:
            dev=dict(p.devices[d]);dev.pop('default_browser_type',None);await one(p,b,name,dev)
        await b.close()
    print('ALL PASS' if ok else 'SOME FAIL');sys.exit(0 if ok else 1)
asyncio.run(main())
