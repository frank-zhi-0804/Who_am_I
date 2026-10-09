'use strict';
const $ = id => document.getElementById(id);
const stops = [
 {id:'chenliu',name:'陈留',era:'魏晋 · 姓氏文化',subtitle:'今河南开封附近 · 示意位置',coordinates:[114.52,34.69],text:'你提供的材料以阮籍、阮咸与“竹林堂”联系作为姓氏文化背景。这一站用于展示文化溯源，不能据此认定两人是查询者的直系祖先，也不能补出他们与后世支系之间的世系。',source:'来源：本次对话中用户提供的材料。尚未取得原始文献或谱页；历史人物关系与堂号来源需分别核查。此站不与后面的迁徙路线连线。'},
 {id:'leping',name:'乐平',era:'迁出线索 · 年代待核查',subtitle:'今江西乐平附近 · 原村址未确认',coordinates:[117.13,28.97],text:'演示材料称，阮四一于1275年前后自江西饶州乐平杏花村迁出。这是候选迁徙线索，尚未核对原谱。材料还提及江西吉安，两个地名之间的关系需要进一步查证，暂不拼成连续世系。',source:'来源：用户提供的“阮四一，南宋德祐元年（1275）迁兴国州”文字。没有提供宗亲网原始链接、谱名或页码；年份、村址和迁徙原因均待核查。'},
 {id:'yangxin',name:'阳新',era:'迁入线索 · 1275年说法',subtitle:'今湖北阳新附近 · 古今范围待核对',coordinates:[115.22,29.83],text:'材料把兴国州与今天的阳新、通山地区联系起来。此处以现代阳新附近作为地图示意，不代表已经确定的落脚村庄。若选择“英士中州启”，界面保留阳新支候选，但字辈本身无法确认亲属关系。',source:'来源：用户提供的迁徙与阳新字辈材料。古兴国州行政范围、始迁记载及支系分化，需要地方志和谱牒原文互证。'},
 {id:'tongshan',name:'通山',era:'家乡线索 · 分支年代未明',subtitle:'湖北通山 · 黄沙铺大源候选',coordinates:[114.49,29.6],text:'“英、士、班、家、国”是这次原型中的关键线索。根据你提供的材料，它指向通山黄沙大源候选支系。它能帮助缩小查询范围，但尚不能证明查询者属于该支，也无法推出父亲、祖父或完整祖先名单。',source:'来源：本次对话中用户提供的字辈与支系说法。尚未取得原谱；“士 / 仕”是否为同一辈、分房关系及完整字辈，需要单独核对。'}
];
let map, ready=false, active='tongshan', branch=null, query=null;
const markers=[];
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function selectStop(id,fly=true){
 const stop=stops.find(s=>s.id===id);if(!stop)throw new Error('未知地点');active=id;
 $('era').textContent=stop.era;$('location-title').textContent=stop.name;$('location-subtitle').textContent=stop.subtitle;$('history-copy').textContent=stop.text;$('source-copy').textContent=stop.source;
 document.querySelectorAll('.stop').forEach(el=>{const selected=el.dataset.id===id;el.classList.toggle('active',selected);el.setAttribute('aria-current',selected?'step':'false');});
 markers.forEach(m=>m.el.classList.toggle('active',m.id===id));
 if(fly&&ready){const narrow=window.innerWidth<1100;map.flyTo({center:stop.coordinates,zoom:9,pitch:58,bearing:-15,duration:reduced?0:2200,padding:{top:window.innerWidth<760?540:100,bottom:window.innerWidth<760?210:200,left:30,right:narrow?30:350}});}
 return {selected:id,name:stop.name};
}
function overview(){if(ready)map.fitBounds([[114.1,28.5],[117.5,35]],{padding:{top:140,bottom:210,left:50,right:window.innerWidth<1100?50:360},pitch:25,bearing:0,duration:reduced?0:1800});}
for(const stop of stops){const b=document.createElement('button');b.type='button';b.className='stop';b.dataset.id=stop.id;b.append(document.createTextNode(stop.name));const small=document.createElement('small');small.textContent=stop.id==='chenliu'?'文化背景':stop.id==='tongshan'?'支系线索':'迁徙线索';b.append(small);b.addEventListener('click',()=>selectStop(stop.id));$('stops').append(b);}
selectStop('tongshan',false);
// Dialogue orchestration lives in conversation.js; these are shared map actions.
$('overview').addEventListener('click',overview);
function revealRoute(){
 window.routeRevealed=true;
 $('route-caption').textContent='候选迁徙示意 · 待核查，非实际行走路线';
 $('map-heading').textContent='本次探索 · 候选迁徙线索';
 if(ready)map.setLayoutProperty('route-line','visibility','visible');
 overview();
}
function showMapError(){ $('map-status').hidden=false;$('map-status').textContent='地图资源未能加载。请检查网络；仍可使用下方时间轴查看各地线索。'; }
try{
 if(!window.maplibregl)throw new Error('地图库未加载');
 map=new maplibregl.Map({container:'map',style:{version:8,sources:{provinces:{type:'geojson',data:window.provinceData,attribution:'省级示意边界：DataV GeoAtlas'}},layers:[{id:'background',type:'background',paint:{'background-color':'#182e3a'}},{id:'province-fill',type:'fill',source:'provinces',paint:{'fill-color':'#29414a','fill-opacity':0.75}},{id:'province-border',type:'line',source:'provinces',paint:{'line-color':'#63818a','line-width':1,'line-opacity':0.6}}]},center:[115.4,31.1],zoom:5.6,pitch:35,bearing:-12,attributionControl:true});
 map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-right');
 const timeout=setTimeout(()=>{if(!ready)showMapError();},15000);
 map.on('load',()=>{ready=true;clearTimeout(timeout);$('map-status').hidden=true;
 map.addSource('basemap',{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'});map.addLayer({id:'basemap',type:'raster',source:'basemap',paint:{'raster-opacity':0.8}},'province-fill');
 map.addSource('elevation',{type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],tileSize:256,encoding:'terrarium',maxzoom:13,attribution:'Elevation: AWS Terrain Tiles'});map.addControl(new maplibregl.TerrainControl({source:'elevation',exaggeration:1.35}));
 for(const feature of window.provinceData.features){const p=feature.properties;if(!p.center||!['湖北省','江西省','河南省','湖南省','安徽省','浙江省','福建省','江苏省','山东省','陕西省','四川省','重庆市'].includes(p.name))continue;const label=document.createElement('span');label.className='province-label';label.textContent=p.name;new maplibregl.Marker({element:label}).setLngLat(p.center).addTo(map);}
 map.addSource('route',{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:stops.slice(1).map(s=>s.coordinates)}}});
 map.addLayer({id:'route-line',type:'line',source:'route',layout:{visibility:window.routeRevealed?'visible':'none'},paint:{'line-color':'#ebbb76','line-width':3,'line-dasharray':[2,3],'line-opacity':0.9}});
 for(const stop of stops){const el=document.createElement('button');el.type='button';el.className='pin';el.textContent=stop.name;el.setAttribute('aria-label','飞到'+stop.name);el.addEventListener('click',()=>selectStop(stop.id));new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat(stop.coordinates).addTo(map);markers.push({id:stop.id,el});}
 selectStop(active,false);overview();
 });
 map.on('error',e=>{console.warn('Map resource unavailable',e.error?.message);if(!ready)showMapError();});
}catch(e){showMapError();}
