# Long high-combo stress run under CPU throttling: audio node count must stay flat/capped, no dropouts.
import asyncio,sys,json
from playwright.async_api import async_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:18734/index.html'
RATE=float(sys.argv[2]) if len(sys.argv)>2 else 5
SECS=int(sys.argv[3]) if len(sys.argv)>3 else 90
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--autoplay-policy=no-user-gesture-required'])
        dev=dict(p.devices['iPhone 13']);dev.pop('default_browser_type',None)
        ctx=await b.new_context(**dev);m=await ctx.new_page();errs=[]
        m.on('console',lambda x: errs.append(f'{x.type}: {x.text}') if x.type in('error','warning') else None)
        m.on('pageerror',lambda e: errs.append(f'pageerror {e}'))
        cdp=await ctx.new_cdp_session(m);W={'ctx':None,'nodes':0,'maxnodes':0,'created':0}
        def oc(e):
            if W['ctx'] is None and e['context'].get('contextType')=='realtime': W['ctx']=e['context']['contextId']
        def nc(e):
            if e['node']['contextId']==W['ctx']: W['nodes']+=1;W['created']+=1;W['maxnodes']=max(W['maxnodes'],W['nodes'])
        def nd(e):
            if e['contextId']==W['ctx']: W['nodes']-=1
        cdp.on('WebAudio.contextCreated',oc);cdp.on('WebAudio.audioNodeCreated',nc);cdp.on('WebAudio.audioNodeWillBeDestroyed',nd)
        await cdp.send('WebAudio.enable')
        await m.goto(BASE+'?debug=1&lbboard=test&lbapi=http%3A%2F%2F127.0.0.1%3A8799');await m.wait_for_timeout(1000)
        await m.touchscreen.tap(195,330);await m.wait_for_timeout(5000)   # unlock + let pre-render finish
        await cdp.send('Emulation.setCPUThrottlingRate',{'rate':RATE})
        await m.touchscreen.tap(195,330);await m.wait_for_timeout(3000)
        await m.evaluate('''window.__ps0=(()=>{const c=__NW.audio.ctx();const s=c&&c.playoutStats;return s?{fd:s.fallbackFramesDuration,fe:s.fallbackFramesEvents,tf:s.totalFramesDuration}:null})()''')
        samples=[];t=0
        while t<SECS:
            await m.evaluate('''(()=>{const N=__NW;N.lives=99;N.noInv&&0;const ks=["caleb","mhj","pitts","darnold","trade","pick4","year4"];
              for(let i=0;i<8;i++)N.spawn(ks[i%7],30+Math.random()*300,90+Math.random()*220);
              if(Math.random()<0.5)N.meter=99.5;if(Math.random()<0.15&&!N.balloon)N.balloonGo(120);
              for(let i=0;i<6;i++)N.audio.SFX.airhorn(),N.audio.SFX.splat(true),N.audio.SFX.cheer(1),N.audio.SFX.bossHit(),N.audio.SFX.throwF();
              if(Math.random()<0.3)N.audio.heckle("ambient");})()''')
            await m.wait_for_timeout(1000);t+=1
            if t%5==0:
                ns=await m.evaluate('({ns:__NW.audio.nodeStats(),lp:__NW.lowPower,ft:__NW.ftEMA,parts:__NW.partsN,combo:__NW.combo,fs:__NW.firesales,st:__NW.state,run:__NW.audio.running})')
                rt={}
                try: rt=(await cdp.send('WebAudio.getRealtimeData',{'contextId':W['ctx']}))['realtimeData']
                except Exception as e: rt={'err':str(e)}
                ns['webaudio']={'liveNodes':W['nodes'],'created':W['created'],'renderCapacity':round(rt.get('renderCapacity',-1),3),'cbVar':rt.get('callbackIntervalVariance')}
                samples.append(ns);print(t,json.dumps({k:ns[k] for k in ['webaudio','lp','ft','parts','combo','fs']}),'oneshot',ns['ns']['oneshot'],'peak',ns['ns']['peak'],'capDrop',ns['ns']['capDrop'])
        ps=await m.evaluate('''(()=>{const c=__NW.audio.ctx();const s=c&&c.playoutStats;return s?{fd:s.fallbackFramesDuration,fe:s.fallbackFramesEvents,tf:s.totalFramesDuration,lat:s.averageLatency}:null})()''')
        ps0=await m.evaluate('window.__ps0')
        peaks=[x['ns']['peak'] for x in samples];act=[x['ns']['oneshot']+x['ns']['live'] for x in samples]
        ok=max(peaks)<=8 and max(act)<=8 and samples[-1]['ns']['live']==0 and all(x['run'] for x in samples) and not errs
        print('peak',max(peaks),'active max',max(act),'capDrops',samples[-1]['ns']['capDrop'],'lowPower',samples[-1]['lp'])
        print('playoutStats start',ps0,'end',ps)
        ln=[x['webaudio']['liveNodes'] for x in samples];rc=[x['webaudio']['renderCapacity'] for x in samples]
        print('WebAudio live nodes per sample',ln,'max',W['maxnodes']);print('renderCapacity per sample',rc)
        ok=ok and max(rc)<0.9 and max(ln)-min(ln)<60
        print('errors',errs[:5]);print('STRESS PASS' if ok else 'STRESS FAIL')
        await b.close()
asyncio.run(main())
