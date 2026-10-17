'use strict';
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const phase=process.argv[2]||'after',folder=path.resolve('browser-qa/map-details-'+phase);fs.mkdirSync(folder,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms)),results=[],exceptions=[];let socket,browser;
(async()=>{
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--no-first-run','--remote-debugging-port=9253','--user-data-dir='+folder,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let tabs;for(let i=0;i<50;i++){try{tabs=await(await fetch('http://127.0.0.1:9253/json')).json();if(tabs.some(t=>t.type==='page'))break;}catch{}await pause(150);}
 socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}));
 let seq=0;const pending=new Map();socket.addEventListener('message',event=>{const d=JSON.parse(event.data);if(d.method==='Runtime.exceptionThrown')exceptions.push(d.params.exceptionDetails);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async(expression)=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await pause(150);}throw Error('Timeout: '+expression);};
 const shot=async name=>{await pause(400);const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(folder,name+'.png'),Buffer.from(r.data,'base64'));};
 const check=async(name,expression)=>{const detail=await evaluate(expression);results.push({name,pass:detail===true,detail});};
 await call('Runtime.enable');await call('Page.enable');if(phase==='diagnose'){await call('Network.enable');await call('Network.setBlockedURLs',{urls:['*://tile.openstreetmap.org/*']});}await call('Page.addScriptToEvaluateOnNewDocument',{source:"const originalFetch=fetch.bind(window);window.fetch=(url,options)=>String(url).startsWith('/api/')?Promise.resolve(new Response(JSON.stringify({available:false}),{headers:{'Content-Type':'application/json'}})):originalFetch(url,options);"});
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:'http://127.0.0.1:4173/'});await wait('typeof ready!=="undefined"&&ready');await pause(1600);await wait('!map.isMoving()');
 await shot('01-desktop-map');
 await evaluate("selectStop('tongshan')");await pause(1500);await wait('!map.isMoving()');await pause(1200);await shot('02-desktop-place');if(phase==='diagnose'){await pause(10000);console.log('MAP_DIAGNOSTICS',await evaluate("({usable:basemapUsable,failed:basemapFailed,paint:map.getPaintProperty('province-fill','fill-opacity'),styleLoaded:map.isStyleLoaded(),sources:Object.fromEntries(['basemap','provinces','china-mask'].map(id=>[id,{loaded:map.isSourceLoaded(id),features:map.querySourceFeatures(id).length}])),exceptions:window.__exceptions})"));console.log('EXCEPTIONS',JSON.stringify(exceptions));return;}
 await check('Desktop canvas fills its workspace',"(()=>{const r=document.getElementById('map').getBoundingClientRect(),w=document.getElementById('workspace').getBoundingClientRect();return r.width===w.width&&r.height===w.height;})()");
 await check('Selected pin is visible and not covered',"(()=>{const e=document.querySelector('.pin.active'),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.width>0&&(hit===e||e.contains(hit));})()");
 if(phase==='after'){
  console.log('SOURCES',await evaluate("({usable:basemapUsable,failed:basemapFailed,provinces:map.isSourceLoaded('provinces'),mask:map.isSourceLoaded('china-mask')})"));
  await check('Detailed raster source is loaded',"!!map.getSource('basemap')&&map.isSourceLoaded('basemap')");
  await check('Province fills do not hide city-level map detail',"map.getPaintProperty('province-fill','fill-opacity')===0&&map.getPaintProperty('province-relief','fill-extrusion-opacity')===0");
  await check('Chinese and foreign coordinates remain separated',"isChinaCoordinate([114.49,29.6])&&!isChinaCoordinate([139.69,35.68])");
  await check('Detail context is explicit',"document.getElementById('map-scale-label').textContent.includes('城市')&&document.getElementById('place-precision').textContent.length>0");
  await evaluate('setMapPerspective(0)');await pause(800);await wait('!map.isMoving()');await shot('03-desktop-flat');
 }
 await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await pause(200);await evaluate("showView('map');selectStop('tongshan')");await pause(1600);await wait('!map.isMoving()');await shot('04-mobile-place');
 await check('Mobile page has no horizontal overflow','document.documentElement.scrollWidth<=innerWidth');
 await check('Mobile toolbar and close control are reachable',"['map-view-controls','close-history'].every(id=>{const r=document.getElementById(id).getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})");
 if(phase==='after'){
  await evaluate("document.getElementById('history-more').click()");await pause(300);await shot('05-mobile-expanded');
  await check('Mobile detail expands and its text remains scrollable',"document.getElementById('history').classList.contains('expanded')&&getComputedStyle(document.getElementById('history')).overflowY==='auto'");
  await evaluate("document.getElementById('close-history').click()");await pause(200);await shot('06-mobile-map');
  await call('Network.enable');await call('Network.setBlockedURLs',{urls:['*://tile.openstreetmap.org/*']});await call('Page.reload',{ignoreCache:true});await wait('typeof ready!=="undefined"&&ready');await evaluate("showView('map');selectStop('tongshan')");await pause(1800);await wait('!map.isMoving()');await shot('07-mobile-fallback');
  await check('Unavailable map tiles retain a working map and clear fallback',"document.getElementById('map-detail-status').textContent.includes('省域')&&map.getPaintProperty('province-fill','fill-opacity')===1&&map.queryRenderedFeatures({layers:['province-fill']}).length>0");
  await evaluate("document.getElementById('close-history').click()");
  await check('Fallback retry is reachable on mobile',"(()=>{const e=document.getElementById('retry-basemap'),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !e.hidden&&r.width>0&&(hit===e||e.contains(hit));})()");
  await call('Network.setBlockedURLs',{urls:[]});await evaluate("document.getElementById('retry-basemap').click()");await wait('basemapUsable&&!basemapFailed');
  await check('Restored connection returns from province fallback to detailed map',"map.getPaintProperty('province-fill','fill-opacity')===0&&document.getElementById('retry-basemap').hidden");
 }
 results.push({name:'No uncaught frontend exceptions',pass:exceptions.length===0,detail:exceptions.length});
 const report={phase,results,exceptions,api:'All AI requests intercepted; no credentials loaded or used'};fs.writeFileSync(path.join(folder,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{socket?.close();browser?.kill();});
