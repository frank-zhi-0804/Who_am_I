'use strict';

// Browser regression for mode isolation. All Agent requests are intercepted;
// this script never reads service credentials or runs paid research.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const port = 9251;
const profile = path.resolve(__dirname, '../browser-qa/china-map');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const fixture = (id, name, coordinates, answer) => ({
  answer: answer + '[S1]',
  sources: [{ id: 'S1', title: '本地回归模拟出处', url: 'https://example.org/mode-switch/' + id, cited: true }],
  clues: [{ id, title: name + ' · 本地回归线索', summary: '仅用于验证模式切换，不能用于判断真实家族历史。', kind: 'candidate', sourceIds: ['S1'] }],
  mapNodes: [{ id, name, lng: coordinates[0], lat: coordinates[1], precision: 'city', summary: '本地模拟地图节点。', sourceIds: ['S1'] }],
  routes: [], gaps: [], followup: { question: '还记得具体村名吗？', options: ['不知道'] }
});

(async () => {
  const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--no-first-run', '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  let socket;
  const exceptions = [];
  try {
    let tabs;
    for (let i = 0; i < 40; i++) {
      try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.some(tab => tab.type === 'page')) break; } catch {}
      await delay(200);
    }
    if (!tabs?.some(tab => tab.type === 'page')) throw new Error('Chrome debug endpoint unavailable');
    socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let seq = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if(data.method==='Fetch.requestPaused')call('Fetch.fulfillRequest',{requestId:data.params.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'image/png'},{name:'Cache-Control',value:'public,max-age=604800'}],body:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='}).catch(()=>{});
      if (data.method === 'Runtime.exceptionThrown') exceptions.push(data.params.exceptionDetails);
      if (data.id) {
        const entry = pending.get(data.id); pending.delete(data.id);
        if (entry) data.error ? entry.reject(data.error) : entry.resolve(data.result);
      }
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq; pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    async function evaluate(expression) {
      const reply = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (reply.exceptionDetails) throw new Error(JSON.stringify(reply.exceptionDetails));
      return reply.result.value;
    }
    async function check(name, expression) {
      try { const detail = await evaluate(expression); results.push({ name, pass: detail === true, detail }); }
      catch (error) { results.push({ name, pass: false, error: error.message }); }
    }
    async function waitFor(expression, description) {
      for (let i = 0; i < 60; i++) { if (await evaluate(expression)) return; await delay(100); }
      console.log('CAMERA_TIMEOUT',description,await evaluate("({center:map.getCenter().toArray(),zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch(),padding:map.getPadding(),isMoving:map.isMoving(),isZooming:map.isZooming(),frame:mapFrame,coverage:window.__nationalCoverage?.()})"));await screenshot('timeout.png');throw new Error('Timed out: ' + description);
    }
    async function click(selector) {
      const position = await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el)throw new Error('Missing button'); el.scrollIntoView({block:'nearest',inline:'nearest'}); const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y); return {x,y,blocked:!hit||!(el===hit||el.contains(hit)),width:r.width,height:r.height}; })()`);
      if (position.blocked || !position.width || !position.height) throw new Error('Cannot click ' + selector);
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: position.x, y: position.y, button: 'left', clickCount: 1 });
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: position.x, y: position.y, button: 'left', clickCount: 1 });
      await delay(100);
    }
    async function type(value) {
      await click('#question');
      await evaluate(`document.getElementById('question').value=''`);
      await call('Input.insertText', { text: value });
    }
    async function submit(value) { await type(value); await click('#send-question'); }
    async function complete(index, body, status = 200, headers = {}) {
      await evaluate(`window.__completeQuery(${index},${JSON.stringify(body)},${status},${JSON.stringify(headers)})`);
      await waitFor('!busy', 'mock response completion');
      await delay(100);
    }
    async function screenshot(name) {
      const reply = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(profile, name), Buffer.from(reply.data, 'base64'));
    }
    await call('Runtime.enable'); await call('Page.enable'); await call('Fetch.enable',{patterns:[{urlPattern:'*://tile.openstreetmap.org/*'}]});
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__queries=[]; window.__queryResolvers=[];
      const originalFetch=window.fetch.bind(window);
      window.fetch=(url,options)=>{
        const pathname=new URL(String(url),location.href).pathname;
        if(pathname==='/api/agent/status')return Promise.resolve(new Response(JSON.stringify({available:true}),{status:200,headers:{'Content-Type':'application/json'}}));
        if(pathname==='/api/agent/query'){
          const record={input:JSON.parse(options.body),aborted:options.signal?.aborted||false};
          const index=window.__queries.push(record)-1;
          options.signal?.addEventListener('abort',()=>record.aborted=true,{once:true});
          // Deliberately ignore abort and permit a late response, to check that
          // requestVersion prevents results from entering another mode.
          return new Promise(resolve=>{window.__queryResolvers[index]=resolve;});
        }
        if(pathname.startsWith('/api/'))return Promise.reject(new Error('Unmocked API path blocked'));
        return originalFetch(url,options);
      };
      window.__completeQuery=(index,body,status=200,headers={})=>window.__queryResolvers[index](new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}}));
    ` });
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: 'http://127.0.0.1:4173/' });
    await waitFor(`typeof switchMode==='function'&&conversationMode==='live'&&ready`, 'page and map ready');


    await waitFor('!map.isMoving()', 'initial full-screen map');await evaluate('showChina(false,0)');await waitFor('!map.isMoving()', 'national camera');
    await evaluate(`window.__nationalCoverage=()=>{
      const padding=mapPadding(),size=map.getContainer().getBoundingClientRect();
      const points=chinaAreas.flatMap(area=>area.rings[0].map(coordinate=>map.project(coordinate)));
      const actual=points.reduce((b,p)=>({left:Math.min(b.left,p.x),right:Math.max(b.right,p.x),top:Math.min(b.top,p.y),bottom:Math.max(b.bottom,p.y)}),{left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity});
      const center=map.getCenter(),expectedLng=(chinaExtent[0]+chinaExtent[2])/2;
      const pass=Math.abs(center.lng-expectedLng)<0.1&&size.width>0&&size.height>0&&actual.left>=padding.left-3&&actual.right<=size.width-padding.right+3&&actual.top>=padding.top-3&&actual.bottom<=size.height-padding.bottom+3;
      return {pass,actual,center:center.toArray(),padding,size:{width:size.width,height:size.height},zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),cameraPadding:map.getPadding()};
    };`);
    await check('National map fits between page overlays', 'window.__nationalCoverage().pass||window.__nationalCoverage()');
    await check('Detailed basemap is restricted by the local China mask', "!!map.getSource('provinces')&&!!map.getSource('basemap')&&!!map.getSource('china-mask')&&!map.getSource('elevation')&&map.getStyle().sources.basemap.bounds[0]===chinaExtent[0]&&map.getStyle().sources.basemap.bounds[2]===chinaExtent[2]&&window.provinceData.features.filter(f=>f.properties.name).length===34");
    await check('China polygon filter accepts domestic regions and rejects foreign cities', "[[116.40,39.90],[114.49,29.6],[87.6177,43.7928],[91.1322,29.6604],[109.7549,19.1898],[121.5091,25.0443],[114.173355,22.320048],[113.54909,22.198951]].every(isChinaCoordinate)&&![[139.69,35.68],[13.4,52.5],[106.92,47.91],[NaN,30],[null,30]].some(isChinaCoordinate)");
    await click('#view-flat'); await waitFor('Math.abs(map.getPitch())<0.1&&!map.isMoving()', 'flat view');
    await check('Flat control changes pitch and pressed state', "document.getElementById('view-flat').getAttribute('aria-pressed')==='true'&&Math.abs(map.getPitch())<0.1");
    await click('#rotate-right'); await waitFor('!map.isMoving()', 'right rotation');
    await check('Right rotation changes bearing', 'Math.abs(map.getBearing()-45)<0.1');
    await click('#rotate-left'); await waitFor('!map.isMoving()', 'left rotation');
    await check('Left rotation changes bearing', 'Math.abs(map.getBearing())<0.1');
    await click('#view-tilted'); await waitFor('!map.isMoving()', 'tilted view');
    await check('Tilted control changes pitch and pressed state', "Math.abs(map.getPitch()-42)<0.1&&document.getElementById('view-tilted').getAttribute('aria-pressed')==='true'");
    await evaluate("updateResearchMap({sources:[{id:'S1',title:'Mock source',url:'https://example.org/mock'}],clues:[{id:'foreign',location:{name:'蒙古福建同乡会'},sourceIds:['S1']},{id:'foreign2',location:{name:'东京福建会馆'},sourceIds:['S1']},{id:'foreign-location',location:{name:'加拿大福建会馆',lng:-123.12,lat:49.28},sourceIds:['S1']}],mapNodes:[{id:'cn',name:'北京',lng:116.4,lat:39.9,precision:'city',sourceIds:['S1']},{id:'foreign',name:'乌兰巴托',lng:106.92,lat:47.91,precision:'city',sourceIds:['S1']},{id:'foreign2',name:'东京',lng:139.69,lat:35.68,precision:'city',sourceIds:['S1']},{id:'unsourced',name:'通山',lng:114.49,lat:29.6,precision:'city',sourceIds:[]},{id:'invalid',name:'空坐标',lng:null,lat:null,sourceIds:['S1']}],routes:[{fromId:'cn',toId:'foreign',sourceIds:['S1']}]})");
    await waitFor('!map.isMoving()', 'filtered mock map');
    await check('Foreign, unsourced and invalid nodes cannot produce map pins or routes', "stops.length===1&&stops[0].id==='cn'&&currentRoutes.length===0&&markers.length===1");
    await click('#view-flat'); await waitFor('!map.isMoving()', 'flat before selecting');
    await click('#rotate-right'); await waitFor('!map.isMoving()', 'rotation before selecting');
    await click('.stop[data-id="cn"]'); await waitFor('!map.isMoving()', 'selected Beijing');
    await check('Selecting a place preserves user pitch and bearing', 'Math.abs(map.getPitch())<0.1&&Math.abs(map.getBearing()-45)<0.1');
    await evaluate("window.__beforeNational=document.getElementById('conversation').textContent;");
    await click('#china-overview'); await waitFor('!map.isMoving()', 'return to China');
    await check('National control zooms out from a single node without clearing conversation', "map.getZoom()<5&&Math.abs(map.getBearing())<0.1&&document.getElementById('conversation').textContent===window.__beforeNational&&stops.length===1");
    await check('Flat national map fully fits after selecting a place', 'window.__nationalCoverage().pass||window.__nationalCoverage()');
    await screenshot('china-national-desktop.png');
    await click('#view-tilted'); await waitFor('!map.isMoving()', 'tilted before conversation regression');
    await check('Tilting the national view keeps all Chinese regions visible', 'window.__nationalCoverage().pass||window.__nationalCoverage()');
    await click('#rotate-right');await waitFor('!map.isMoving()','rotated tilted national map');
    await check('Rotated national view keeps all Chinese regions visible', 'window.__nationalCoverage().pass||window.__nationalCoverage()');
    await screenshot('china-tilted-desktop.png');

    await submit('我姓陈，祖籍福建泉州');
    await complete(0, fixture('quanzhou', '泉州', [118.67, 24.87], 'LIVE_FIRST_REPLY'));
    await submit('长辈说祖上后来迁往浙江');
    await check('Second live request includes first live exchange', `window.__queries[1].input.history.length===2&&window.__queries[1].input.history[0].content==='我姓陈，祖籍福建泉州'&&window.__queries[1].input.history[1].content.includes('LIVE_FIRST_REPLY')`);
    const secondReply = fixture('hangzhou', '杭州', [120.15, 30.27], 'LIVE_SECOND_REPLY');
    const anotherPlace = fixture('wenzhou', '温州', [120.70, 28.00], 'SECOND_PLACE');
    secondReply.clues.push(...anotherPlace.clues);
    secondReply.mapNodes.push(...anotherPlace.mapNodes);
    await complete(1, secondReply);
    await evaluate(`Array.from(document.querySelectorAll('.clue-card')).find(card=>card.querySelector('h2').textContent.startsWith('杭州')).querySelector('button').id='qa-current-hangzhou';`);
    await click('.stop[data-id="hangzhou"]'); await delay(1800);
    await type('真实模式未发送的草稿');
    await evaluate(`document.getElementById('history').querySelector('details').open=true;window.__liveConversation=document.getElementById('conversation').textContent;window.__liveHistory=JSON.stringify(researchHistory);window.__liveMapName=document.getElementById('location-title').textContent;window.__liveCamera={center:map.getCenter().toArray(),zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing()};`);
    await click('#mode-demo');
    await check('First demo visit starts its own conversation and map', `conversationMode==='demo'&&document.getElementById('conversation').children.length===0&&stops.some(stop=>stop.id==='tongshan')&&!document.getElementById('conversation').textContent.includes('LIVE_FIRST_REPLY')`);
    await click('#suggestions button'); await click('#suggestions button');
    await type('示例模式未发送的草稿');
    await evaluate(`window.__demoConversation=document.getElementById('conversation').textContent;window.__demoStopIds=JSON.stringify(stops.map(stop=>stop.id));window.__demoBranch=branch;`);
    await click('#mode-live');
    await check('Live transcript and four history entries survive a mode round trip', `document.getElementById('conversation').textContent===window.__liveConversation&&JSON.stringify(researchHistory)===window.__liveHistory&&researchHistory.length===4`);
    await check('Live draft and map selection are restored independently', `document.getElementById('question').value==='真实模式未发送的草稿'&&stops.length===2&&stops.some(stop=>stop.id==='hangzhou')&&active==='hangzhou'&&!document.getElementById('history').hidden&&document.getElementById('location-title').textContent===window.__liveMapName`);
    await check('Expanded evidence and map camera survive returning', `document.getElementById('history').querySelector('details').open&&Math.abs(map.getCenter().lng-window.__liveCamera.center[0])<0.01&&Math.abs(map.getCenter().lat-window.__liveCamera.center[1])<0.01&&Math.abs(map.getZoom()-window.__liveCamera.zoom)<0.01&&Math.abs(map.getPitch()-window.__liveCamera.pitch)<0.01&&Math.abs(map.getBearing()-window.__liveCamera.bearing)<0.01`);
    await click('#qa-current-hangzhou'); await delay(1800);
    await check('Restored clue button keeps other nodes from the same query', `stops.length===2&&stops.some(stop=>stop.id==='wenzhou')&&active==='hangzhou'&&document.getElementById('map-heading').textContent!=='回看这条线索'`);
    await screenshot('live-restored-desktop.png');
    await submit('还记得村名，能继续查吗');
    await check('Resumed live request contains no demo history', `window.__queries[2].input.history.length===4&&window.__queries[2].input.history[3].content.includes('LIVE_SECOND_REPLY')&&!JSON.stringify(window.__queries[2].input.history).includes('两组字辈')`);
    await complete(2, fixture('hangzhou', '杭州', [120.15, 30.27], 'LIVE_THIRD_REPLY'));
    await click('#mode-demo');
    await check('Demo transcript, draft, branch, and map survive returning', `document.getElementById('conversation').textContent===window.__demoConversation&&document.getElementById('question').value==='示例模式未发送的草稿'&&branch===window.__demoBranch&&JSON.stringify(stops.map(stop=>stop.id))===window.__demoStopIds`);
    await click('#reset-chat');
    await check('New demo conversation clears only the current mode', `conversationMode==='demo'&&document.getElementById('conversation').children.length===0&&document.getElementById('question').value===''&&branch===null`);
    await click('#mode-live');
    await check('Live remains after reset in demo mode', `researchHistory.length===6&&document.getElementById('conversation').textContent.includes('LIVE_THIRD_REPLY')`);
    await click('#reset-chat');
    await check('New live conversation clears its transcript, history, draft, and map', `document.getElementById('conversation').children.length===0&&researchHistory.length===0&&document.getElementById('question').value===''&&stops.length===0`);
    await click('#mode-demo'); await click('#suggestions button');
    await evaluate(`window.__demoBeforePending=document.getElementById('conversation').textContent;`);
    await click('#mode-live'); await submit('查找中切换的未完成问题');
    await type('查找期间编辑的草稿');
    await check('Live query is pending before mode switch', `busy&&window.__queries.length===4&&!window.__queries[3].aborted`);
    await click('#mode-demo');
    await check('Busy switch cancels live request and restores demo without pending text', `!busy&&window.__queries[3].aborted&&conversationMode==='demo'&&document.getElementById('conversation').textContent===window.__demoBeforePending`);
    await complete(3, fixture('late-place', '迟到地点', [115, 30], 'LATE_WRONG_MODE_REPLY'));
    await check('Late live response cannot enter demo conversation or map', `!document.getElementById('conversation').textContent.includes('LATE_WRONG_MODE_REPLY')&&!stops.some(stop=>stop.id==='late-place')`);
    await click('#mode-live');
    await check('Cancelled live mode preserves question, stop notice, draft, and a retry', `!busy&&document.getElementById('conversation').textContent.includes('查找中切换的未完成问题')&&document.getElementById('conversation').textContent.includes('已停止')&&document.getElementById('question').value==='查找期间编辑的草稿'&&!!document.querySelector('#conversation>button')&&!document.getElementById('conversation').textContent.includes('LATE_WRONG_MODE_REPLY')`);
    await click('#conversation>button');
    await check('Restored retry sends original live question once', `busy&&window.__queries.length===5&&window.__queries[4].input.question==='查找中切换的未完成问题'`);
    await complete(4, fixture('retry-result', '重试地点', [115, 30], 'RETRY_CORRECT_MODE_REPLY'));
    await check('Retry result enters only restored live mode', `document.getElementById('conversation').textContent.includes('RETRY_CORRECT_MODE_REPLY')&&stops.length===1&&stops[0].id==='retry-result'`);

    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await click('#tab-chat'); await type('手机真实模式草稿'); await click('#mode-demo'); await type('手机示例模式草稿'); await click('#mode-live');
    await check('Mobile mode switch preserves transcript and draft without overflow', `document.documentElement.scrollWidth<=innerWidth&&document.getElementById('question').value==='手机真实模式草稿'&&document.getElementById('conversation').textContent.includes('RETRY_CORRECT_MODE_REPLY')&&document.getElementById('send-question').getBoundingClientRect().bottom<=innerHeight`);
    await screenshot('live-restored-mobile.png');
    await submit('冷却期间切换模式的重试问题');
    await complete(5, { error: { code: 'RATE_LIMIT', message: '本地限流模拟' } }, 429, { 'Retry-After': '2' });
    await check('Rate-limited retry starts disabled before switching', `!!document.querySelector('#conversation>button')&&document.querySelector('#conversation>button').disabled`);
    await click('#mode-demo'); await delay(2200); await click('#mode-live');
    await check('Detached cooldown retry refreshes and becomes usable on returning', `!document.querySelector('#conversation>button').disabled&&document.querySelector('#conversation>button').textContent==='重试这次查找'&&!document.getElementById('service-notice').textContent.includes('请等待')`);
    await click('#conversation>button');
    await check('Recovered cooldown retry sends its original question once', `busy&&window.__queries.length===7&&window.__queries[6].input.question==='冷却期间切换模式的重试问题'`);
    await complete(6, fixture('cooled-result', '恢复地点', [115, 30], 'COOLDOWN_RECOVERED_REPLY'));

    await click('#tab-map');
    await check('Mobile camera toolbar fits and every button is reachable', "document.documentElement.scrollWidth<=innerWidth&&Array.from(document.querySelectorAll('#map-view-controls button')).every(button=>{const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&(hit===button||button.contains(hit));})");
    await click('#view-flat'); await waitFor('!map.isMoving()', 'mobile flat camera');
    await check('Mobile flat button operates the map', "Math.abs(map.getPitch())<0.1&&document.getElementById('view-flat').getAttribute('aria-pressed')==='true'");
    await click('#rotate-left'); await waitFor('!map.isMoving()', 'mobile rotated camera');
    await evaluate("window.__mobileCamera={pitch:map.getPitch(),bearing:map.getBearing()};");
    await click('#tab-chat'); await click('#mode-demo'); await click('#mode-live'); await click('#tab-map'); await delay(150);
    await check('Mode and tab changes restore camera and matching toolbar state', "Math.abs(map.getPitch()-window.__mobileCamera.pitch)<0.1&&Math.abs(map.getBearing()-window.__mobileCamera.bearing)<0.1&&document.getElementById('view-flat').getAttribute('aria-pressed')==='true'");
    await click('#china-overview'); await waitFor('!map.isMoving()', 'mobile national view');
    await check('Mobile national view zooms out and fits every Chinese region', 'map.getZoom()<5&&(window.__nationalCoverage().pass||window.__nationalCoverage())');
    await screenshot('china-national-mobile.png');
    await click('#view-tilted');await waitFor('!map.isMoving()','mobile tilted national map');
    await check('Mobile tilted national view remains complete', 'window.__nationalCoverage().pass||window.__nationalCoverage()');
    await screenshot('china-tilted-mobile.png');
    await call('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await waitFor('!map.isMoving()&&map.getContainer().getBoundingClientRect().width>1000','national desktop resize');
    await delay(200);
    await check('National camera adapts after mobile to desktop resize', 'window.__nationalCoverage().pass||window.__nationalCoverage()');

    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate("showView('map');showHomeMap(0)");await delay(100);await click('.maplibregl-ctrl-zoom-in');await waitFor('!map.isMoving()','manual zoom');await evaluate('window.__manualZoom=map.getZoom()');await click('#tab-chat');await click('#tab-map');await delay(150);
    await check('Mobile view switching preserves manual map zoom',"mapFrame==='free'&&Math.abs(map.getZoom()-window.__manualZoom)<0.01");
    await check('No uncaught frontend exceptions', JSON.stringify(exceptions.length === 0));
    const report = { api: 'All Agent and raster tile requests mocked; no credentials read or real research requested', results, exceptions };
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (results.some(result => !result.pass)) process.exitCode = 1;
  } finally { socket?.close(); browser.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
