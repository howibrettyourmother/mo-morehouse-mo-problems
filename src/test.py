import re
import asyncio,sys,json
from playwright.async_api import async_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:18734/index.html'
import random,urllib.request
TOPIC='mmp-lb-test-'+''.join(random.choice('abcdefghjkmnpqrstuvwxyz23456789') for _ in range(10))
OUT='/workspace/notorious-weasel/'
LIVE=len(sys.argv)>1
ok=True
def chk(n,c,info=''):
    global ok;ok&=bool(c);print(('PASS ' if c else 'FAIL ')+n,info)
async def run(p,b,name,dev,touch,shots):
    errs=[]
    ctx=await b.new_context(**dev,permissions=['clipboard-read','clipboard-write'])
    m=await ctx.new_page()
    m.on('console',lambda x: errs.append(f'{x.type}: {x.text}') if x.type in('error','warning') else None)
    m.on('pageerror',lambda e: errs.append(f'pageerror {e}'))
    await m.goto(BASE);await m.wait_for_timeout(700)
    chk(f'[{name}] public build has no __NW',await m.evaluate('typeof window.__NW')=='undefined')
    await m.goto(BASE+'?debug=1&lbtopic='+TOPIC);await m.wait_for_timeout(900)
    tap=(lambda x,y: m.touchscreen.tap(x,y)) if touch else (lambda x,y: m.mouse.click(x,y))
    r=await m.evaluate('(()=>{const r=document.getElementById("c").getBoundingClientRect();return[r.x,r.y,r.width,r.height]})()')
    vp=await m.evaluate('[innerWidth,innerHeight]')
    chk(f'[{name}] canvas fits viewport',r[0]>=0 and r[1]>=0 and r[0]+r[2]<=vp[0]+1 and r[1]+r[3]<=vp[1]+1,f'{r} vp {vp}')
    cx,cy=r[0]+r[2]/2,r[1]+r[3]*0.5
    await tap(cx,cy);await m.wait_for_timeout(1500)
    a=await m.evaluate('({u:__NW.audio.unlocked,run:__NW.audio.running,clips:__NW.audio.clipCount,st:__NW.state,theme:__NW.audio.theme})')
    chk(f'[{name}] first tap unlocks audio, stays on title',a['u'] and a['run'] and a['st']=='title',str(a))
    chk(f'[{name}] voice clips lazy-loaded + decoded',a['clips']>=240,str(a["clips"]))
    chk(f'[{name}] title shows MODE + LEAGUE LEADERBOARD buttons',await m.is_visible('#modeBtn') and await m.is_visible('#boardBtn') and 'LEAGUE LEADERBOARD' in await m.text_content('#boardBtn'))
    await (m.tap('#modeBtn') if touch else m.click('#modeBtn'));chk(f'[{name}] difficulty toggle -> rookie',await m.evaluate('__NW.mode')=='rookie')
    await (m.tap('#boardBtn') if touch else m.click('#boardBtn'));await m.wait_for_timeout(1500);chk(f'[{name}] league board opens',await m.evaluate('__NW.boardOpen') and await m.evaluate('__NW.league.ok'),str(await m.evaluate('__NW.league')))
    await tap(cx,cy);await m.wait_for_timeout(300);chk(f'[{name}] board closes on tap (stays on title)',not await m.evaluate('__NW.boardOpen') and await m.evaluate('__NW.state')=='title')
    chk(f'[{name}] title boom-bap theme',a['theme']=='title',a['theme'])
    if shots: await m.screenshot(path=OUT+'screenshot-title.png')
    await tap(cx,cy);await m.wait_for_timeout(250);chk(f'[{name}] rookie run starts with 5 seasons',await m.evaluate('__NW.lives')==5)
    await tap(cx,cy+80);await m.wait_for_timeout(100);chk(f'[{name}] tap skips the intro',await m.evaluate('__NW.state')=='play')
    await m.evaluate('__NW.setMode("y5")')
    await m.wait_for_timeout(2600)
    e=await m.evaluate('__NW.enemies()');chk(f'[{name}] track 1 formation spawned',len(e)>=8,str(len(e)))
    chk(f'[{name}] auto-fire footballs',await m.evaluate('__NW.balls')>0)
    # drag to move (relative)
    p0=await m.evaluate('__NW.player');c0=await m.evaluate(f'__NW.clientOf({p0["x"]},{p0["y"]+40})')
    if touch:
        cdp=await ctx.new_cdp_session(m)
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':c0['x'],'y':c0['y']}]})
        for i in range(1,11): await cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':c0['x']-i*9,'y':c0['y']}]});await m.wait_for_timeout(16)
        await cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    else:
        await m.mouse.move(c0['x'],c0['y']);await m.mouse.down()
        for i in range(1,11): await m.mouse.move(c0['x']-i*9,c0['y']);await m.wait_for_timeout(16)
        await m.mouse.up()
    p1=await m.evaluate('__NW.player');chk(f'[{name}] drag moves weasel left',p1['x']<p0['x']-40,f"{p0['x']:.0f}->{p1['x']:.0f}")
    if shots:
        await m.evaluate('__NW.clearAll();__NW.lives=9;__NW.track(2)');await m.wait_for_timeout(3300)
        await m.evaluate('__NW.lives=3')
        await m.evaluate('__NW.star("rapid",__NW.player.x+50,__NW.player.y-150);__NW.lives=3');await m.wait_for_timeout(300)
        await m.screenshot(path=OUT+'screenshot-gameplay.png')
    # controlled scene
    await m.evaluate('__NW.clearAll();__NW.hold();__NW.movePlayer(180,600)')
    s0=await m.evaluate('__NW.score')
    await m.evaluate('__NW.spawn("caleb",180,420);__NW.freezeEnemies()');await m.wait_for_timeout(1500)
    s=await m.evaluate('({s:__NW.score,p:__NW.problems,pc:__NW.potCount,tp:__NW.tp,st:__NW.audio.stats()})')
    chk(f'[{name}] football kills Caleb -> porta-potty + TP confetti',s['pc']==1 and s['s']>s0 and s['p']>=1,str({k:s[k] for k in ['s','p','pc','tp']}))
    chk(f'[{name}] voice lines playing',s['st'].get('n',0)>=1,json.dumps(s['st']))
    for i in range(30):
        st=await m.evaluate('__NW.audio.stats()')
        if any(v for k,v in st.items() if isinstance(v,int) and v and k.startswith(('a_potty','cal','nl','nails'))): break
        await m.wait_for_timeout(200)
    chk(f'[{name}] Caleb kill -> potty/Caleb voice',any(v for k,v in st.items() if isinstance(v,int) and v and k.startswith(('a_potty','cal','nl','nails'))),json.dumps(st))
    # SHOEYS: penalty on life lost + rare LIQUID COURAGE SHOEY power-up
    await m.evaluate('__NW.lives=4;__NW.noInv()');sh0=await m.evaluate('__NW.shoeys')
    for i in range(15):
        await m.evaluate('__NW.noInv();__NW.shot("int",__NW.player.x,__NW.player.y-30)');await m.wait_for_timeout(250)
        sh=await m.evaluate('({s:__NW.shoeys,l:__NW.lives})')
        if sh['l']<4: break;chk(f'[{name}] losing a life adds a shoey owed',sh['s']==sh0+1 and sh['l']==3,str(sh))
    await m.evaluate('__NW.shoeyGo()');await m.wait_for_timeout(500)
    if shots: await m.screenshot(path=OUT+'screenshot-shoey.png')
    await m.wait_for_timeout(1300)
    if shots: await m.screenshot(path=OUT+'screenshot-shoey-chug.png')
    fx=await m.evaluate('__NW.shoeyFx')
    for i in range(20):
        st=await m.evaluate('__NW.audio.stats()')
        if any(v for k,v in st.items() if isinstance(v,int) and v and k.startswith(('sho','shoey'))): break
        await m.wait_for_timeout(200)
    chk(f'[{name}] SHOEY PENALTY cartoon plays (pour -> chug -> gag) with shoey voice',fx is not None and fx>1.2 and any(v for k,v in st.items() if isinstance(v,int) and v and k.startswith(('sho','shoey'))),str(fx))
    for i in range(20):
        if await m.evaluate('__NW.shoeyFx') is None: break
        await m.wait_for_timeout(200)
    chk(f'[{name}] shoey cartoon clears',await m.evaluate('__NW.shoeyFx') is None)
    l0=await m.evaluate('__NW.lives');await m.evaluate('__NW.star("shoey",__NW.player.x,__NW.player.y-6)');await m.wait_for_timeout(600)
    pu=await m.evaluate('({p:__NW.player,l:__NW.lives})')
    chk(f'[{name}] LIQUID COURAGE SHOEY: beer goggles + triple shots + 1 life',pu['p']['shoeyT']>6 and pu['p']['spreadT']>6 and pu['l']==min(5,l0+1),str(pu))
    await m.wait_for_timeout(900)
    if shots: await m.screenshot(path=OUT+'screenshot-shoeyup.png')
    await m.evaluate('__NW.noPow()')
    # Puka Nacua: the one that got away (ghost card, out of reach)
    await m.evaluate('__NW.pukaGo()')
    for i in range(30):
        await m.wait_for_timeout(200);pk=await m.evaluate('({p:__NW.puka,cap:__NW.caption,st:__NW.audio.stats().puka1||0})')
        if pk['st']>=1 and 'Puka' in (pk['cap'] or ''): break
    chk(f'[{name}] Puka Nacua (DROPPED) ghost card + voice/caption',pk['p'] and pk['st']>=1 and 'Puka' in (pk['cap'] or ''),str(pk))
    if shots: await m.screenshot(path=OUT+'screenshot-puka.png')
    # mini-boss: THE TRADE DEADLINE spits DECLINED fax pages
    await m.evaluate('__NW.lives=99;__NW.miniGo()');await m.wait_for_timeout(2600)
    mi=await m.evaluate('({m:__NW.mini,fax:__NW.enemies().filter(e=>e.k==="fax").length})')
    chk(f'[{name}] Trade Deadline mini-boss spits fax pages + takes hits',mi['m'] and mi['m']['hp']<mi['m']['max'] and mi['fax']>=1,str(mi))
    if shots: await m.screenshot(path=OUT+'screenshot-minboss.png')
    await m.evaluate('__NW.setMiniHp(3)')
    for i in range(30):
        await m.evaluate('__NW.mini&&__NW.movePlayer(__NW.mini.x,__NW.player.y)');await m.wait_for_timeout(200)
        if await m.evaluate('!__NW.mini'): break
    chk(f'[{name}] mini-boss swatted (or deadline passed)',await m.evaluate('!__NW.mini'),str(await m.evaluate('[__NW.mini,__NW.miniBeat]')))
    await m.evaluate('__NW.clearAll();__NW.lives=3;__NW.movePlayer(180,600)');await m.wait_for_timeout(1500)
    # star catch (shoot passes through)
    await m.evaluate('__NW.star("spread",__NW.player.x,__NW.player.y-30)');await m.wait_for_timeout(900)
    pl=await m.evaluate('__NW.player');chk(f'[{name}] caught gold Brett star -> triple threat',pl['spreadT']>0,str(pl))
    # enemy INT hurts
    lv=await m.evaluate('__NW.lives');await m.evaluate('__NW.shot("int",__NW.player.x,__NW.player.y-40)');await m.wait_for_timeout(500)
    chk(f'[{name}] Darnold INT costs a life',await m.evaluate('__NW.lives')==lv-1)
    # SHIT COMBO finisher
    await m.wait_for_timeout(2300)
    for i,k in enumerate(['mhj','pitts','darnold','trade','pick4','year4']): await m.evaluate(f'__NW.spawn("{k}",{40+i*56},{140+(i%2)*50})')
    await m.evaluate('__NW.freezeEnemies();__NW.balloonGo(260)');await m.wait_for_timeout(500)
    if shots: await m.screenshot(path=OUT+'screenshot-balloon.png')
    await m.evaluate('__NW.meter=99.5;__NW.spawn("pick4",180,400);__NW.freezeEnemies()');await m.wait_for_timeout(700)
    f=await m.evaluate('({n:__NW.firesales,e:__NW.enemies().length,b:__NW.balloon})')
    chk(f'[{name}] full SHIT COMBO -> FIRE SALE clears screen',f['n']==1 and f['e']==0 and f['b'] is None,str(f))
    await m.wait_for_timeout(1500)
    # boss
    await m.evaluate('__NW.lives=99;__NW.bossGo()');rain=0
    for i in range(14):
        await m.wait_for_timeout(300);rain=max(rain,await m.evaluate('__NW.rain'))
        if shots and i==9: await m.screenshot(path=OUT+'screenshot-boss.png')
    st=await m.evaluate('__NW.audio.stats()');chk(f'[{name}] fire sale -> "What a little bitch!" heckle',st.get('bitch',0)>=1,json.dumps(st))
    bh=await m.evaluate('__NW.boss');chk(f'[{name}] Weasel Dynasty boss takes football hits',bh and bh['hp']<bh['max'],str(bh))
    chk(f'[{name}] boss rains Mahomes/Lamb/Lamar/CMC/JSN cards',rain>=1,str(rain))
    await m.evaluate('__NW.setBossHp(Math.round(__NW.boss.max*0.6))');await m.wait_for_timeout(500)
    f=await m.evaluate('({ph:__NW.bossPhase,ta:__NW.bossTaunt,fm:__NW.finMode,ft:__NW.finT})')
    chk(f'[{name}] boss phase -> weasel EAT SHIT slow-mo taunt (invulnerable)',f['ph']==1 and f['ta']>0 and f['fm']=='weasel' and f['ft']>0,str(f))
    if shots: await m.screenshot(path=OUT+'screenshot-eatshit.png')
    await m.wait_for_timeout(4300)
    for i in range(40):
        w=await m.evaluate('({n:__NW.waahN,a:__NW.amb,st:__NW.audio.stats().waah||0})')
        if w['n']>=1 and w['a']: break
        await m.wait_for_timeout(200)
    chk(f'[{name}] boss phase -> WAAAHMBULANCE drives by (siren only, no voice line)',w['n']>=1 and w['st']==0 and w['a'],str(w))
    if shots and w['a']: await m.screenshot(path=OUT+'screenshot-waahmbulance.png')
    await m.evaluate('__NW.lives=99;__NW.setBossHp(1)')
    for i in range(26):
        await m.evaluate('__NW.boss&&!__NW.boss.dead&&__NW.movePlayer(__NW.boss.x,__NW.player.y)');await m.wait_for_timeout(200)
    bh=await m.evaluate('__NW.boss');chk(f'[{name}] boss beatable (Joe wins one, Weasels still the best)',bh is None or bh['dead']==1,str(bh))
    await m.wait_for_timeout(3800)
    chk(f'[{name}] remix loop starts after boss',await m.evaluate('__NW.loop')==1 and await m.evaluate('__NW.trackI')==0)
    z=await m.evaluate('({sy:scrollY,sc:visualViewport.scale,ta:getComputedStyle(document.body).touchAction})')
    chk(f'[{name}] no scroll/zoom',z['sy']==0 and z['sc']==1 and z['ta']=='none',str(z))
    st=await m.evaluate('__NW.audio.stats()');chk(f'[{name}] voice clips played',st.get('clip',0)+st.get('sting',0)>=4,json.dumps(st))
    q=await m.evaluate('''(async()=>{const A=__NW.audio;await new Promise(r=>{const c=()=>{if(A.idle)r();else setTimeout(c,25)};c()});
      const n0=A.stats().n;A.heckle('ambient');A.heckle('HURT');A.sting('a_t2',{quiet:true});A.sting('wilson',{quiet:true});A.heckle('ambient');A.sting('bitch',{quiet:true});
      const q1=A.queueLen;await new Promise(r=>setTimeout(r,300));const n1=A.stats().n,cur=A.current&&A.current.t,cap=__NW.caption;
      let over=0,prev=null,seen=[];for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,100));const c=A.current;if(c&&c.k!==prev){seen.push(c.k);prev=c.k}}
      return{started:n1-n0,q1,cur,cap,seen,maxQ:A.stats().maxQ,dropped:A.stats().dropped}})()''')
    chk(f'[{name}] voice queue: only one line starts at once, rest queued/dropped',q['started']==1 and q['q1']<=3 and q['cur'] is not None,str(q))
    chk(f'[{name}] caption matches the line actually playing',q['cap']==q['cur'],str((q['cap'],q['cur'])))
    chk(f'[{name}] high-priority queued lines play in order (Brett lines first)',len(q['seen'])>=3 and set(q['seen'][1:3])<={'wilson','bitch','nohouse','wilson2','boss8','bestteam','puka1','puka2','puka3','puka4','puka5'} and 'a_t2' not in q['seen'][1:3],str(q['seen']))
    ar=await m.evaluate('''(()=>{const A=__NW.audio,res={};for(const ev of ['ambient','CALEB','NAILS','BOSSHIT','HURT','PITTS','INT','end']){const N=A.poolSize(ev),seq=A.simPicks(ev,N*3);
        let bagRep=0,winRep=0,nulls=0;for(let b=0;b+N<=seq.length;b+=N){const s=seq.slice(b,b+N).filter(x=>x);if(new Set(s).size!==s.length)bagRep++}
        for(let i=0;i<seq.length;i++){if(!seq[i]){nulls++;continue}const w=seq.slice(Math.max(0,i-15),i);if(w.includes(seq[i]))winRep++}
        res[ev]={N,bagRep,winRep,nulls,first:seq.slice(0,N).filter(x=>x).length}}return res})()''')
    chk(f'[{name}] anti-repeat: shuffle-bag (no repeat until category exhausted) + no repeat within last 15',all(v['bagRep']==0 and v['winRep']==0 and v['first']==v['N'] for v in ar.values()),json.dumps(ar))
    await m.evaluate('__NW.lives=1;__NW.noInv();__NW.shot("int",__NW.player.x,__NW.player.y-30)');await m.wait_for_timeout(600)
    f=await m.evaluate('({fm:__NW.finMode,ft:__NW.finT,st:__NW.state,l:__NW.lives})')
    chk(f'[{name}] game over -> weasel EAT SHIT taunt',f['fm']=='weasel' and f['ft']>0 and f['l']==0,str(f))
    await m.wait_for_timeout(3600)
    chk(f'[{name}] end screen + initials prompt',await m.evaluate('__NW.state')=='end' and await m.evaluate('__NW.hsEntering'))
    chk(f'[{name}] name input allows 16 chars',await m.get_attribute('#hsIn','maxlength')=='16')
    await m.fill('#hsIn','Joe Morehouse 99!xyz');v=await m.input_value('#hsIn');chk(f'[{name}] name trimmed to 16',v=='Joe Morehouse 99',v)
    await m.click('#hsOk');await m.wait_for_timeout(1400)
    lb=await m.evaluate('__NW.lb()');chk(f'[{name}] local Hall of Shame saved with full name',len(lb)>=1 and any(e['i']=='Joe Morehouse 99' for e in lb),str(lb[:2]))
    chk(f'[{name}] last name remembered',await m.evaluate('localStorage.getItem("nw_name")')=='Joe Morehouse 99')
    lab=await m.text_content('#shareBtn');chk(f'[{name}] share button label','I GAVE MOREHOUSE' in lab and 'MORE PROBLEMS' in lab,lab)
    await m.evaluate('navigator.share=undefined')
    if touch: await m.tap('#shareBtn')
    else: await m.click('#shareBtn')
    await m.wait_for_timeout(400)
    ls=await m.evaluate('__NW.lastShare');chk(f'[{name}] share works (copy fallback)','I gave Morehouse' in ls and 'more problems' in ls and 'mo-morehouse-mo-problems' in ls and 'champ' not in ls.lower(),ls)
    chk(f'[{name}] share text says how many shoeys Joe owes',re.search(r'Joe owes \d+ shoeys?\.',ls) is not None,ls)
    await m.wait_for_timeout(2400)
    st=await m.evaluate('__NW.audio.stats()');chk(f'[{name}] game over -> "Morehouse? More like NO house." voice',st.get('nohouse',0)>=1,json.dumps(st))
    chk(f'[{name}] ending theme',await m.evaluate('__NW.audio.theme')=='ending')
    if touch: await m.tap('#againBtn')
    else: await m.click('#againBtn')
    await m.wait_for_function('__NW.state==="play"',timeout=5000);chk(f'[{name}] play again',True)
    # natural play 14s
    await m.wait_for_timeout(14000)
    s=await m.evaluate('({p:__NW.problems,st:__NW.state,l:__NW.lives,t:__NW.trackI,f:__NW.frames})')
    chk(f'[{name}] natural play: auto-fire drops problems',s['p']>=3,str(s))
    # league submission of a legit run -> ntfy relay
    await m.evaluate('__NW.end()');await m.wait_for_timeout(1800)
    chk(f'[{name}] name prefilled with last name',await m.input_value('#hsIn')=='Joe Morehouse 99')
    hi=await m.evaluate('({t:__NW.hsInfo,r:__NW.hsPanelRect,s:__NW.score})')
    chk(f'[{name}] post popup shows score, tracks, mode, would-be rank, PB status (fits on screen)',f"YOUR SCORE: {hi['s']:,}" in hi['t'] and 'TRACKS SURVIVED' in hi['t'] and 'MODE' in hi['t'] and re.search(r"THAT'S #\d+",hi['t']) and ('PERSONAL BEST' in hi['t'] or 'FIRST SCORE' in hi['t']) and hi['r']['top']>=0 and hi['r']['bottom']<=hi['r']['h'],str(hi))
    if shots or name=='iphoneSE': await m.screenshot(path=OUT+f'screenshot-post-{name}.png')
    await m.fill('#hsIn','Test '+name[:10]);await m.click('#hsOk');await m.wait_for_timeout(2500)
    lg=await m.evaluate('__NW.league');chk(f'[{name}] league score posted + own rank highlighted',lg['sent']>=1 and lg['rank']>=1 and lg['last'],str(lg))
    raw=urllib.request.urlopen(f'https://ntfy.sh/{TOPIC}/json?poll=1&since=1h',timeout=20).read().decode()
    chk(f'[{name}] score landed on the relay',lg['last'] in raw,raw[-200:])
    if shots: await m.screenshot(path=OUT+'screenshot-end.png')
    if shots:
        await m.evaluate('__NW.openBoard()');await m.wait_for_timeout(700);await m.screenshot(path=OUT+'screenshot-leaderboard.png');await m.evaluate('__NW.closeBoard()')
    ns=await m.evaluate('__NW.audio.nodeStats()');chk(f'[{name}] audio: pre-rendered SFX + music loops, sources capped',ns['cached']>=25 and len(ns['songs'])==4 and ns['peak']<=8 and ns['live']==0,str(ns))
    chk(f'[{name}] no console errors/warnings',not errs,str(errs[:5]))
    # personal-best fallback: reload -> device re-posts its best (same id), board shows it once per device+name
    await m.reload();await m.wait_for_timeout(4500)
    rp=await m.evaluate('({r:__NW.lbReposts,best:JSON.parse(localStorage.getItem("nw_best")||"{}"),list:__NW.lbList})')
    raw=urllib.request.urlopen(f'https://ntfy.sh/{TOPIC}/json?poll=1&since=1h',timeout=20).read().decode()
    mine=[e for e in rp['list'] if e['id']==lg['last']]
    chk(f'[{name}] personal best remembered + re-posted on load (deduped on the board)',rp['r']>=1 and any(v['id']==lg['last'] for v in rp['best'].values()) and raw.count(lg['last'])>=2 and len(mine)==1,str((rp['r'],raw.count(lg['last']),len(mine))))
    await ctx.close()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--autoplay-policy=no-user-gesture-required'])
        dev=dict(p.devices['iPhone 13']);dev.pop('default_browser_type',None)
        await run(p,b,'iphone13',dev,True,True)
        if not LIVE:
            d2=dict(p.devices['iPhone SE']);d2.pop('default_browser_type',None)
            await run(p,b,'iphoneSE',d2,True,False)
            await run(p,b,'desktop',{'viewport':{'width':1280,'height':800}},False,False)
        await b.close()
    print('ALL PASS' if ok else 'SOME FAIL')
asyncio.run(main())
