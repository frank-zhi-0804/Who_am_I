'use strict';
let basemapUsable=false,basemapFailed=false;
const detailedMapTiles=['https://tile.openstreetmap.org/{z}/{x}/{y}.png'];
function createChinaMask(){return window.chinaOutsideData;}
function updateMapDetail(){
 if(!map?.getLayer('province-fill'))return;
 const usable=basemapUsable&&!basemapFailed;
 for(const [layer,property,value] of [['province-fill','fill-opacity',usable?0:1],['province-relief','fill-extrusion-opacity',0],['province-border','line-opacity',usable?0.22:0.75]])if(map.getPaintProperty(layer,property)!==value)map.setPaintProperty(layer,property,value);
 document.querySelector('.map-shell').dataset.basemap=usable?'ready':basemapFailed?'fallback':'loading';
 $('map-detail-status').textContent=usable?'城市 · 道路 · 水系':basemapFailed?'当前显示省域示意':'正在载入地理底图…';
 $('retry-basemap').hidden=!basemapFailed;
 $('map-scale-label').textContent=map.getZoom()>=6?'城市视野':'中国视野';
 refreshProvinceLabels();
}
function showHomeMap(duration=900){
 if(!ready)return;
 mapFrame='explore';$('history').hidden=true;$('map-toast').hidden=true;
 const version=++cameraIntentVersion,angles=currentMapAngles();
 const show=()=>{
  if(version!==cameraIntentVersion)return;
  if(!mapVisible()){pendingMapCamera=show;return;}
  pendingMapCamera=null;map.stop();map.resize();
  map.easeTo({center:[109.2,32.1],zoom:window.innerWidth<=760?4.6:4.5,...angles,padding:mapPadding(),duration:reduced?0:duration});
 };
 show();
}
function updatePlacePrecision(stop){
 $('place-precision').textContent=stop?.precision==='exact'?'文献标注位置':stop?.precision==='province'?'省域位置示意':'区域位置示意';
}
function collapseHistory(){
 $('history').classList.remove('expanded');$('history-more').setAttribute('aria-expanded','false');$('history-more').textContent='展开详情';
}

function retryDetailedBasemap(){
 const style=map.getStyle(),source=style.sources.basemap,layer=style.layers.find(item=>item.id==='basemap-detail');
 basemapFailed=false;basemapUsable=false;map.stop();
 // Recreate the raster cache so previously failed tiles cannot retain stale textures.
 map.removeLayer('basemap-detail');map.removeSource('basemap');
 map.addSource('basemap',source);map.addLayer(layer,'china-mask');updateMapDetail();
}
