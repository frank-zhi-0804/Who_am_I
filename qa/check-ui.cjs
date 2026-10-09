const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const port = 9235;
const results = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--no-first-run', '--remote-debugging-port=' + port,
    '--user-data-dir=' + path.resolve(__dirname, '../browser-qa'), 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    let tabs;
    for (let i = 0; i < 40; i++) {
      try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.some(t => t.type === 'page')) break; } catch {}
      await delay(250);
    }
    if (!tabs) throw new Error('Chrome debug endpoint unavailable');
    socket = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
    let seq = 0; const pending = new Map(); const exceptions = [];
    socket.addEventListener('message', e => {
      const data = JSON.parse(e.data);
      if (data.method === 'Runtime.exceptionThrown') exceptions.push(data.params.exceptionDetails);
      if (data.id) {
        const entry = pending.get(data.id); pending.delete(data.id);
        data.error ? entry.reject(data.error) : entry.resolve(data.result);
      }
    });
    function call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++seq; pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
    async function evaluate(expression) {
      const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
      return response.result.value;
    }
    async function check(name, expression) {
      try { const detail = await evaluate(expression); results.push({ name, pass: detail === true, detail }); }
      catch (error) { results.push({ name, pass: false, error: error.message }); }
    }
    async function click(selector) {
      const position = await evaluate(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el) throw new Error('missing '+${JSON.stringify(selector)}); el.scrollIntoView({block:'nearest',inline:'nearest'}); const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2; const hit=document.elementFromPoint(x,y); return {x,y,blocked:!hit||!(el===hit||el.contains(hit)),hit:hit?.outerHTML.slice(0,200),width:r.width,height:r.height}; })()`);
      if (position.blocked || !position.width || !position.height) throw new Error('Cannot click ' + selector + ': ' + JSON.stringify(position));
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: position.x, y: position.y, button: 'left', clickCount: 1 });
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: position.x, y: position.y, button: 'left', clickCount: 1 });
      await delay(100);
    }
    async function type(value) {
      await click('#question');
      await evaluate(`document.getElementById('question').value=''`);
      await call('Input.insertText', { text: value });
    }
    async function shot(name) {
      const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(__dirname, name), Buffer.from(result.data, 'base64'));
    }
    async function waitMap() {
      for (let i=0; i<50; i++) { if(await evaluate('ready')) return; await delay(200); }
      throw new Error('Map failed to load');
    }
    const pinVisible = `(() => { const el=document.querySelector('.pin.active'); if(!el)return false;const r=el.getBoundingClientRect(),m=document.querySelector('.map-shell').getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return r.left>=m.left&&r.right<=m.right&&r.top>=m.top&&r.bottom<=m.bottom&&!!hit&&(hit===el||el.contains(hit)); })()`;
    await call('Runtime.enable'); await call('Page.enable');
    // API calls are locally mocked throughout; no actual research or paid API can run.
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__queryCalls=0;
      window.__originalFetch=window.fetch.bind(window);
      window.fetch=(url,options)=>{
        if(String(url).startsWith('/api/agent/status'))return Promise.resolve(new Response(JSON.stringify({available:false}),{status:200,headers:{'Content-Type':'application/json'}}));
        if(String(url).startsWith('/api/agent/query')){window.__queryCalls++;return new Promise(resolve=>{window.__resolveResearch=value=>resolve(new Response(JSON.stringify(value.body),{status:value.status||200,headers:{'Content-Type':'application/json'}}));});}
        return window.__originalFetch(url,options);
      };` });
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: 'http://127.0.0.1:4173/' }); await delay(300); await waitMap(); await delay(1600);
    await check('Desktop initial width fits', 'document.documentElement.scrollWidth<=innerWidth');
    await check('Initial mode is explicit demo, no route', `conversationMode==='demo'&&!window.routeRevealed&&map.getLayoutProperty('route-line','visibility')==='none'`);
    await shot('03-after-desktop-initial.png');
    await click('#suggestions button');
    await check('Sample starts a generation follow-up', `conversationStage==='generation'&&document.getElementById('conversation').textContent.includes('两组字辈')`);
    await click('#suggestions button');
    await check('Generation answer selects candidate without confirmation', `branch==='dayuan'&&document.getElementById('conversation').textContent.includes('不能确认你属于该支')`);
    await click('#suggestions button');
    await check('Route is explicitly revealed', `window.routeRevealed&&map.getLayoutProperty('route-line','visibility')==='visible'`);
    await click('.stop[data-id="leping"]'); await delay(1900);
    await check('Desktop selected pin is visible and uncovered', pinVisible);
    await shot('04-after-desktop-exploration.png');
    await click('#suggestions button:last-child');
    await check('Re-choosing generation clears old route immediately', `!window.routeRevealed&&map.getLayoutProperty('route-line','visibility')==='none'`);
    await click('#suggestions button:nth-child(2)');
    await check('Alternate branch hides former route', `branch==='yangxin'&&!window.routeRevealed`);
    await click('#reset-chat'); await type('   '); await click('#send-question');
    await check('Whitespace form input gives visible validation', `!document.getElementById('form-error').hidden&&document.getElementById('conversation').children.length===0`);
    await type('我不姓阮，是通山人'); await click('#send-question');
    await check('Negative surname input does not select Ruan', `query===null&&branch===null&&!window.routeRevealed`);
    await click('#suggestions button'); await click('#suggestions button:last-child');
    await check('Unknown generation preserves uncertainty', `branch==='unknown'&&document.getElementById('conversation').textContent.includes('保留两种可能')`);
    await type('我姓李，祖籍四川'); await click('#send-question');
    await check('Changing surname clears candidate and route', `query===null&&branch===null&&!window.routeRevealed`);
    await type('<img src=x onerror=alert(1)>'); await click('#send-question');
    await check('User text does not become executable HTML', `document.querySelectorAll('#conversation img').length===0`);
    await click('#mode-live');
    await check('Live mode removes example nodes and conversation', `conversationMode==='live'&&stops.length===0&&document.getElementById('conversation').children.length===0`);
    await type('我姓陈，祖籍福建泉州'); await click('#send-question');
    await check('No-key query is unavailable without fake results', `window.__queryCalls===0&&stops.length===0&&document.getElementById('conversation').textContent.includes('没有进行网络查询')`);

    await call('Emulation.setDeviceMetricsOverride', { width:390,height:844,deviceScaleFactor:1,mobile:true });
    await click('#mode-demo'); await delay(200);
    await check('Mobile starts with reachable chat and composer', `document.documentElement.scrollWidth<=innerWidth&&document.getElementById('workspace').dataset.view==='chat'&&getComputedStyle(document.querySelector('.map-shell')).display==='none'&&document.getElementById('send-question').getBoundingClientRect().bottom<=innerHeight`);
    await shot('05-after-mobile-chat.png');
    await click('#suggestions button'); await click('#suggestions button');
    await check('Mobile follow-up remains in chat', `document.getElementById('workspace').dataset.view==='chat'`);
    await click('#suggestions button'); await delay(1700);
    await check('Route action opens mobile map', `document.getElementById('workspace').dataset.view==='map'&&document.getElementById('tab-map').getAttribute('aria-selected')==='true'`);
    await click('.stop[data-id="leping"]'); await delay(1800);
    await check('Mobile selected pin is visible and uncovered', pinVisible);
    await shot('06-after-mobile-map.png');
    await click('#ask-location');
    await check('Ask place returns to chat with draft focused', `document.getElementById('workspace').dataset.view==='chat'&&document.getElementById('question').value.includes('乐平')&&document.activeElement.id==='question'`);
    await click('#tab-map'); await delay(1700);
    await check('Mobile tabs preserve dialogue', `document.getElementById('conversation').children.length>0&&document.getElementById('workspace').dataset.view==='map'`);
    await click('.stop[data-id="tongshan"]'); await delay(1800);
    await check('Mobile other selected pin remains visible', pinVisible);

    await click('#tab-chat'); await click('#mode-live');
    await evaluate(`agentStatus={available:true}; updateServiceNotice();`);
    await type('我姓陈，祖籍福建泉州'); await click('#send-question');
    await check('Mock research disables send and shows progress', `busy&&document.getElementById('send-question').disabled&&!document.getElementById('query-progress').hidden&&window.__queryCalls===1`);
    await type('等待时编辑的草稿');
    await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await check('Busy Enter keeps draft and sends no duplicate', `document.getElementById('question').value==='等待时编辑的草稿'&&window.__queryCalls===1`);
    await click('#reset-chat');
    await evaluate(`window.__resolveResearch({body:{answer:'LATE_STALE_RESULT',sources:[],clues:[],mapNodes:[],routes:[]}});`); await delay(200);
    await check('Reset discards late response and restores controls', `!busy&&document.getElementById('conversation').children.length===0&&stops.length===0&&!document.getElementById('send-question').disabled`);
    await type('我姓张，祖籍浙江'); await click('#send-question');
    await evaluate(`window.__resolveResearch({status:503,body:{error:{message:'测试服务连接失败'}}});`); await delay(200);
    await check('Mock service failure offers reachable retry', `!busy&&document.getElementById('conversation').textContent.includes('测试服务连接失败')&&!!document.querySelector('#conversation>button')&&stops.length===0`);
    await click('#conversation>button');
    await check('Retry begins only one new request', `busy&&window.__queryCalls===3`);
    await evaluate(`window.__resolveResearch({body:{answer:'测试资料线索，仅本地模拟。[S1]',sources:[{id:'S1',title:'有效来源',url:'https://example.com/genealogy',cited:true},{id:'unsafe',title:'恶意链接',url:'javascript:alert(1)',cited:true}],clues:[{id:'quanzhou',title:'泉州线索',summary:'本地模拟资料',sourceIds:['S1']}],mapNodes:[{id:'quanzhou',name:'泉州',lng:118.67,lat:24.87,precision:'city',summary:'本地模拟资料',sourceIds:['S1']},{id:'unsourced',name:'无来源点',lng:110,lat:30,sourceIds:[]}],routes:[{fromId:'quanzhou',toId:'unsourced',sourceIds:['S1']}],gaps:['仍缺谱页'],followup:{question:'知道村名吗？',options:['不知道']}}});`); await delay(200);
    await check('Mock result has cited node and filters unsourced node/route', `!busy&&stops.length===1&&stops[0].id==='quanzhou'&&currentRoutes.length===0&&!window.routeRevealed`);
    await check('Unsafe source href is never rendered', `!Array.from(document.querySelectorAll('a')).some(a=>a.href.startsWith('javascript:'))`);
    await check('Research answer citation is clickable near claim', `!!Array.from(document.querySelectorAll('.message.assistant a')).find(a=>a.href==='https://example.com/genealogy'&&a.textContent.includes('S1'))`);
    await check('Live result keeps chat and announces map changes', `document.getElementById('workspace').dataset.view==='chat'&&!document.getElementById('map-toast').hidden&&document.getElementById('map-toast').textContent.includes('1')`);
    await shot('07-after-mobile-mock-research.png');
    // A later response may replace the map dataset; old clue buttons must stay safe.
    await type('再查查浙江的另一条线索'); await click('#send-question');
    await evaluate(`window.__resolveResearch({body:{answer:'另一条资料线索。[S1]',sources:[{id:'S1',title:'第二次来源',url:'https://example.com/second',cited:true}],clues:[{id:'hangzhou',title:'杭州线索',summary:'另一条本地模拟资料',sourceIds:['S1']}],mapNodes:[{id:'hangzhou',name:'杭州',lng:120.15,lat:30.27,precision:'city',summary:'另一条本地模拟资料',sourceIds:['S1']}],routes:[],gaps:[],followup:null}});`); await delay(200);
    const beforeOldCard = exceptions.length;
    await click('#conversation .clue-card button.text-button'); await delay(1800);
    await check('Old clue map button stays usable after next response', `document.getElementById('workspace').dataset.view==='map'&&document.getElementById('location-title').textContent==='泉州'&&!document.getElementById('history').hidden`);
    results.push({name:'Old clue click throws no exception',pass:exceptions.length===beforeOldCard,detail:exceptions.length-beforeOldCard});
    await check('No uncaught frontend exceptions', JSON.stringify(exceptions.length === 0));
    console.log(JSON.stringify({api:'All /api calls mocked locally; no real AI used',results,exceptions},null,2));
    fs.writeFileSync(path.join(__dirname,'ui-review-result.json'),JSON.stringify({api:'Local mock only',results,exceptions},null,2));
    if(results.some(r=>!r.pass))process.exitCode=1;
  } finally {socket?.close();browser.kill();}
})().catch(error=>{console.error(error);process.exitCode=1;});
