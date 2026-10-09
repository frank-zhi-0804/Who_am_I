// Screenshot refresh only. Reuses the checked CDP setup, without rerunning assertions.
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/check-ui.cjs', 'utf8');
const setup = source.slice(0, source.indexOf("    await check('Desktop initial width fits'"));
const cleanup = source.slice(source.indexOf('  } finally {socket?.close();browser.kill();}'));
const capture = `
    await shot('03-after-desktop-initial.png');
    await click('#suggestions button'); await click('#suggestions button'); await click('#suggestions button');
    await click('.stop[data-id="leping"]'); await delay(1800);
    await shot('04-after-desktop-exploration.png');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await click('#tab-chat'); await click('#reset-chat'); await delay(150); await shot('05-after-mobile-chat.png');
    await click('#suggestions button'); await click('#suggestions button'); await click('#suggestions button');
    await click('.stop[data-id="leping"]'); await delay(1800); await shot('06-after-mobile-map.png');
    const colors = await evaluate("({privacy:getComputedStyle(document.querySelector('.privacy-note')).color,placeholder:getComputedStyle(document.getElementById('question'),'::placeholder').color,service:getComputedStyle(document.getElementById('service-notice')).color,stop:getComputedStyle(document.querySelector('.stop')).color})");
    console.log(JSON.stringify({purpose:'Screenshot refresh and computed colors only; no full regression repeated',colors},null,2));
    await click('#tab-chat'); await click('#mode-live');
    await evaluate('agentStatus={available:true}; updateServiceNotice();');
    await type('我姓陈，祖籍福建泉州'); await click('#send-question');
    await evaluate("window.__resolveResearch({body:{answer:'仅为截图本地模拟的资料。[S1]',sources:[{id:'S1',title:'模拟来源',url:'https://example.com/genealogy',cited:true}],clues:[{id:'quanzhou',title:'泉州线索',summary:'本地模拟资料，非真实研究。',sourceIds:['S1']}],mapNodes:[{id:'quanzhou',name:'泉州',lng:118.67,lat:24.87,precision:'city',summary:'本地模拟资料',sourceIds:['S1']}],routes:[],gaps:['仍缺谱页'],followup:{question:'知道村名吗？',options:['不知道']}}});");
    await delay(150); await shot('07-after-mobile-mock-research.png');
`;
new Function('require', '__dirname', setup + capture + cleanup)(require, __dirname);
