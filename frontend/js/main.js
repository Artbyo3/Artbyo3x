const API_BASE = window.API_BASE || '';

// ── hero parallax ───────────────────────────────────────────────────────────
const heroVideo=document.querySelector('.hero-left video');
const heroName=document.querySelector('.hero-name');
const heroBio=document.querySelector('.hero-bio');
const heroRight=document.querySelector('.hero-right');
const navLogo=document.querySelector('.nav-logo');
document.addEventListener('mousemove',e=>{
  const cx=(e.clientX-window.innerWidth/2)/(window.innerWidth/2);
  const cy=(e.clientY-window.innerHeight/2)/(window.innerHeight/2);
  if(heroVideo) heroVideo.style.transform=`scale(1.1) translate(${cx*15}px,${cy*15}px)`;
  if(heroName)  heroName.style.transform=`translate(${cx*8}px,${cy*8}px)`;
  if(heroBio)   heroBio.style.transform=`translate(${cx*4}px,${cy*4}px)`;
  if(heroRight) heroRight.style.transform=`translate(${cx*12}px,${cy*12}px)`;
  if(navLogo)   navLogo.style.transform=`translate(${cx*5}px,${cy*5}px)`;
});

// ── page switching ────────────────────────────────────────────────────────────
let cur_pg='home';
function show(id){
  if(id===cur_pg)return;
  document.getElementById('pg-'+cur_pg).classList.replace('on','off');
  const next=document.getElementById('pg-'+id);
  setTimeout(()=>{next.scrollTop=0;},250);
  next.classList.replace('off','on');
  cur_pg=id;
  if(id==='2d'||id==='3d') loadGallery(id);
}

// keyboard nav: 1=home, 2=2d, 3=3d, arrows, space
document.addEventListener('keydown',e=>{
  const pages=['home','2d','3d'];
  const idx=pages.indexOf(cur_pg);
  if(e.key==='ArrowRight'||e.key==='ArrowDown'||e.key===' '){e.preventDefault();show(pages[Math.min(idx+1,2)]);}
  if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();show(pages[Math.max(idx-1,0)]);}
  if(e.key==='1') show('home');
  if(e.key==='2') show('2d');
  if(e.key==='3') show('3d');
});

// wheel = page navigation (accumulated delta)
let wheelAccum=0,wheelLocked=false,wheelReset=null;
const WHEEL_THRESH=350;
document.addEventListener('wheel',e=>{
  if(wheelLocked)return;
  const pages=['home','2d','3d'];
  const idx=pages.indexOf(cur_pg);
  const dir=e.deltaY>0?1:-1;
  const nextIdx=Math.max(0,Math.min(2,idx+dir));
  if(nextIdx===idx)return;
  const pg=document.getElementById('pg-'+cur_pg);
  const atBottom=pg.scrollTop+pg.clientHeight>=pg.scrollHeight-8;
  const atTop=pg.scrollTop<=8;
  if(dir>0&&!atBottom){wheelAccum=0;return;}
  if(dir<0&&!atTop){wheelAccum=0;return;}
  wheelAccum+=Math.abs(e.deltaY);
  clearTimeout(wheelReset);
  wheelReset=setTimeout(()=>wheelAccum=0,400);
  if(wheelAccum>=WHEEL_THRESH){
    wheelAccum=0;clearTimeout(wheelReset);
    wheelLocked=true;setTimeout(()=>wheelLocked=false,900);
    show(pages[nextIdx]);
  }
},{passive:true});

// touch swipe
let touchY0=0,touchX0=0;
document.addEventListener('touchstart',e=>{touchY0=e.touches[0].clientY;touchX0=e.touches[0].clientX;},{passive:true});
document.addEventListener('touchend',e=>{
  const dy=touchY0-e.changedTouches[0].clientY;
  const dx=touchX0-e.changedTouches[0].clientX;
  if(Math.abs(dy)<Math.abs(dx)||Math.abs(dy)<90)return;
  const pages=['home','2d','3d'];
  const idx=pages.indexOf(cur_pg);
  const dir=dy>0?1:-1;
  const nextIdx=Math.max(0,Math.min(2,idx+dir));
  if(nextIdx===idx)return;
  const pg=document.getElementById('pg-'+cur_pg);
  if(dir>0&&pg.scrollTop+pg.clientHeight<pg.scrollHeight-8)return;
  if(dir<0&&pg.scrollTop>8)return;
  show(pages[nextIdx]);
},{passive:true});

// ── shaders ───────────────────────────────────────────────────────────────────
const VERT=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;

function mkNoise(h){const hh=(h/360).toFixed(3);return`precision mediump float;
varying vec2 vUv;uniform float u_t;
float hh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.;a*=.5;}return v;}
vec3 hsl(float h,float s,float l){vec3 r=clamp(abs(mod(h*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.);return l+s*(r-.5)*(1.-abs(2.*l-1.));}
void main(){
  float t=u_t*.2;float hv=${hh};
  float n=fbm(vUv*2.8+vec2(t,t*.7));float n2=fbm(vUv*5.5-vec2(t*.5,t));
  vec3 col=mix(hsl(hv,.5,.04),mix(hsl(hv+.04,.6,.13),hsl(hv-.03,.5,.26),n2),n);
  gl_FragColor=vec4(col,1.);}`;
}

function mkWave(h){const hh=(h/360).toFixed(3);return`precision mediump float;
varying vec2 vUv;uniform float u_t;
float hh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.;a*=.5;}return v;}
vec3 hsl(float h,float s,float l){vec3 r=clamp(abs(mod(h*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.);return l+s*(r-.5)*(1.-abs(2.*l-1.));}
void main(){
  vec2 uv=vUv-.5;float r=length(uv);float a=atan(uv.y,uv.x);
  float sw=fbm(vec2(r*5.-u_t*.5,a*2.+u_t*.3));
  float ring=(1.-smoothstep(.04,.38,r))*smoothstep(.015,.09,r)*(.2+.8*sw);
  float hv=${hh};
  vec3 col=mix(hsl(hv,.5,.03),hsl(hv,.65,.14),ring*.9);
  col=mix(col,hsl(hv,.6,.3),ring*ring*.7);
  col+=hsl(hv,.4,.05)*fbm(vUv*3.+u_t*.05);
  gl_FragColor=vec4(col,1.);}`;
}

function mkGrid(h){const hh=(h/360).toFixed(3);return`precision mediump float;
varying vec2 vUv;uniform float u_t;
float hh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p*=2.;a*=.5;}return v;}
vec3 hsl(float h,float s,float l){vec3 r=clamp(abs(mod(h*6.+vec3(0,4,2),6.)-3.)-1.,0.,1.);return l+s*(r-.5)*(1.-abs(2.*l-1.));}
void main(){
  float t=u_t*.32;float hv=${hh};
  float n=fbm(vec2(vUv.x*2.8+t*.4,vUv.y*8.));
  float s=pow(sin((vUv.y+n*.12)*3.14159*10.+t*.5)*.5+.5,4.);
  float f=1.-abs(vUv.x-.5)*2.;
  vec3 col=mix(hsl(hv,.5,.03),hsl(hv,.65,.17),s*f*.9);
  col+=hsl(hv,.4,.05)*fbm(vUv*4.5-t*.15);
  gl_FragColor=vec4(col,1.);}`;
}

function initCanvas(cv,hue,type,watchEl){
  const r=new THREE.WebGLRenderer({canvas:cv,alpha:false,antialias:false});
  r.setPixelRatio(1);
  const s=new THREE.Scene(),cam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const frag=type==='wave'?mkWave(hue):type==='grid'?mkGrid(hue):mkNoise(hue);
  const mat=new THREE.ShaderMaterial({vertexShader:VERT,fragmentShader:frag,uniforms:{u_t:{value:0}}});
  s.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat));
  new ResizeObserver(()=>{r.setSize(cv.offsetWidth||400,cv.offsetHeight||300);}).observe(watchEl);
  r.setSize(cv.offsetWidth||400,cv.offsetHeight||300);
  cv._r=r;cv._s=s;cv._cam=cam;cv._m=mat;
}

// init hero zone canvases
document.querySelectorAll('.hero-zone canvas').forEach(cv=>{
  initCanvas(cv,parseFloat(cv.dataset.phue||'270'),cv.dataset.ps||'noise',cv.closest('.hero-zone'));
});

// ── main loop ─────────────────────────────────────────────────────────────────
const t0=performance.now();
(function loop(){
  const t=(performance.now()-t0)*.001;
  document.querySelectorAll('.hero-zone canvas').forEach(cv=>{
    if(cv._m){cv._m.uniforms.u_t.value=t;cv._r.render(cv._s,cv._cam);}
  });
  if(window.__loopExtras) window.__loopExtras.forEach(fn=>fn(t));
  requestAnimationFrame(loop);
})();

// ── GALLERY LOADER ────────────────────────────────────────────────────────────
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}

async function loadGallery(cat){
  const grid=document.getElementById('grid-'+cat);
  const countEl=document.getElementById('count-'+cat);
  try{
    const r=await fetch(API_BASE+'/api/works/'+cat);
    const works=r.ok?await r.json():[];
    if(countEl) countEl.textContent=works.length+' work'+(works.length!==1?'s':'');
    grid.innerHTML=works.map(w=>{
      const src=`${API_BASE}/uploads/${w.category}/${w.filename}`;
      return `<div class="gc"
        data-hue="${w.hue||270}" data-s="${esc(w.shader||'noise')}"
        data-title="${esc(w.title)}" data-tag="${esc(w.tag)}" data-src="${src}">
        <canvas></canvas>
        <img class="gc-img" src="${src}" alt="${esc(w.title)}" loading="lazy">
        ${cat==='2d'?'<div class="gc-open"></div>':''}
        <div class="gc-meta">
          <div class="gc-tag">${esc(w.tag)}</div>
          <div class="gc-name">${esc(w.title)}</div>
          ${w.note?`<div class="gc-note">${esc(w.note)}</div>`:''}
        </div>
      </div>`;
    }).join('');
    grid.querySelectorAll('.gc').forEach(card=>{
      const cv=card.querySelector('canvas');
      if(cv) initCanvas(cv,parseFloat(card.dataset.hue||'270'),card.dataset.s||'noise',card);
    });
    if(cat==='2d') rebuildLightbox();
  }catch(e){console.error('gallery load failed',e);}
}

window.__loopExtras=window.__loopExtras||[];
window.__loopExtras.push(t=>{
  const gid=cur_pg==='2d'?'grid-2d':cur_pg==='3d'?'grid-3d':null;
  if(!gid)return;
  document.querySelectorAll(`#${gid} .gc canvas`).forEach(cv=>{
    if(cv._m){cv._m.uniforms.u_t.value=t;cv._r.render(cv._s,cv._cam);}
  });
});

// ── LIGHTBOX ─────────────────────────────────────────────────────────────────
const lb       = document.getElementById('lb');
const lbTitle  = document.getElementById('lb-title');
const lbSub    = document.getElementById('lb-sub');
const lbDl     = document.getElementById('lb-dl');
const lbClose  = document.getElementById('lb-close');
const lbPrev   = document.getElementById('lb-prev');
const lbNext   = document.getElementById('lb-next');
const lbStrip  = document.getElementById('lb-strip');
const lbImg    = document.getElementById('lb-img');
const lbCounter= document.getElementById('lb-counter');

let cards2d=[],lbIdx=0,lbOpen=false;

function rebuildLightbox(){
  cards2d=[...document.querySelectorAll('#grid-2d .gc')];
  lbStrip.innerHTML='';
  cards2d.forEach((card,i)=>{
    const thumb=document.createElement('div');
    thumb.className='lb-thumb';
    const img=document.createElement('img');
    img.src=card.dataset.src||'';
    img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
    thumb.appendChild(img);
    lbStrip.appendChild(thumb);
    thumb.addEventListener('click',()=>openLb(i));
  });
  cards2d.forEach((card,i)=>card.addEventListener('click',()=>openLb(i)));
}

function openLb(idx){
  if(!cards2d.length)return;
  lbIdx=((idx%cards2d.length)+cards2d.length)%cards2d.length;
  lbOpen=true;
  lb.classList.add('open');
  document.body.style.overflow='hidden';
  loadLbItem();
}

function closeLb(){
  lbOpen=false;
  lb.classList.remove('open');
  document.body.style.overflow='';
}

function loadLbItem(){
  const card=cards2d[lbIdx];
  const title=card.dataset.title||'';
  const tag=card.dataset.tag||'';
  const src=card.dataset.src||'';
  lbTitle.textContent=title;
  lbSub.textContent=tag;
  lbCounter.textContent=(lbIdx+1)+' / '+cards2d.length;
  lbImg.classList.add('show');
  document.getElementById('lb-canvas-wrap').style.display='none';
  lbImg.src=src;
  document.querySelectorAll('#lb-strip .lb-thumb').forEach((t,i)=>t.classList.toggle('act',i===lbIdx));
  document.querySelectorAll('#lb-strip .lb-thumb')[lbIdx]?.scrollIntoView({inline:'center',behavior:'smooth'});
  lbDl.onclick=()=>{const a=document.createElement('a');a.href=src;a.download=title;a.click();};
}

lbClose.addEventListener('click',closeLb);
lbPrev.addEventListener('click',()=>openLb(lbIdx-1));
lbNext.addEventListener('click',()=>openLb(lbIdx+1));
document.addEventListener('keydown',e=>{
  if(!lbOpen)return;
  if(e.key==='Escape')closeLb();
  if(e.key==='ArrowRight')openLb(lbIdx+1);
  if(e.key==='ArrowLeft')openLb(lbIdx-1);
});
