'use strict';
const $ = id => document.getElementById(id);
const demoStops = [
 {id:'chenliu',name:'陈留',era:'魏晋 · 姓氏文化',subtitle:'今河南开封附近 · 示意位置',coordinates:[114.52,34.69],text:'你提供的材料以阮籍、阮咸与“竹林堂”联系作为姓氏文化背景。这一站用于展示文化溯源，不能据此认定两人是查询者的直系祖先，也不能补出他们与后世支系之间的世系。',source:'来源：本次对话中用户提供的材料。尚未取得原始文献或谱页；历史人物关系与堂号来源需分别核查。此站不与后面的迁徙路线连线。'},
 {id:'leping',name:'乐平',era:'迁出线索 · 年代待核查',subtitle:'今江西乐平附近 · 原村址未确认',coordinates:[117.13,28.97],text:'演示材料称，阮四一于1275年前后自江西饶州乐平杏花村迁出。这是候选迁徙线索，尚未核对原谱。材料还提及江西吉安，两个地名之间的关系需要进一步查证，暂不拼成连续世系。',source:'来源：用户提供的“阮四一，南宋德祐元年（1275）迁兴国州”文字。没有提供宗亲网原始链接、谱名或页码；年份、村址和迁徙原因均待核查。'},
 {id:'yangxin',name:'阳新',era:'迁入线索 · 1275年说法',subtitle:'今湖北阳新附近 · 古今范围待核对',coordinates:[115.22,29.83],text:'材料把兴国州与今天的阳新、通山地区联系起来。此处以现代阳新附近作为地图示意，不代表已经确定的落脚村庄。若选择“英士中州启”，界面保留阳新支候选，但字辈本身无法确认亲属关系。',source:'来源：用户提供的迁徙与阳新字辈材料。古兴国州行政范围、始迁记载及支系分化，需要地方志和谱牒原文互证。'},
 {id:'tongshan',name:'通山',era:'家乡线索 · 分支年代未明',subtitle:'湖北通山 · 黄沙铺大源候选',coordinates:[114.49,29.6],text:'“英、士、班、家、国”是这次原型中的关键线索。根据你提供的材料，它指向通山黄沙大源候选支系。它能帮助缩小查询范围，但尚不能证明查询者属于该支，也无法推出父亲、祖父或完整祖先名单。',source:'来源：本次对话中用户提供的字辈与支系说法。尚未取得原谱；“士 / 仕”是否为同一辈、分房关系及完整字辈，需要单独核对。'}
];
let stops=demoStops.slice(),map,ready=false,active=null,branch=null,query=null,currentRoutes=[];
const markers=[];const provinceMarkers=[];
let mapFrame='china',pendingMapCamera=null,cameraIntentVersion=0;
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const chinaAreas=window.provinceData.features.flatMap(feature=>{
 const geometry=feature.geometry;
 const polygons=geometry.type==='MultiPolygon'?geometry.coordinates:geometry.type==='Polygon'?[geometry.coordinates]:[];
 return polygons.map(rings=>({rings,bounds:rings[0].reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[180,90,-180,-90])}));
});
const chinaExtent=chinaAreas.reduce((b,area)=>[Math.min(b[0],area.bounds[0]),Math.min(b[1],area.bounds[1]),Math.max(b[2],area.bounds[2]),Math.max(b[3],area.bounds[3])],[180,90,-180,-90]);
const chinaBounds=[[chinaExtent[0],chinaExtent[1]],[chinaExtent[2],chinaExtent[3]]];
const provinceColors=['#cbdab9','#c1d4c3','#dce2c5','#bcd2c8','#d6d9b8'];
const chinaMapData={...window.provinceData,features:window.provinceData.features.map((feature,index)=>({...feature,properties:{...feature.properties,shade:provinceColors[index%provinceColors.length]}}))};
function ringContains(point,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[j],b=ring[i],cross=(point[0]-a[0])*(b[1]-a[1])-(point[1]-a[1])*(b[0]-a[0]);
  if(Math.abs(cross)<1e-9&&point[0]>=Math.min(a[0],b[0])-1e-9&&point[0]<=Math.max(a[0],b[0])+1e-9&&point[1]>=Math.min(a[1],b[1])-1e-9&&point[1]<=Math.max(a[1],b[1])+1e-9)return true;
  if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
function isChinaCoordinate(point){
 return Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&chinaAreas.some(area=>{
  const b=area.bounds;
  return point[0]>=b[0]&&point[0]<=b[2]&&point[1]>=b[1]&&point[1]<=b[3]&&ringContains(point,area.rings[0])&&!area.rings.slice(1).some(ring=>ringContains(point,ring));
 });
}
// Ignore camera work queued before the map dataset was replaced.
function queueMapFrame(callback){const dataset=stops;requestAnimationFrame(()=>{if(stops===dataset)callback();});}
function safeUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function linkSource(container,source){const url=safeUrl(source.url);if(!url)return;const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=source.title||new URL(url).hostname;container.append(a);}
function showView(view){$('workspace').dataset.view=view;$('tab-chat').setAttribute('aria-selected',String(view==='chat'));$('tab-map').setAttribute('aria-selected',String(view==='map'));if(view==='map')queueMapFrame(resizeMapView);}
function mapVisible(){const r=$('map').getBoundingClientRect();return r.width>0&&r.height>0;}
function mapPadding(){
 const shell=$('map').getBoundingClientRect(),mobile=window.innerWidth<=760;
 const detail=$('history').hidden?0:$('history').getBoundingClientRect().height;
 const padding={top:mobile?(detail?195:224):238,bottom:mobile?(detail?detail+145:170):165,left:mobile?24:document.querySelector('.conversation-panel').getBoundingClientRect().right+35,right:mobile?24:($('history').hidden?40:350)};
 // Keep a usable camera area even on a short viewport.
 padding.top=Math.min(padding.top,Math.max(0,shell.height-120));
 padding.bottom=Math.min(padding.bottom,Math.max(0,shell.height-padding.top-80));
 padding.left=Math.min(padding.left,Math.max(0,shell.width-120));
 padding.right=Math.min(padding.right,Math.max(0,shell.width-padding.left-80));
 return padding;
}
function fitMapBounds(bounds,maxZoom,angles=currentMapAngles(),duration=1200){
 if(!ready)return;
 const version=++cameraIntentVersion;
 const fit=()=>{
  if(version!==cameraIntentVersion)return;
  if(!mapVisible()){pendingMapCamera=fit;return;}
  pendingMapCamera=null;map.stop();map.resize();map.setPadding(mapPadding());
  // In MapLibre 5.6, bounds padding is additional to the camera's padding.
  const camera=map.cameraForBounds(bounds,{padding:0,bearing:angles.bearing,maxZoom});
  if(camera)map.flyTo({...camera,...angles,zoom:Math.max(map.getMinZoom(),camera.zoom-(angles.pitch>=5?0.25:0)),duration:reduced?0:duration});
 };
 fit();
}
function resizeMapView(){
 if(!ready||!mapVisible())return;
 map.stop();map.resize();map.setPadding(mapPadding());
 const pending=pendingMapCamera;pendingMapCamera=null;
 if(pending)pending();
 else if(mapFrame==='china')showChina(false,0);
 else if(mapFrame==='stops')overview(0);
}
function restoreMapCamera(camera){
 mapFrame=camera.frame||'free';const version=++cameraIntentVersion;
 const restore=()=>{
  if(version!==cameraIntentVersion)return;
  if(!ready||!mapVisible()){pendingMapCamera=restore;return;}
  pendingMapCamera=null;map.stop();map.resize();
  map.jumpTo({center:camera.center,zoom:camera.zoom,pitch:camera.pitch,bearing:camera.bearing,padding:mapPadding()});
  if(mapFrame==='china')showChina(false,0);
  else if(mapFrame==='stops')overview(0);
 };
 restore();
}
function currentMapAngles(){return ready?{pitch:map.getPitch(),bearing:map.getBearing()}:{pitch:42,bearing:0};}
function updateMapViewControls(){
 if(!ready)return;
 const pitch=map.getPitch(),bearing=map.getBearing();
 $('view-flat').setAttribute('aria-pressed',String(pitch<5));
 $('view-tilted').setAttribute('aria-pressed',String(pitch>=5));
 const text=(pitch<5?'俯视':'倾斜')+'视角，朝向'+Math.round(bearing)+'度';
 if($('map-view-status').textContent!==text)$('map-view-status').textContent=text;
}
function setMapPerspective(pitch){
 if(!ready)return;
 const angles={pitch,bearing:map.getBearing()};
 if(mapFrame==='china')fitMapBounds(chinaBounds,5,angles,650);else{cameraIntentVersion++;pendingMapCamera=null;map.stop();map.easeTo({...angles,duration:reduced?0:650});}
}
function rotateMap(direction){
 if(!ready)return;
 const angles={bearing:map.getBearing()+direction*45,pitch:map.getPitch()};
 if(mapFrame==='china')fitMapBounds(chinaBounds,5,angles,650);else{cameraIntentVersion++;pendingMapCamera=null;map.stop();map.easeTo({...angles,duration:reduced?0:650});}
}
function selectStop(id,fly=true,openView=true){
 const stop=stops.find(s=>s.id===id);if(!stop)throw new Error('未知地点');
 active=id;mapFrame='place';$('history').hidden=false;$('era').textContent=stop.era||'本次查询线索';$('location-title').textContent=stop.name;$('location-subtitle').textContent=stop.subtitle||'位置为区域示意';$('history-copy').textContent=stop.text||'';$('location-evidence').textContent=stop.evidence||'待核查';
 $('source-copy').replaceChildren();
 if(stop.sources?.length){for(const source of stop.sources)linkSource($('source-copy'),source);}else{const p=document.createElement('p');p.textContent=stop.source||'尚缺可核对的来源。';$('source-copy').append(p);}
 document.querySelectorAll('.stop').forEach(el=>{const selected=el.dataset.id===id;el.classList.toggle('active',selected);el.setAttribute('aria-current',selected?'location':'false');});markers.forEach(m=>m.el.classList.toggle('active',m.id===id));
 if(fly&&(openView||window.innerWidth>760||$('workspace').dataset.view==='map')){
  if(openView)showView('map');
  const version=++cameraIntentVersion;
  queueMapFrame(()=>{
   const locate=()=>{if(!ready||version!==cameraIntentVersion)return;if(!mapVisible()){pendingMapCamera=locate;return;}pendingMapCamera=null;map.stop();map.resize();map.flyTo({center:stop.coordinates,zoom:stop.precision==='province'?6:8,...currentMapAngles(),duration:reduced?0:1300,padding:mapPadding()});};
   locate();
  });
 }
 $('map-toast').textContent='已定位 '+stop.name;$('map-toast').hidden=false;
 return {selected:id,name:stop.name};
}
function showChina(north=false,duration=1200){
 if(!ready)return;
 mapFrame='china';$('history').hidden=true;$('map-toast').hidden=true;
 fitMapBounds(chinaBounds,5,{...currentMapAngles(),...(north?{bearing:0}:{})},duration);
}
function overview(duration=1200){
 if(!ready)return;
 if(!stops.length){showChina(false,typeof duration==='number'?duration:1200);return;}
 mapFrame='stops';$('history').hidden=true;$('map-toast').hidden=true;
 const bounds=new maplibregl.LngLatBounds();for(const stop of stops)bounds.extend(stop.coordinates);
 fitMapBounds(bounds,6.5,currentMapAngles(),typeof duration==='number'?duration:1200);
}
function renderStops(){
 $('stops').replaceChildren();$('place-count').textContent=stops.length+' 处线索';$('mobile-count').textContent=String(stops.length);$('map-empty').hidden=stops.length>0;
 for(const stop of stops){const b=document.createElement('button');b.type='button';b.className='stop';b.dataset.id=stop.id;b.append(document.createTextNode(stop.name));const small=document.createElement('small');small.textContent=stop.evidence||(stop.id==='chenliu'?'文化背景':'待核查');b.append(small);b.addEventListener('click',()=>selectStop(stop.id));$('stops').append(b);}
}
function syncMap(){
 if(!ready)return;
 for(const marker of markers)marker.marker.remove();markers.length=0;
 for(const stop of stops){const el=document.createElement('button');el.type='button';el.className='pin';el.textContent=stop.name;el.setAttribute('aria-label','查看 '+stop.name);el.addEventListener('click',()=>selectStop(stop.id));const marker=new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat(stop.coordinates).addTo(map);markers.push({id:stop.id,el,marker});}
 const features=currentRoutes.map(route=>{const from=stops.find(s=>s.id===route.fromId),to=stops.find(s=>s.id===route.toId);return from&&to?{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[from.coordinates,to.coordinates]}}:null;}).filter(Boolean);
 map.getSource('route').setData({type:'FeatureCollection',features});map.setLayoutProperty('route-line','visibility',window.routeRevealed?'visible':'none');
}
function setMapDataset(nodes,routes=[]){stops=nodes.filter(s=>isChinaCoordinate(s.coordinates));currentRoutes=routes;active=null;pendingMapCamera=null;mapFrame='china';cameraIntentVersion++;$('history').hidden=true;$('map-toast').hidden=true;renderStops();syncMap();}
function useDemoMap(){window.routeRevealed=false;setMapDataset(demoStops.slice(),[{fromId:'leping',toId:'yangxin'},{fromId:'yangxin',toId:'tongshan'}]);$('map-heading').textContent='从家乡出发';$('route-caption').textContent='阮氏背景示例 · 不代表你的祖先';$('timeline-title').textContent='先探索这些背景地点';showChina();}
function useLiveMap(){window.routeRevealed=false;setMapDataset([]);$('map-heading').textContent='从中国，寻找来路';$('route-caption').textContent='仅展示本次查询有来源的中国地点';$('timeline-title').textContent='本次查询地点';showChina();}
function revealRoute(){window.routeRevealed=true;$('route-caption').textContent='候选迁徙示意 · 待核查，非实际行走路线';$('map-heading').textContent='沿着线索，看见来路';syncMap();showView('map');queueMapFrame(overview);}
function updateResearchMap(result){
 const sources=new Map((result.sources||[]).map(s=>[s.id,s])),nodes=[],foreignIds=new Set((result.mapNodes||[]).filter(node=>Number.isFinite(node.lng)&&Number.isFinite(node.lat)&&!isChinaCoordinate([node.lng,node.lat])).map(node=>node.id));
 for(const node of result.mapNodes||[]){
  if(!node.sourceIds?.some(id=>sources.has(id))||!isChinaCoordinate([node.lng,node.lat]))continue;
  nodes.push({id:node.id,name:node.name,coordinates:[node.lng,node.lat],precision:node.precision,era:node.year?String(node.year):'公开资料线索',subtitle:node.precision==='exact'?'文献提供的位置':'区域示意 · 非祖居精确位置',text:node.summary,evidence:'有来源线索',sources:node.sourceIds.map(id=>sources.get(id)).filter(Boolean)});
 }
 for(const clue of result.clues||[]){
  const location=clue.location;if(!location?.name||foreignIds.has(clue.id)||(Number.isFinite(location.lng)&&Number.isFinite(location.lat)&&!isChinaCoordinate([location.lng,location.lat]))||!clue.sourceIds?.some(id=>sources.has(id))||nodes.some(n=>n.id===clue.id))continue;
  const province=window.provinceData.features.find(f=>f.properties.name&&(location.name.includes(f.properties.name)||location.name.includes(f.properties.name.replace(/省|市|壮族自治区|回族自治区|维吾尔自治区|自治区/g,''))));
  if(!province||nodes.some(n=>n.name===province.properties.name))continue;
  nodes.push({id:clue.id,name:province.properties.name,coordinates:province.properties.centroid||province.properties.center,precision:'province',era:'相关资料 · 省域示意',subtitle:'资料涉及 '+location.name+'，地图仅标省域',text:clue.summary,evidence:'区域示意',sources:clue.sourceIds.map(id=>sources.get(id)).filter(Boolean)});
 }
 const routes=(result.routes||[]).filter(r=>r.sourceIds?.some(id=>sources.has(id))&&nodes.some(n=>n.id===r.fromId&&n.precision!=='province')&&nodes.some(n=>n.id===r.toId&&n.precision!=='province'));
 window.routeRevealed=routes.length>0;setMapDataset(nodes,routes);
 $('map-heading').textContent=stops.length?'本次探索的来路':'线索位置尚待确认';$('route-caption').textContent=routes.length?'有来源支持的候选迁徙联系':'中国地点线索 · 不自动组成迁徙路线';$('timeline-title').textContent='本次查询地点';overview();return stops.length;
}
function refreshProvinceLabels(){
 if(!ready)return;
 const placed=[],zoom=map.getZoom(),size=map.getContainer().getBoundingClientRect();
 for(const marker of provinceMarkers){
  const p=map.project(marker.coordinates),width=marker.el.textContent.length*13+12;
  const hidden=zoom>8.5||(zoom<5.3&&marker.small)||p.x<0||p.x>size.width||p.y<0||p.y>size.height||placed.some(item=>Math.abs(item.x-p.x)<(item.width+width)/2+8&&Math.abs(item.y-p.y)<24);
  marker.el.hidden=hidden;if(!hidden)placed.push({x:p.x,y:p.y,width});
 }
}
$('tab-chat').addEventListener('click',()=>showView('chat'));
$('tab-map').addEventListener('click',()=>showView('map'));
$('overview').addEventListener('click',overview);
$('china-overview').addEventListener('click',()=>showChina(true));
$('view-flat').addEventListener('click',()=>setMapPerspective(0));
$('view-tilted').addEventListener('click',()=>setMapPerspective(42));
$('rotate-left').addEventListener('click',()=>rotateMap(-1));
$('rotate-right').addEventListener('click',()=>rotateMap(1));
$('close-history').addEventListener('click',()=>{$('history').hidden=true;resizeMapView();});
window.addEventListener('resize',()=>queueMapFrame(resizeMapView));
$('ask-location').addEventListener('click',()=>{const stop=stops.find(s=>s.id===active);if(!stop)return;showView('chat');$('question').value='关于'+stop.name+'，还有哪些家族历史线索和可查证的来源？';$('question').focus();});
renderStops();
try{
 if(!window.maplibregl)throw new Error('地图组件未加载');
 map=new maplibregl.Map({
  container:'map',style:{version:8,sources:{provinces:{type:'geojson',data:chinaMapData,attribution:'中国省级示意边界：DataV GeoAtlas'}},layers:[
   {id:'background',type:'background',paint:{'background-color':'#edf0e7'}},
   {id:'province-fill',type:'fill',source:'provinces',paint:{'fill-color':['get','shade'],'fill-opacity':1}},
   {id:'province-relief',type:'fill-extrusion',source:'provinces',paint:{'fill-extrusion-color':['get','shade'],'fill-extrusion-height':['interpolate',['linear'],['zoom'],2,9000,5,1200,8,0],'fill-extrusion-base':0,'fill-extrusion-opacity':0.92}},
   {id:'province-border',type:'line',source:'provinces',paint:{'line-color':'#f8faee','line-width':['interpolate',['linear'],['zoom'],3,0.8,7,1.5],'line-opacity':0.95}}
  ]},center:[105,34],zoom:3.5,pitch:42,bearing:0,minZoom:1.3,maxZoom:10,maxPitch:60,renderWorldCopies:true,attributionControl:true
 });
 map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'top-right');
 const timeout=setTimeout(()=>{if(!ready)$('map-status').textContent='地图暂未打开，仍可继续对话查看线索。';},15000);
 map.on('load',()=>{
  ready=true;clearTimeout(timeout);$('map-status').hidden=true;
  document.querySelectorAll('#map-view-controls button').forEach(button=>button.disabled=false);
  const provinces=window.provinceData.features.filter(f=>f.properties.name&&f.properties.center).sort((a,b)=>{
   const area=feature=>{const match=chinaAreas.find(item=>item.rings=== (feature.geometry.type==='Polygon'?feature.geometry.coordinates:feature.geometry.coordinates[0]));return match?(match.bounds[2]-match.bounds[0])*(match.bounds[3]-match.bounds[1]):0;};return area(b)-area(a);
  });
  for(const feature of provinces){
   const p=feature.properties,el=document.createElement('span');el.className='province-label';el.textContent=p.name.replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市/g,'');
   const coordinates=p.centroid||p.center;
   new maplibregl.Marker({element:el}).setLngLat(coordinates).addTo(map);
   provinceMarkers.push({el,coordinates,small:['北京市','天津市','上海市','香港特别行政区','澳门特别行政区'].includes(p.name)});
  }
  map.addSource('route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'route-line',type:'line',source:'route',layout:{visibility:'none'},paint:{'line-color':'#8c6d36','line-width':2.8,'line-dasharray':[2,3],'line-opacity':0.95}});
  syncMap();
  if(active&&stops.some(stop=>stop.id===active)){const hidden=$('history').hidden,toastHidden=$('map-toast').hidden,toast=$('map-toast').textContent;selectStop(active,true,false);$('history').hidden=hidden;$('map-toast').hidden=toastHidden;$('map-toast').textContent=toast;}else showChina();
  updateMapViewControls();refreshProvinceLabels();
 });
 map.on('move',refreshProvinceLabels);
 map.on('moveend',updateMapViewControls);
 map.on('dragend',()=>{
  const center=map.getCenter(),lng=Math.max(chinaExtent[0]-5,Math.min(chinaExtent[2]+5,center.lng)),lat=Math.max(chinaExtent[1]-5,Math.min(chinaExtent[3]+5,center.lat));
  if(Math.abs(lng-center.lng)>1e-6||Math.abs(lat-center.lat)>1e-6)map.jumpTo({center:[lng,lat]});
  updateMapViewControls();
 });
 map.on('error',e=>console.warn('Map source unavailable',e.error?.message));
}catch(e){$('map-status').textContent='地图暂未打开，仍可继续对话查看线索。';}
