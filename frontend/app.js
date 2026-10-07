// Bag items are {id, color}; bags saved before colours existed hold plain ids.
const loadCart=()=>{try{const c=JSON.parse(localStorage.getItem('ea-cart')||'[]');return Array.isArray(c)?c.map(x=>typeof x==='string'?{id:x,color:''}:x).filter(x=>x&&x.id):[]}catch{return[]}};
const state={products:[],cart:loadCart(),category:'All'};
// Collection panel: a full-screen product list for the current address (/men, /brand/armani…; see viewFor). fromPage: the address was set by navigating inside the site, so closing can go back.
// Filter panel (all optional, combined): q: search words; min / max: price range (null = no limit; top: the view's
// highest price); sort: new | sale | price-asc | price-desc; types: chosen product types (Category); brands; colors;
// sizes: chosen clothing and shoe sizes. inView: the view's pieces. open: Category groups whose types are shown (their + button).
const coll={key:null,view:null,inView:[],q:'',min:null,max:null,top:0,sort:'new',genders:[],types:[],brands:[],colors:[],sizes:{clothing:[],shoes:[]},open:[],fromPage:false};
const clearFilters=()=>Object.assign(coll,{q:'',min:null,max:null,genders:[],types:[],brands:[],colors:[],sizes:{clothing:[],shoes:[]}});
// The panel edits a draft (the fields above); the grid shows coll.applied, which Apply or a click outside the panel copy
// from the draft. Opening the panel starts the draft from what is applied, so closing it with × or Escape drops changes.
const pick=f=>({q:f.q,min:f.min,max:f.max,sort:f.sort,genders:[...f.genders],types:[...f.types],brands:[...f.brands],colors:[...f.colors],sizes:{clothing:[...f.sizes.clothing],shoes:[...f.sizes.shoes]}});
coll.applied=pick(coll);
const toggled=(list,v)=>list.includes(v)?list.filter(x=>x!==v):[...list,v];
// Product types (the "type" field in products.json) listed under the Jewellery and Shoes menus, and the care guide; see catalog.js.
const GROUPS=EA_CATALOG.groups, CARE=EA_CATALOG.care;
const $=s=>document.querySelector(s), money=n=>EA_I18N.lang==='sq'?`${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'\u00a0')}\u00a0€`:new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n); // Albanian: 1 250 € (written out: browsers may lack Albanian number formats)
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''), cap=s=>s[0].toUpperCase()+s.slice(1);
const inCategory=(p,c)=>p.category===c||p.category==='Unisex';
// Colours a product comes in, set in the CRM (older products have a single `color` / `colorHex`); the first is the main one.
const productColors=p=>p.colors||(p.color?[{name:p.color,hex:p.colorHex}]:[]);
const swatch=c=>`<span class="pdp-swatch${c.hex?'':' empty'}"${c.hex?` style="background:${esc(c.hex)}"`:''}></span>`;
// Sizes with their stock, set in the CRM ({size, qty}); products without sizes are one size.
const productSizes=p=>p.sizes||[], inStockSizes=p=>productSizes(p).filter(s=>s.qty>0).map(s=>s.size);
// Size charts (clothing / shoes / kids…, see catalog.js). A typed shoe size matches numerically, so "38,5" finds 38.5.
const SIZE_TYPES=EA_CATALOG.sizeTypes, sizeKind=EA_CATALOG.sizeKind;
const sizeNum=v=>/^\s*\d+([.,]\d+)?\s*$/.test(v)?parseFloat(String(v).replace(',','.')):NaN;
const sameSize=(a,b)=>{const x=sizeNum(a),y=sizeNum(b);return Number.isNaN(x)||Number.isNaN(y)?String(a).trim().toLowerCase()===String(b).trim().toLowerCase():x===y};
// Discount (percent off, set in the CRM): what customers pay, used for display, sorting, the price filter and the bag.
const priceOf=p=>p.discount?Math.round(p.price*(100-p.discount)/100):p.price;
const priceHtml=p=>p.discount?`<s class="price-was">${money(p.price)}</s> <span class="price-now">${money(priceOf(p))}</span> <span class="price-off">−${p.discount}%</span>`:money(p.price);
// New arrivals (home page section and /new-arrivals): pieces ticked "New arrival" in the CRM, newest first, topped up
// with the latest other pieces to at least min (8 on /new-arrivals). Only ticked pieces get the "New arrival" label.
const newArrivals=(min=8)=>{const newest=state.products.slice().reverse(),ticked=newest.filter(p=>p.isNew);return ticked.length>=min?ticked:[...ticked,...newest.filter(p=>!p.isNew).slice(0,min-ticked.length)]};
const newBadge=p=>p.isNew?`<span class="badge-new">${tr('New arrival')}</span>`:'';
// Brand logo (assets/brands/<brand>.png). All logo files share one canvas height, so a single CSS height sizes them
// while keeping their relative sizes; a brand without a logo file falls back to its name. ?v= busts old cached cuts.
const brandLogo=b=>`<img src="/assets/brands/${slug(b)}.png?v=2" alt="${esc(b)}" onerror="this.replaceWith(this.alt)">`;
// #all, #men, #women, #watches, #jewellery[/type], #shoes[/type], #brand/<brand>, #search/<query> -> {title, test, brand?, search?}; any other hash -> null.
function viewFor(r){if(/^search\//i.test(r)){let q='';try{q=decodeURIComponent(r.slice(7)).trim()}catch{}return q?{title:tr('Results for “{q}”',{q}),test:p=>matchesSearch(p,q),search:true}:null}const[a,b]=r.toLowerCase().split('/');if(a==='all')return{title:tr('All products'),test:()=>true};if(a==='new-arrivals'){const fresh=new Set(newArrivals());return{title:tr('New Arrivals'),test:p=>fresh.has(p),noSort:['new','sale'],gender:true}}if(a==='sale')return{title:tr('On Sale'),test:p=>p.discount>0,noSort:['new','sale'],gender:true};if(SHOP_GROUPS[a]){const c=cap(a),inC=a==='kids'?p=>p.category==='Kids':p=>inCategory(p,c);if(!b)return{title:tr(c),test:inC};const g=SHOP_GROUPS[a].groups.find(x=>slug(x)===b);return g?{title:tr(a==='kids'?'Kids’ {g}':`${c}’s {g}`,{g:tr(g)}),test:p=>inC(p)&&EA_CATALOG.typeGroup(p.type)===g}:null}if(a==='watches')return{title:tr('Watches'),test:p=>p.type==='Watches'};if(GROUPS[a]){const types=b?GROUPS[a].filter(t=>slug(t)===b):GROUPS[a];return types.length?{title:tr(b?types[0]:cap(a)),test:p=>types.includes(p.type)}:null}if(a==='brand'){const brand=[...new Set(state.products.map(p=>p.brand))].find(x=>slug(x)===b);return brand?{title:brand,test:p=>p.brand===brand,brand:true}:null}return null}
async function json(url,opts={}){const r=await fetch(url,{...opts,headers:{...opts.headers,'X-Lang':EA_I18N.lang}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.message||tr('Request failed ({status})',{status:r.status})),{status:r.status,field:d.field});return d}
async function init(){try{const[products,brands]=await Promise.all([json('/api/products'),json('/api/brands')]);state.products=products;state.brands=brands;$('#brandRow').innerHTML=brands.map(b=>`<a class="brand-pill" href="/brand/${slug(b)}">${brandLogo(b)}</a>`).join('');renderMenu(brands)}catch(err){$('#productGrid').innerHTML=`<div class="empty">${esc(tr('The collection could not be loaded. Is the backend running? ({msg})',{msg:err.message}))}</div>`;document.documentElement.classList.remove('opening');return}renderProducts();renderCart();await loadAccount();const h=$('.site-header'),cover=document.documentElement.classList.contains('opening');if(cover)h.classList.add('no-anim');route();document.documentElement.classList.remove('opening');if(cover)requestAnimationFrame(()=>requestAnimationFrame(()=>h.classList.remove('no-anim')))} // the page is showing: drop the cover (index.html); opened at a store page, the header takes its size without animating
const productCard=p=>`<article class="product-card"><a class="product-image" href="/product/${esc(p.id)}"><img src="${esc(p.image)}" alt="${esc(p.brand)} ${esc(p.name)}">${newBadge(p)}</a><div class="product-meta"><div class="product-brand">${esc(p.brand)}</div><h3 class="product-name"><a href="/product/${esc(p.id)}">${esc(p.name)}</a></h3><div class="product-row"><span class="product-price">${priceHtml(p)}</span>${productSizes(p).length?`<a class="add-btn" href="/product/${esc(p.id)}">${inStockSizes(p).length?tr('Select size'):tr('Sold out')}</a>`:`<button class="add-btn" data-add="${esc(p.id)}" data-color="${esc(productColors(p)[0]?.name)}">${tr('Add to bag')}</button>`}</div></div></article>`;
// Home grid: the New Arrivals (search has its own panel and collection view).
// Home page New Arrivals: the 12 newest; CSS shows the full rows and fades one more row out above See more (/new-arrivals).
function renderProducts(){const rows=newArrivals(12).filter(p=>state.category==='All'||inCategory(p,state.category)).slice(0,12);$('#productGrid').innerHTML=rows.length?rows.map(productCard).join(''):`<div class="empty">${tr('No pieces found.')}</div>`}
// The faded row's cards carry a fade layer (styles.css); a click on it opens See more's page, the same as the button.
$('#productGrid').addEventListener('click',e=>{const card=e.target.closest('.product-card');if(card&&e.target===card&&getComputedStyle(card,'::after').content!=='none')$('.see-more').click()});
// Sort "New arrivals": pieces ticked "New arrival" first, each group newest first (the product added last in products.json).
// "On sale": discounted pieces first, the biggest discount first, then the rest as new arrivals.
const sizeFamily=p=>sizeKind(p).endsWith('shoes')?'shoes':'clothing';
// Gender (Filter panel on New Arrivals and On Sale): a Unisex piece counts as both Women and Men.
const GENDERS=['Women','Men','Kids'],gendersOf=p=>p.category==='Unisex'?['Women','Men']:GENDERS.includes(p.category)?[p.category]:[];
// Sections of the Filter panel per page. Brand pages have no Brands section (the brand is the page); only views marked
// gender (New Arrivals, On Sale) have a Gender section. A view's noSort
// leaves those Sort options out: New Arrivals and On Sale offer only the price sorts (newest first until one is picked;
// clicking the picked one again goes back to that).
const filterSections=view=>['search','price','sort','gender','category','brand','colour','size-clothing','size-shoes'].filter(s=>!(s==='brand'&&view.brand)&&!(s==='gender'&&!view.gender));
// A piece passes filters f (the applied ones, or the panel's draft) on everything but size.
const passes=(f,top)=>{const lo=f.min??0,hi=f.max??top,q=f.q.trim();return p=>(!q||matchesSearch(p,q))&&priceOf(p)>=lo&&priceOf(p)<=hi&&(!f.genders.length||gendersOf(p).some(g=>f.genders.includes(g)))&&(!f.types.length||f.types.includes(p.type||'Other'))&&(!f.brands.length||f.brands.includes(p.brand))&&(!f.colors.length||productColors(p).some(c=>f.colors.includes(c.name)))};
function renderCollection(){const inView=coll.inView=state.products.filter(coll.view.test),top=coll.top=inView.length?Math.max(...inView.map(priceOf)):0;
// what this view offers: product types per group, colours (with their swatch), in-stock sizes per size family
const opts={genders:new Set(),types:{},colors:new Map(),sizes:{clothing:new Set(),shoes:new Set()}};for(const p of inView){for(const x of gendersOf(p))opts.genders.add(x);const g=EA_CATALOG.typeGroup(p.type)||'Other';(opts.types[g]||=new Set()).add(p.type||'Other');for(const c of productColors(p))if(!opts.colors.get(c.name))opts.colors.set(c.name,c.hex||'');for(const sz of inStockSizes(p))opts.sizes[sizeFamily(p)].add(sz)}
coll.opts=opts;for(const f of [coll,coll.applied]){f.genders=f.genders.filter(g=>opts.genders.has(g));f.types=f.types.filter(t=>inView.some(p=>(p.type||'Other')===t));f.colors=f.colors.filter(c=>opts.colors.has(c));for(const k in f.sizes)f.sizes[k]=f.sizes[k].filter(v=>opts.sizes[k].has(v));if(f.max!==null&&f.max>=top)f.max=null;if(f.min!==null&&f.min>(f.max??top))f.min=null}
const a=coll.applied,picked=Object.entries(a.sizes).filter(([,v])=>v.length),sizeOk=p=>!picked.length||picked.some(([f,v])=>sizeFamily(p)===f&&inStockSizes(p).some(x=>v.some(y=>sameSize(x,y))));
const rows=inView.filter(passes(a,top)).filter(sizeOk);
if(a.sort==='new'||a.sort==='sale'){rows.reverse();rows.sort((x,y)=>(y.isNew?1:0)-(x.isNew?1:0));if(a.sort==='sale')rows.sort((x,y)=>(y.discount||0)-(x.discount||0))}else rows.sort((x,y)=>a.sort==='price-asc'?priceOf(x)-priceOf(y):priceOf(y)-priceOf(x));
$('#collectionCount').textContent=tr(rows.length===1?'{n} piece':'{n} pieces',{n:rows.length});$('#collectionGrid').innerHTML=rows.length?rows.map(productCard).join(''):`<div class="empty">${tr(inView.length?'No pieces match these filters.':coll.view.search?'Nothing matches this search. Try a brand name, or a piece such as “blazer” or “sandal”.':'New pieces are arriving soon.')}</div>`;renderChips();renderFilters()}
// Filter panel. Lists are only rebuilt when their options change, never while a customer drags or types; their
// ticks are set again on every change.
const rebuild=(el,key,html)=>{if(el.dataset.key!==key){el.dataset.key=key;el.innerHTML=html}};
const tick=(attr,v,label,extra='')=>`<label class="f-check"><input type="checkbox" ${attr}="${esc(v)}"${extra}><span>${esc(label)}</span></label>`;
const typeLabel=(t,g)=>t===g||t==='Other'?'Other':t; // a piece typed just "Clothing" is Clothing › Other
function renderFilters(){const opts=coll.opts,show=filterSections(coll.view),sec=n=>$(`#filterDrawer [data-sec="${n}"]`);
document.querySelectorAll('#filterDrawer .filter-sec').forEach(x=>{x.hidden=!show.includes(x.dataset.sec)});
const fq=$('#fSearch');if(document.activeElement!==fq)fq.value=coll.q;
// Price: two handles on one line from €0 to the view's highest price (after discounts), in €1 steps. The handle nearer
// the end it can move to sits on top, so two handles at the same spot can always be pulled apart.
const top=coll.top,lo=coll.min??0,hi=coll.max??top;if(!top)sec('price').hidden=true;for(const[el,v,name]of[[$('#fMin'),lo,'Lowest price {v}'],[$('#fMax'),hi,'Highest price {v}']]){el.max=top;el.value=v;el.setAttribute('aria-valuetext',tr(name,{v:money(v)}))}
$('#fMin').style.zIndex=lo>top/2?3:1;$('#fFill').style.left=`${top?lo/top*100:0}%`;$('#fFill').style.width=`${top?(hi-lo)/top*100:0}%`;$('#fValues').textContent=`${money(lo)} – ${money(hi)}`;
document.querySelectorAll('#fSort [data-sort]').forEach(b=>{b.hidden=!!coll.view.noSort?.includes(b.dataset.sort);b.setAttribute('aria-pressed',b.dataset.sort===coll.sort)});
// Gender: Women, Men, Kids, those with pieces in this view.
const genders=GENDERS.filter(g=>opts.genders.has(g));if(!genders.length)sec('gender').hidden=true;
rebuild($('#fGenders'),genders.join('|'),genders.map(g=>tick('data-gender',g,tr(g))).join(''));$('#fGenders').querySelectorAll('[data-gender]').forEach(i=>{i.checked=coll.genders.includes(i.dataset.gender)});
// Category: the main groups (catalog.js), each with a + that shows its types; ticking a group ticks all its types.
const groups=[...GROUP_NAMES,'Other'].filter(g=>opts.types[g]);if(!groups.length)sec('category').hidden=true;
rebuild($('#fCats'),groups.map(g=>g+':'+[...opts.types[g]].join(',')).join('|'),groups.map(g=>{const types=[...opts.types[g]].sort((a,b)=>typeLabel(a,g)==='Other'?1:typeLabel(b,g)==='Other'?-1:a.localeCompare(b)),many=types.length>1;return `<div class="f-group"><div class="f-row">${tick('data-cat-group',g,tr(g),` data-of="${esc(types.join('|'))}"`)}${many?`<button type="button" class="f-more" data-more="${esc(g)}" aria-expanded="false" aria-label="${esc(tr('{g}: show its types',{g:tr(g)}))}">+</button>`:''}</div>${many?`<div class="f-types" data-types="${esc(g)}" hidden>${types.map(t=>tick('data-cat-type',t,tr(typeLabel(t,g)))).join('')}</div>`:''}</div>`}).join(''));
$('#fCats').querySelectorAll('[data-cat-group]').forEach(i=>{const of=i.dataset.of.split('|'),n=of.filter(t=>coll.types.includes(t)).length;i.checked=n===of.length;i.indeterminate=n>0&&n<of.length});
$('#fCats').querySelectorAll('[data-cat-type]').forEach(i=>{i.checked=coll.types.includes(i.dataset.catType)});
$('#fCats').querySelectorAll('[data-more]').forEach(b=>{const open=coll.open.includes(b.dataset.more);b.setAttribute('aria-expanded',open);b.textContent=open?'−':'+';$(`#fCats [data-types="${CSS.escape(b.dataset.more)}"]`).hidden=!open});
// Brands: all of them.
rebuild($('#fBrands'),state.brands.join('|'),state.brands.map(b=>tick('data-brand',b,b)).join(''));$('#fBrands').querySelectorAll('[data-brand]').forEach(i=>{i.checked=coll.brands.includes(i.dataset.brand)});
// Colour: two columns.
const colors=[...opts.colors.keys()].sort((a,b)=>a.localeCompare(b));if(!colors.length)sec('colour').hidden=true;
rebuild($('#fColors'),colors.join('|'),colors.map(c=>{const hex=opts.colors.get(c);return `<button type="button" data-filter-color="${esc(c)}"><span class="sq${hex?'':' none'}"${hex?` style="background:${esc(hex)}"`:''}></span>${esc(c)}</button>`}).join(''));
$('#fColors').querySelectorAll('[data-filter-color]').forEach(b=>b.setAttribute('aria-pressed',coll.colors.includes(b.dataset.filterColor)));
// Sizes: clothing and shoes apart, each the sizes in stock among the pieces the rest of the panel leaves (so ticking
// Bags hides both, ticking Shoes keeps only Shoe sizes). A picked size the panel no longer offers is let go.
const pool={clothing:new Set(),shoes:new Set()};for(const p of coll.inView.filter(passes(coll,top)))for(const sz of inStockSizes(p))pool[sizeFamily(p)].add(sz);
for(const f of ['clothing','shoes']){coll.sizes[f]=coll.sizes[f].filter(v=>pool[f].has(v));const sizes=EA_CATALOG.sortSizes([...pool[f]]),box=$(`#filterDrawer [data-size-family="${f}"]`);if(!sizes.length)sec(`size-${f}`).hidden=true;
rebuild(box,sizes.join('|'),sizes.map(v=>`<button type="button" data-size-v="${esc(v)}">${esc(v)}</button>`).join(''));box.querySelectorAll('[data-size-v]').forEach(b=>b.setAttribute('aria-pressed',coll.sizes[f].includes(b.dataset.sizeV)))}
$('#filterClear').hidden=!activeCount(coll)&&coll.sort==='new';
document.querySelectorAll('#filterDrawer .f-list').forEach(markMore)}
const activeCount=f=>(f.q.trim()?1:0)+(f.min!==null||f.max!==null?1:0)+f.genders.length+f.types.length+f.brands.length+f.colors.length+f.sizes.clothing.length+f.sizes.shoes.length;
// Applied filters as chips beside the Filter button, each with × to remove it (applied at once). A whole Category group
// is one chip. The row keeps the bar's height and scrolls sideways when the chips don't fit.
const SORT_NAMES={sale:'On Sale','price-asc':'Price: Low to High','price-desc':'Price: High to Low'};
function renderChips(){const a=coll.applied,o=coll.opts,chips=[];if(a.q.trim())chips.push(['q','',`“${a.q.trim()}”`]);if(a.min!==null||a.max!==null)chips.push(['price','',`${money(a.min??0)} – ${money(a.max??coll.top)}`]);if(a.sort!=='new')chips.push(['sort','',tr(SORT_NAMES[a.sort])]);for(const g of a.genders)chips.push(['gender',g,tr(g)]);
for(const g of [...GROUP_NAMES,'Other'].filter(x=>o.types[x])){const of=[...o.types[g]];if(of.length>1&&of.every(t=>a.types.includes(t)))chips.push(['group',g,tr(g)]);else for(const t of of)if(a.types.includes(t))chips.push(['type',t,typeLabel(t,g)==='Other'?tr('{g}: other',{g:tr(g)}):tr(t)])}
for(const b of a.brands)chips.push(['brand',b,b]);for(const c of a.colors)chips.push(['colour',c,c,o.colors.get(c)]);for(const f of ['clothing','shoes'])for(const v of a.sizes[f])chips.push([`size-${f}`,v,tr(f==='shoes'?'Shoe size {v}':'Size {v}',{v})]);
$('#activeFilters').innerHTML=chips.map(([k,v,label,hex])=>`<span class="af-chip">${hex!==undefined?`<span class="af-sw${hex?'':' none'}"${hex?` style="background:${esc(hex)}"`:''}></span>`:''}${esc(label)}<button type="button" data-unfilter="${k}" data-value="${esc(v)}" aria-label="${esc(tr('Remove filter: {label}',{label}))}">×</button></span>`).join('');
const n=activeCount(a);$('#filterCount').textContent=n?` (${n})`:''}
// Apply (or a click outside the panel): the draft becomes the applied filters, shown after the brand loader. Nothing
// changed: the panel just closes.
function applyFilters(){const changed=JSON.stringify(pick(coll))!==JSON.stringify(coll.applied);closeFilters();if(changed)showApplied(pick(coll))}
function showApplied(f){coll.applied=f;Object.assign(coll,pick(f));showLoader();renderCollection();$('#collection').scrollTo({top:0})}
// A list that scrolls fades out at the bottom while there is more below it.
function markMore(el){el.classList.toggle('more',el.scrollTop+el.clientHeight<el.scrollHeight-2)}
function openFilters(){Object.assign(coll,pick(coll.applied));renderFilters();$('#filterDrawer').classList.add('open');syncOverlay();$('#filterClose').focus()}
function closeFilters(){$('#filterDrawer').classList.remove('open');syncOverlay()}
// Loading a collection (opening it, applying filters, removing one): the EA mark fills from the bottom up (CSS, 1.2s),
// holds, then fades out, where the pieces go; the title, count and filter bar above stay on screen. (The full-screen
// #loader only covers the page while the site itself loads at a store address, see index.html.)
let loaderTimer;
function showLoader(){const l=$('#gridLoading');clearTimeout(loaderTimer);l.classList.remove('done');l.hidden=false;$('#collection').classList.add('loading');$('#collectionGrid').setAttribute('aria-busy','true');loaderTimer=setTimeout(()=>{l.classList.add('done');loaderTimer=setTimeout(hideLoader,350)},1500)}
function hideLoader(){clearTimeout(loaderTimer);$('#gridLoading').hidden=true;$('#collection').classList.remove('loading');$('#collectionGrid').removeAttribute('aria-busy')}
// The page behind full-screen panels doesn't scroll; the overlay dims the page while a drawer is open.
// Shared header: when the top open panel is marked data-site-header (My account), the site header, and with it the
// ☰ menu, search, account and bag, stays on top of it in its solid form (body.with-header). Other panels keep their own bar.
const PANELS=['#collection','#product','#checkout','#account','#page'];
function syncLock(){const open=PANELS.map(s=>$(s)).filter(p=>!p.hidden),top=open.sort((a,b)=>getComputedStyle(b).zIndex-getComputedStyle(a).zIndex)[0];document.body.classList.toggle('locked',open.length>0);document.body.classList.toggle('with-header',!!top&&top.hasAttribute('data-site-header'));syncHeader()}
// Header: always shown. Transparent at the top of the page (over the hero), solid once the page has left the top,
// and always solid with the shared header on a panel.
let hdrRaf=0;
function syncHeader(){hdrRaf=0;const h=$('.site-header');h.classList.toggle('is-solid',document.body.classList.contains('with-header')||scrollY>h.offsetHeight)}
function syncOverlay(){$('#overlay').classList.toggle('show',['#cartDrawer','#sideMenu','#infoDrawer','#filterDrawer','#searchPanel'].some(s=>$(s).classList.contains('open')))}
function openCollection(key,view){showLoader();if(coll.key!==key){clearFilters();coll.applied=pick(coll);coll.open=[]}coll.key=key;coll.view=view;if(view.noSort?.includes(coll.applied.sort))coll.sort=coll.applied.sort='new'; // a sort this page doesn't offer goes back to newest first
$('#collectionTitle').textContent=view.title;renderCollection();$('#collection').hidden=false;$('#collection').scrollTop=0;syncLock()}
function closeCollection(){hideLoader();closeFilters();$('#collection').hidden=true;syncLock()}
// Pages still being built ("under construction"): the My Account links in the ☰ menu and Terms of Service. Account
// pages need a signed-in customer: signed out, the sign-in opens at /account?next=<page> and brings them back to it.
const PAGES={'account/track-orders':{title:'Track Orders',auth:true},'account/wishlist':{title:'Wishlist',auth:true},'account/order-history':{title:'Order History',auth:true},'account/returns':{title:'Returns',auth:true},terms:{title:'Terms of Service'}};
// Where to go after signing in: only one of the account pages above, never another site.
const nextPage=()=>{const n=new URLSearchParams(location.search).get('next')||'';return PAGES[n.slice(1)]?.auth?n:''};
function openPage(r){const pg=PAGES[r],back=$('#pageBack');$('#pageKicker').textContent=pg.auth?tr('My account'):'EA Luxury';$('#pageTitle').textContent=tr(pg.title);back.href=pg.auth?'/account':'/';back.textContent=tr(pg.auth?'Back to My account':'Back to the store');$('#page').hidden=false;$('#page').scrollTop=0;syncLock()}
function closePage(){$('#page').hidden=true;syncLock()}
// Pages have plain addresses: / (home), /men, /brand/<brand>, /search/<words>, /product/<id>, /checkout, /account.
// In-site links change the page without reloading (go: history.pushState, then route). Sections of the home page
// (#story, #visit, …) are scrolled to and never go into the address bar; from another page, the home page opens first.
const sectionFor=hash=>{let el=null;try{el=hash.length>1&&document.getElementById(decodeURIComponent(hash.slice(1)))}catch{}return el&&el.closest('main')?el:null};
function scrollToSection(el){const below=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr-solid-h'))||0;scrollTo({top:Math.max(0,el.getBoundingClientRect().top+scrollY-below)})}
function go(url){if(url!==location.pathname+location.search)history.pushState(null,'',url);coll.fromPage=true;closeSearch();route();if(url==='/')scrollTo({top:0})}
const IN_SITE=/^\/(?!\/|admin(\/|$)|api\/|assets\/)/; // the CRM, the API and files load normally
document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a||e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.target)return;const href=a.getAttribute('href'),el=sectionFor(href);if(el){e.preventDefault();if(location.pathname!=='/')go('/');scrollToSection(el)}else if(IN_SITE.test(href)){e.preventDefault();go(href)}});
// /checkout and /product/<id> open on top of whatever is open (a collection underneath stays as it was); other
// addresses go to viewFor, and one that matches nothing shows the home page at /. Old links (/#men) move to /men;
// with a home-page section (/#visit) they scroll there.
function route(){if(location.hash){const h=location.hash,section=sectionFor(h);history.replaceState(null,'',section?location.pathname+location.search:'/'+h.slice(1));if(section){route();return scrollToSection(section)}}
const r=location.pathname.replace(/^\/+|\/+$/g,'');const pg=PAGES[r];if(pg&&pg.auth&&!acct.account){history.replaceState(null,'',`/account?next=${encodeURIComponent('/'+r)}`);return route()}if(r==='account'&&acct.account&&nextPage()){history.replaceState(null,'',nextPage());return route()}if(r==='account'){closeCheckout();closePage();return openAccount()}closeAccount();if(pg){closeCheckout();closeProduct();closeCollection();return openPage(r)}closePage();if(r==='checkout')return openCheckout();closeCheckout();const m=/^product\/(.+)$/.exec(r);let id='';try{id=m?decodeURIComponent(m[1]):''}catch{}const product=id&&state.products.find(p=>p.id===id);if(product)return openProduct(product);closeProduct();const key=r.toLowerCase(),view=r&&state.products.length?viewFor(r):null;if(!view){if(r&&state.products.length)history.replaceState(null,'','/');return closeCollection()}if(coll.key!==key||$('#collection').hidden)openCollection(key,view)}

// Product page: media gallery, Find a store / Add to bag, Info & Details and Product care drawers.
const pdp={product:null,index:0,colorIndex:0};
const productMedia=p=>p.media&&p.media.length?p.media:[{type:'image',src:p.image}];
// Opening from a collection filtered by colour preselects that colour.
function openProduct(p){if(pdp.product!==p){pdp.product=p;pdp.index=0;pdp.size=(c=>c.length===1&&inStockSizes(p).find(s=>sameSize(s,c[0]))||'')(coll.sizes[sizeFamily(p)]);pdp.colorIndex=Math.max(0,productColors(p).findIndex(c=>coll.colors.includes(c.name)))}renderProduct();$('#product').hidden=false;$('#product').scrollTop=0;syncLock()}
// One colour: shown as text. Several: a dropdown; the chosen colour goes into the bag with the product.
function renderColorPicker(){const colors=productColors(pdp.product),cur=colors[pdp.colorIndex]||colors[0];
$('#pdpColor').innerHTML=!cur?'':colors.length===1?`<b>${tr('Color:')}</b> ${swatch(cur)}${esc(cur.name)}`:`<b>${tr('Color:')}</b><div class="color-select"><button class="color-current" id="pdpColorBtn" aria-haspopup="listbox" aria-expanded="false" aria-label="${esc(tr('Color: {c}, choose another colour',{c:cur.name}))}">${swatch(cur)}<span>${esc(cur.name)}</span><span class="caret" aria-hidden="true"></span></button><ul class="color-options" id="pdpColorList" role="listbox" aria-label="${tr('Colours')}" hidden>${colors.map((c,i)=>`<li role="option" data-color-index="${i}" aria-selected="${i===pdp.colorIndex}" tabindex="-1">${swatch(c)}${esc(c.name)}</li>`).join('')}</ul></div>`;
$('#pdpAdd').dataset.color=cur?cur.name:''}
// Size buttons (sold-out sizes can't be chosen). A product with sizes needs one chosen before it goes in the bag.
function renderSizePicker(){const p=pdp.product,list=productSizes(p),add=$('#pdpAdd'),box=$('#pdpSizes');
if(!list.length){box.innerHTML='';delete add.dataset.needSize;delete add.dataset.size;add.disabled=false;add.textContent=tr('Add to bag');return}
const sizes=EA_CATALOG.sortSizes(list.map(s=>s.size)).map(n=>list.find(s=>s.size===n)),cur=sizes.find(s=>s.size===pdp.size&&s.qty>0),soldOut=!sizes.some(s=>s.qty>0);if(!cur)pdp.size='';
box.innerHTML=`<p class="pdp-size-label"><b>${tr('Size:')}</b> ${cur?esc(cur.size):`<span>${tr('Select a size')}</span>`}</p><div class="size-chips">${sizes.map(s=>`<button data-size="${esc(s.size)}" aria-pressed="${s.size===pdp.size}"${s.qty?'':` disabled aria-label="${esc(tr('{s}, sold out',{s:s.size}))}"`}>${esc(s.size)}</button>`).join('')}</div><p class="pdp-size-msg" id="pdpSizeMsg" role="alert">${cur&&cur.qty<=3?tr('Only {n} left in this size',{n:cur.qty}):''}</p>`;
add.dataset.needSize='1';add.dataset.size=pdp.size;add.disabled=soldOut;add.textContent=tr(soldOut?'Sold out':'Add to bag')}
function closeProduct(){closeInfo();$('#product').hidden=true;$('#pdpStage').innerHTML='';syncLock()}
function renderProduct(){const p=pdp.product,media=productMedia(p),m=media[pdp.index]||media[0];$('#pdpBrand').textContent=p.brand;$('#pdpName').textContent=p.name;$('#pdpPrice').innerHTML=priceHtml(p);renderColorPicker();renderSizePicker();$('#pdpAdd').dataset.add=p.id;
$('#pdpStage').innerHTML=(m.type==='video'?`<video src="${esc(m.src)}" controls playsinline preload="metadata"></video>`:`<img src="${esc(m.src)}" alt="${esc(p.brand)} ${esc(p.name)}">`)+newBadge(p);
$('#pdpThumbs').innerHTML=media.length>1?media.map((x,i)=>`<button class="pdp-thumb${i===pdp.index?' active':''}" data-media="${i}" aria-label="${tr(x.type==='video'?'Show video {i} of {n}':'Show photo {i} of {n}',{i:i+1,n:media.length})}">${x.type==='video'?`<video src="${esc(x.src)}#t=0.1" muted playsinline preload="metadata"></video><span class="play" aria-hidden="true">▶</span>`:`<img src="${esc(x.src)}" alt="">`}</button>`).join(''):'';
const group=Object.keys(GROUPS).find(g=>GROUPS[g].includes(p.type)),main=EA_CATALOG.typeGroup(p.type),cat=slug(p.category),inMenu=SHOP_GROUPS[cat]?.groups.includes(main);const crumbs=[[tr('Home'),'/'],p.category!=='Unisex'&&[tr(p.category),`/${cat}`],inMenu?[tr(main),`/${cat}/${slug(main)}`]:p.type&&[tr(p.type),group?`/${group}/${slug(p.type)}`:''],[p.name,'']].filter(Boolean);
$('#pdpCrumbs').innerHTML=crumbs.map(([t,h])=>h?`<a href="${h}">${esc(t)}</a>`:`<span>${esc(t)}</span>`).join('<span aria-hidden="true"> / </span>');
$('#pdpInfo').hidden=!(p.description||p.composition||p.details?.length||p.code);$('#pdpCare').hidden=!(p.care?.length||p.composition||p.careNote)}
const section=(title,body)=>body?`<h3>${tr(title)}</h3>${body}`:'', para=t=>t?`<p>${esc(t)}</p>`:'';
function openInfo(kind){const p=pdp.product;let title,html;
if(kind==='info'){title=tr('Info & Details');html=section('Product Description',p.description&&`<p class="clamp" id="infoDesc">${esc(p.description)}</p><button class="read-more" id="readMore" hidden>${tr('Read More')}</button>`)+section('Composition',para(p.composition))+section('Details',p.details?.length&&`<p>${p.details.map(esc).join('<br>')}</p>`)+section('Product code',para(p.code))}
else if(kind==='care'){title=tr('Product care');html=`<p>${tr('For each product, you can find information for optimal care of your garments both on the website as well as on the labels of our garments.')}</p>`+section('Composition',para(p.composition))+section('Directions for garment care',(p.care||[]).map(k=>CARE.find(c=>c.key===k)).filter(Boolean).map(c=>`<div class="care-item"><h4>${c.svg}<span>${esc(tr(c.title))}</span></h4><p>${esc(tr(c.text))}</p></div>`).join(''))+section('Care notes',para(p.careNote))}
else{title=tr('Find a store');html=`<p>${tr('See this piece in person at an EA Luxury boutique. Leave your details and a client advisor will contact you about availability and arrange your visit.')}</p><form class="store-form" id="storeForm"><label>${tr('Name')}<input name="name" required maxlength="120" autocomplete="name"></label><label>${tr('Email')}<input name="email" type="email" required autocomplete="email"></label><button>${tr('Request an appointment')}</button><p class="store-msg" id="storeMsg" role="status"></p></form>`}
$('#infoTitle').textContent=title;$('#infoBody').innerHTML=html;$('#infoBody').scrollTop=0;$('#infoDrawer').classList.add('open');syncOverlay();const d=$('#infoDesc');if(d)$('#readMore').hidden=d.scrollHeight<=d.clientHeight+1;$('#infoClose').focus()}
function closeInfo(){$('#infoDrawer').classList.remove('open');syncOverlay()}

// Men, Women and Kids list the main product groups (catalog.js: Clothing, Shoes, Bags, Jewellery, Accessories), each
// with its own collection (/men/clothing). One list for the header's drop-down panels and
// the ☰ menu's sub-menus, so the two always match.
const GROUP_NAMES=Object.keys(EA_CATALOG.types);
const SHOP_GROUPS={men:{label:'Men',groups:GROUP_NAMES},women:{label:'Women',groups:GROUP_NAMES},kids:{label:'Kids',groups:GROUP_NAMES}};
const groupLinks=k=>[['View all',`/${k}`],...SHOP_GROUPS[k].groups.map(g=>[g,`/${k}/${slug(g)}`])].map(([t,h])=>`<li><a href="${h}">${esc(tr(t))}</a></li>`).join('');
function renderShopMenus(){$('.hdr-item[data-group]').insertAdjacentHTML('beforeend','<div class="hdr-drop" id="hdrDrop"><div class="hdr-drop-in"><p class="hdr-drop-title"></p><ul></ul></div></div>');
$('#sideMenu').insertAdjacentHTML('beforeend',Object.entries(SHOP_GROUPS).map(([k,g])=>`<nav class="side-sub" id="side-${k}" aria-label="${tr(g.label)}"><div class="side-head"><button type="button" class="side-back" data-back><span aria-hidden="true">‹</span> ${tr(g.label)}</button><button type="button" class="side-close" data-close-menu aria-label="${tr('Close menu')}">×</button></div><div class="side-panel"><ul class="side-list">${groupLinks(k)}</ul></div></nav>`).join(''))}
// Header drop-down (desktop): hovering or tabbing to Men, Women or Kids opens one shared panel under the header, and
// the header turns solid while it is open (at the top of the page it is otherwise transparent over the hero). Moving
// on to another of the three while it is open only changes its text, so it doesn't flicker. The panel sits inside
// the item it belongs to, so Tab goes from Men into Men's links. Leaving the header, Escape or choosing a link closes
// it; after a choice it stays shut until the pointer leaves the header.
let dropTimer,dropHold=false;
function openDrop(item){if(dropHold)return;clearTimeout(dropTimer);const h=$('.site-header'),drop=$('#hdrDrop'),k=item.dataset.group,wasOpen=h.classList.contains('drop-open');if(drop.dataset.group!==k){drop.dataset.group=k;drop.querySelector('.hdr-drop-title').textContent=tr(SHOP_GROUPS[k].label);drop.querySelector('ul').innerHTML=groupLinks(k)}if(drop.parentElement!==item){item.append(drop);if(!wasOpen)void drop.offsetWidth} // a moved panel has no previous style to fade from; on a first open, give it one so it fades in
document.querySelectorAll('.hdr-item.open').forEach(i=>{if(i!==item)setDrop(i,false)});setDrop(item,true);h.classList.add('drop-open')}
function setDrop(item,open){item.classList.toggle('open',open);item.firstElementChild.setAttribute('aria-expanded',open)}
function closeDrops(){clearTimeout(dropTimer);document.querySelectorAll('.hdr-item.open').forEach(i=>setDrop(i,false));$('.site-header').classList.remove('drop-open')}
// Side menu (☰): brands with their logos, then the same shop links as the header; Men, Women and Kids open a
// sub-menu that slides in over it, as a second sidebar.
function openSub(k){const sub=$(`#side-${k}`);sub.classList.add('open');$(`[data-sub="${k}"]`).setAttribute('aria-expanded','true');setTimeout(()=>sub.querySelector('.side-back').focus(),60)} // once it is visible (it slides in)
function closeSub(){const sub=$('.side-sub.open');if(!sub)return;sub.classList.remove('open');const k=sub.id.slice(5),btn=$(`[data-sub="${k}"]`);btn.setAttribute('aria-expanded','false');if($('#sideMenu').classList.contains('open'))btn.focus()}
function renderMenu(brands){$('#sideBrands').innerHTML=brands.map(b=>`<li><a href="/brand/${slug(b)}">${brandLogo(b)}</a></li>`).join('')}
function openMenu(){$('#sideMenu').classList.add('open');syncOverlay();$('#sideClose').focus()}
function closeMenu(){document.querySelectorAll('.side-sub.open').forEach(x=>x.classList.remove('open'));document.querySelectorAll('[data-sub]').forEach(b=>b.setAttribute('aria-expanded','false'));$('#sideMenu').classList.remove('open');syncOverlay()}
function saveCart(){localStorage.setItem('ea-cart',JSON.stringify(state.cart));renderCart();if(!$('#checkout').hidden){coError('');renderCheckout()}} // the bag can be edited on top of the checkout
// Product page colour dropdown (a listbox so each colour shows its swatch): click, or arrows / Enter / Escape.
function toggleColors(open){const list=$('#pdpColorList');if(!list||list.hidden===!open)return;list.hidden=!open;$('#pdpColorBtn').setAttribute('aria-expanded',open);if(open)(list.querySelector('[aria-selected="true"]')||list.firstElementChild).focus()}
function chooseColor(i){pdp.colorIndex=i;renderColorPicker();$('#pdpColorBtn').focus()}
function renderCart(){const count=state.cart.length;document.querySelectorAll('.bag-count').forEach(el=>{el.textContent=count});$('#bagOpen').dataset.count=count;$('#bagOpen').setAttribute('aria-label',tr(count===1?'Bag, {n} item':'Bag, {n} items',{n:count}));$('#checkoutBtn').disabled=!count;const items=$('#cartItems');if(!items)return;if(!count){items.innerHTML=`<p>${tr('Your bag is empty.')}</p>`;$('#cartTotal').textContent=money(0);return}items.innerHTML=state.cart.map((item,i)=>{const p=state.products.find(x=>x.id===item.id);if(!p)return'';const c=item.color&&(productColors(p).find(x=>x.name===item.color)||{name:item.color});return`<div class="cart-item"><img class="cart-thumb" src="${esc(p.image)}" alt=""><div><h4>${esc(p.name)}</h4><div class="product-brand">${esc(p.brand)}</div>${c?`<p class="cart-color">${swatch(c)}${esc(c.name)}</p>`:''}${item.size?`<p class="cart-size">${esc(tr('Size: {s}',{s:item.size}))}</p>`:''}<p>${priceHtml(p)}</p></div><button class="remove" data-remove="${i}" aria-label="${esc(tr('Remove {name}',{name:p.name}))}">×</button></div>`}).join('');$('#cartTotal').textContent=money(state.cart.reduce((s,item)=>{const p=state.products.find(x=>x.id===item.id);return s+(p?priceOf(p):0)},0))}
// Like the menu and info drawers, the bag takes focus when it opens and hands it back when it closes.
let cartReturn=null;
// My account (#account): the store's one sign-in, for customers and CRM staff alike (username or email), and sign-up;
// then the customer's orders with where each one is. Staff are sent on to the CRM, and signed in they see the way to it.
const acct={account:null,staff:null};
const trParts=s=>s?String(s).split(', ').map(p=>tr(p)).join(', '):''; // "Standard delivery, 3–5 business days"
const STEPS=[['Processing','Order placed'],['Shipped','On its way'],['Delivered','Delivered']];
const SQ_MONTHS=['janar','shkurt','mars','prill','maj','qershor','korrik','gusht','shtator','tetor','nëntor','dhjetor'];
const longDate=d=>{const x=new Date(`${d}T12:00`);return EA_I18N.lang==='sq'?`${x.getDate()} ${SQ_MONTHS[x.getMonth()]} ${x.getFullYear()}`:x.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}; // Albanian written out, like prices
async function loadAccount(){try{const r=await fetch('/api/account/me'),d=await r.json().catch(()=>({}));acct.account=r.ok&&d.account||null;acct.staff=r.ok&&d.staff||null}catch{acct.account=acct.staff=null}syncAccountLink()}
function syncAccountLink(){const a=$('#accountLink'),who=acct.account||acct.staff;a.setAttribute('aria-label',who?tr('My account ({name})',{name:who.name}):tr('Sign in or create an account'));a.classList.toggle('signed-in',!!who)}
function openAccount(){$('#account').hidden=false;$('#account').scrollTop=0;syncLock();renderAccount()}
function closeAccount(){$('#account').hidden=true;syncLock()}
// Form fields: label, control and a tip under the control that says what to fix (see fieldError). The forms are
// novalidate, so the tip replaces the browser's own bubble.
const tipFor=id=>`<p class="acct-tip" id="${id}Tip" hidden></p>`;
const field=(id,label,control)=>`<div class="acct-field"><label for="${id}">${label}</label>${control}${tipFor(id)}</div>`;
const input=(id,name,attrs)=>`<input id="${id}" name="${name}" required aria-describedby="${id}Tip" ${attrs}>`;
const pwField=(id,name,auto,placeholder)=>`<span class="acct-pw">${input(id,name,`type="password" autocomplete="${auto}" maxlength="200"${placeholder?` placeholder="${placeholder}"`:''}`)}<button type="button" class="acct-show" data-show="${id}" aria-pressed="false" aria-label="${tr('Show password')}" title="${tr('Show password')}"><svg class="eye-closed" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9.5c2.2 3.2 5.4 5 9 5s6.8-1.8 9-5"/><path d="M5.9 12.6 4.2 14.8M9.7 14.1l-.7 2.6M14.3 14.1l.7 2.6M18.1 12.6l1.7 2.2"/></svg><svg class="eye-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg></button></span>`;
function authHtml(){return `<div class="acct-auth"><p class="kicker">${tr('My account')}</p><h1 id="acctTitle">${tr('Sign in or create an account')}</h1><p class="co-lead acct-lead">${tr('See everything you have bought, follow each order until it arrives and check out faster.')}</p>
<div class="acct-tabs" role="tablist"><button type="button" role="tab" id="tabSignin" aria-controls="signinForm" aria-selected="true">${tr('Sign in')}</button><button type="button" role="tab" id="tabSignup" aria-controls="signupForm" aria-selected="false">${tr('Create account')}</button></div>
<form class="co-form acct-form" id="signinForm" role="tabpanel" aria-labelledby="tabSignin" novalidate>${field('siLogin',tr('Username or email'),input('siLogin','login','autocomplete="username" maxlength="254" spellcheck="false" autocapitalize="none"'))}${field('siPw',tr('Password'),pwField('siPw','password','current-password'))}<p class="co-error" role="alert"></p><button type="submit" class="pdp-btn solid">${tr('Sign in')}</button></form>
<form class="co-form acct-form" id="signupForm" role="tabpanel" aria-labelledby="tabSignup" hidden novalidate>${field('suName',tr('Full name'),input('suName','name','autocomplete="name" maxlength="120"'))}${field('suEmail',tr('Email'),input('suEmail','email','type="email" autocomplete="email" maxlength="254" spellcheck="false"'))}${field('suPhone',tr('Phone'),input('suPhone','phone','type="tel" autocomplete="tel" maxlength="30"'))}${field('suUser',tr('Username'),input('suUser','username',`autocomplete="username" maxlength="30" spellcheck="false" autocapitalize="none" placeholder="${tr('Letters, numbers, . - _')}"`))}${field('suPw',tr('Password'),pwField('suPw','password','new-password',tr('At least 8 characters')))}${field('suPw2',tr('Confirm password'),pwField('suPw2','passwordConfirm','new-password'))}
<div class="acct-field acct-check"><label><input type="checkbox" id="suTerms" name="terms" required aria-describedby="suTermsTip"><span>${tr('I have read and accept the terms and conditions')}</span></label>${tipFor('suTerms')}</div><p class="co-error" role="alert"></p><button type="submit" class="pdp-btn solid">${tr('Create account')}</button></form></div>`}
// What is wrong with a field ('' when nothing). Every field is required; the formats are the ones the server accepts.
function fieldError(el){return tr(fieldProblem(el))}
function fieldProblem(el){const v=el.value.trim(),up=el.form.id==='signupForm';switch(el.name){
case 'login':return v?'':'Enter your username or email.';
case 'name':return v?'':'Enter your full name.';
case 'email':return !v?'Enter your email.':/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)?'':'Enter a valid email, like name@example.com.';
case 'phone':return !v?'Enter your phone number.':/^[+0-9 ()./-]+$/.test(v)&&v.replace(/\D/g,'').length>=6?'':'Enter a valid phone number.';
case 'username':return !v?'Choose a username.':/^[A-Za-z0-9._-]{3,30}$/.test(v)?'':'Use 3 to 30 letters, numbers, dots, dashes or underscores.';
case 'password':return !el.value?(up?'Choose a password.':'Enter your password.'):up&&el.value.length<8?'Use at least 8 characters.':'';
case 'passwordConfirm':return !el.value?'Enter your password again.':el.value===el.form.password.value?'':'The two passwords are not the same.';
case 'terms':return el.checked?'':'Please accept the terms and conditions.';
case 'firstName':return v?'':'Enter your first name.';
case 'lastName':return v?'':'Enter your last name.';
case 'line1':return v?'':'Enter your address.';
case 'postalCode':return v?'':'Enter your postal code.';
case 'city':return v?'':'Enter your city.';
case 'country':return v?'':'Enter your country.'}return ''}
// Every field with a problem gets a red border; one tip shows at a time, under the field it is about.
function markField(el,msg){el.setAttribute('aria-invalid',!!msg);const t=el.id&&$(`#${el.id}Tip`);if(!msg&&t)t.hidden=true} // fields without a tip (optional ones, radios) are left alone
function showTip(el,msg,extra=''){el.form.querySelectorAll('.acct-tip').forEach(t=>{t.hidden=true});const t=$(`#${el.id}Tip`);t.innerHTML=`<span class="acct-tip-mark" aria-hidden="true">!</span><span>${esc(msg)}${extra}</span>`;t.hidden=false}
// Checks the whole form; the first field with a problem takes focus and shows its tip.
function checkForm(f){let first=null;f.querySelectorAll('input[name]').forEach(el=>{const msg=fieldError(el);markField(el,msg);if(msg&&!first)first=[el,msg]});if(!first)return true;first[0].focus();showTip(...first);return false}
// Bank-transfer orders start with an Awaiting payment step.
const tracker=o=>{const steps=o.status==='Awaiting Payment'||/transfer|transfert/i.test(o.payment||'')?[['Awaiting Payment','Awaiting payment'],...STEPS]:STEPS,at=steps.findIndex(s=>s[0]===o.status);return `<ol class="acct-track" aria-label="${esc(tr('Order status: {s}',{s:tr(o.status)}))}">${steps.map(([,label],i)=>`<li class="${i<=at?'done':''}"${i===at?' aria-current="step"':''}>${tr(label)}</li>`).join('')}</ol>`};
const orderCard=o=>`<article class="acct-order"><header><div><h3>${esc(tr('Order {id}',{id:o.id}))}</h3><p>${esc(longDate(o.date))}</p></div><b>${money(o.total)}</b></header>${tracker(o)}${o.lines?`<ul class="acct-lines">${o.lines.map(l=>`<li><img src="${esc(l.image)}" alt=""><div><span class="product-brand">${esc(l.brand)}</span><b>${esc(l.name)}</b><small>${[l.color,l.size&&tr('Size {v}',{v:l.size}),l.qty>1&&tr('Quantity {n}',{n:l.qty})].filter(Boolean).map(esc).join(' · ')}</small></div><span>${money(l.price*l.qty)}</span></li>`).join('')}</ul>`:`<p class="acct-note">${tr(o.items===1?'{n} piece':'{n} pieces',{n:o.items})}</p>`}${o.delivery||o.payment?`<p class="acct-note">${[trParts(o.delivery),tr(o.payment||'')].filter(Boolean).map(esc).join(' · ')}</p>`:''}</article>`;
async function renderAccount(){const main=$('#acctMain');if(!acct.account&&acct.staff){const s=acct.staff;main.innerHTML=`<div class="acct-home"><p class="kicker">${tr('My account')}</p><h1 id="acctTitle">${esc(tr('Hello, {name}',{name:s.name.split(' ')[0]}))}</h1><p class="acct-who">${esc(tr('Signed in to the CRM as {name}',{name:s.name}))} · <button type="button" class="acct-out" id="acctSignOut">${tr('Sign out')}</button></p><a class="pdp-btn solid co-continue" href="/admin/">${tr('Open the CRM')}</a></div>`;return}
if(!acct.account){main.innerHTML=authHtml();const want=PAGES[nextPage().slice(1)];if(want)main.querySelector('.acct-lead').textContent=tr('Sign in or create an account to continue to “{page}”.',{page:tr(want.title)});main.querySelector('#signinForm input').focus({preventScroll:true});return}
const a=acct.account;main.innerHTML=`<div class="acct-home"><p class="kicker">${tr('My account')}</p><h1 id="acctTitle">${esc(tr('Hello, {name}',{name:a.name.split(' ')[0]}))}</h1><p class="acct-who">${esc(tr('Signed in as {email}',{email:a.email}))} · <button type="button" class="acct-out" id="acctSignOut">${tr('Sign out')}</button></p><h2>${tr('Your orders')}</h2><div id="acctOrders"><p class="co-wait">${tr('Loading your orders…')}</p></div></div>`;
try{const orders=await json('/api/account/orders');$('#acctOrders').innerHTML=orders.length?orders.map(orderCard).join(''):`<div class="acct-empty"><p>${tr('No orders yet. Orders you place while signed in, or with this email, appear here with their status.')}</p><a class="pdp-btn solid co-continue" href="/all">${tr('Discover the collection')}</a></div>`}
catch(err){if(err.status===401){acct.account=null;syncAccountLink();return renderAccount()}$('#acctOrders').innerHTML=`<p class="co-error">${tr('Your orders could not be loaded.')} ${esc(err.message)} <button type="button" id="acctRetry">${tr('Try again')}</button></p>`}}
$('#acctMain').addEventListener('click',async e=>{const tab=e.target.closest('[role=tab]');if(tab){const up=tab.id==='tabSignup';$('#tabSignin').setAttribute('aria-selected',!up);$('#tabSignup').setAttribute('aria-selected',up);$('#signinForm').hidden=up;$('#signupForm').hidden=!up;$(`#${up?'signupForm':'signinForm'} input`).focus();return}
const show=e.target.closest('[data-show]');if(show){const i=$(`#${show.dataset.show}`),reveal=i.type==='password';i.type=reveal?'text':'password';const tip=tr(reveal?'Hide password':'Show password');show.setAttribute('aria-label',tip);show.title=tip;show.setAttribute('aria-pressed',reveal);i.focus();return}
if(e.target.id==='acctRetry')renderAccount();if(e.target.id==='acctSignOut'){try{await json(acct.account?'/api/account/logout':'/api/auth/logout',{method:'POST'})}catch{}acct.account=acct.staff=null;syncAccountLink();renderAccount()}});
// A field being corrected is checked as you type (the confirmation along with the password): its tip follows and
// goes once the field is right. Moving to another field that still has a problem shows that field's tip.
// (also on the newsletter and checkout forms)
[$('#acctMain'),$('#newsletterForm'),$('#coForm')].forEach(root=>{root.addEventListener('input',e=>{const f=e.target.form;if(!f)return;[e.target,e.target.name==='password'&&f.passwordConfirm].filter(el=>el&&el.getAttribute('aria-invalid')==='true').forEach(el=>{const msg=fieldError(el);markField(el,msg);if(msg&&el===e.target)showTip(el,msg)})});
root.addEventListener('focusin',e=>{const el=e.target;if(!el.form||el.getAttribute('aria-invalid')!=='true')return;const msg=fieldError(el);if(msg)showTip(el,msg)})});
// Staff are sent on to the CRM. A problem the server finds with one field (an email or username already in use)
// shows in that field's tip; anything else under the form.
$('#acctMain').addEventListener('submit',async e=>{const f=e.target;if(f.id!=='signinForm'&&f.id!=='signupForm')return;e.preventDefault();const btn=f.querySelector('[type=submit]'),err=f.querySelector('.co-error'),label=btn.textContent,up=f.id==='signupForm';err.textContent='';if(!checkForm(f))return;btn.disabled=true;btn.textContent=tr(up?'Creating your account…':'Signing in…');
try{const d=await json(`/api/account/${up?'signup':'login'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(f)))});if(d.redirect)return location.assign(d.redirect);acct.account=d.account;acct.staff=null;syncAccountLink();const next=nextPage();if(next){history.replaceState(null,'',next);return route()}renderAccount()}
catch(x){const el=x.field&&f.elements[x.field];if(el){markField(el,x.message);el.focus();showTip(el,x.message,x.status===409&&x.field==='email'?` <button type="button" data-goto-signin>${tr('Sign in')}</button>`:'')}else err.textContent=x.message;btn.disabled=false;btn.textContent=label}});
$('#acctMain').addEventListener('click',e=>{if(!e.target.closest('[data-goto-signin]'))return;const email=$('#signupForm').email.value;$('#tabSignin').click();$('#signinForm').login.value=email;$('#siPw').focus()});
// Search panel: pieces matching every word of the query as you type; Enter opens them all as a collection (#search/<query>).
// Closing clears the query and hands focus back to whatever opened the panel.
const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const searchWords=q=>norm(q).split(/[^a-z0-9]+/).filter(Boolean);
const matchesSearch=(p,q)=>{const words=searchWords(q),text=norm(`${p.name} ${p.brand} ${p.category} ${p.type||''} ${productColors(p).map(c=>c.name).join(' ')}`);return words.length>0&&words.every(w=>text.includes(w))};
let searchReturn=null;
function openSearch(){searchReturn=document.activeElement;$('#searchPanel').classList.add('open');$('#searchOpen').setAttribute('aria-expanded','true');syncOverlay();$('#searchInput').focus()}
function closeSearch(){if(!$('#searchPanel').classList.contains('open'))return;$('#searchPanel').classList.remove('open');$('#searchOpen').setAttribute('aria-expanded','false');$('#searchInput').value='';renderSearch();syncOverlay();if($('#searchPanel').contains(document.activeElement))searchReturn?.focus()}
function renderSearch(){const q=$('#searchInput').value.trim(),box=$('#searchResults');if(!q){box.innerHTML='';$('#searchStatus').textContent='';return}
const hits=state.products.filter(p=>matchesSearch(p,q)),n=tr(hits.length===1?'{n} piece':'{n} pieces',{n:hits.length}),brands=[...new Set(state.products.map(p=>p.brand))];$('#searchStatus').textContent=hits.length?tr(hits.length===1?'{n} piece found':'{n} pieces found',{n:hits.length}):tr('No pieces found');
box.innerHTML=hits.length?`<p class="search-count">${n}</p><ul class="search-list">${hits.slice(0,6).map(p=>`<li><a href="/product/${esc(p.id)}"><img src="${esc(p.image)}" alt="" loading="lazy"><span><span class="product-brand">${esc(p.brand)}</span><b>${esc(p.name)}</b><span class="search-price">${priceHtml(p)}</span></span></a></li>`).join('')}</ul><a class="search-all" href="/search/${encodeURIComponent(q)}">${esc(tr('View all {n}',{n}))}</a>`
:`<p class="search-none">${esc(tr('Nothing matches “{q}”. Try one of our houses:',{q}))}</p><p class="search-brands">${brands.map(b=>`<a href="/brand/${slug(b)}">${esc(b)}</a>`).join('')}</p>`}
function openCart(){cartReturn=document.activeElement;$('#cartDrawer').classList.add('open');syncOverlay();$('#closeCart').focus()}
function closeCart(){if(!$('#cartDrawer').classList.contains('open'))return;$('#cartDrawer').classList.remove('open');syncOverlay();if(!$('#cartDrawer').contains(document.activeElement))return;const back=cartReturn?.isConnected?cartReturn:!$('#checkout').hidden?$('#coPlace'):null;back?.focus()}

// Checkout (#checkout): contact, address, delivery and payment, with the bag as the order summary. The server re-prices
// the bag, checks stock and records the order in the CRM. The form stays in the page, so what was typed is kept.
const co={options:null,editing:false}; // editing: the summary shows an × on each piece (Edit bag) // delivery and payment choices from the server
// The bag as order lines (same piece, colour and size grouped with a quantity); pieces no longer in the store are left out.
function bagLines(){const lines=[];for(const item of state.cart){const p=state.products.find(x=>x.id===item.id);if(!p)continue;const color=item.color||'',size=item.size||'',line=lines.find(l=>l.p===p&&l.color===color&&l.size===size);if(line)line.qty++;else lines.push({p,color,size,qty:1})}return lines}
// The message above Place order, with the way out when there is one: back to the bag, or reload the options.
const CO_ACTIONS={bag:()=>`<button type="button" data-co-edit>${tr('Review your bag')}</button>`,retry:()=>`<button type="button" id="coRetry">${tr('Try again')}</button>`};
function coError(msg,action){$('#coError').innerHTML=msg?`${esc(msg)} ${CO_ACTIONS[action]?.()||''}`:''}
const coOption=(name,o,i)=>`<label class="co-option"><input type="radio" name="${name}" value="${esc(o.key)}" required${i?'':' checked'}><span><b>${esc(tr(o.label))}</b><small>${esc(tr(o.note))}</small></span>${'price' in o?`<em>${o.price?money(o.price):tr('Free')}</em>`:''}</label>`;
const coWait=text=>{$('#coDelivery').innerHTML=$('#coPayment').innerHTML=`<p class="co-wait">${text}</p>`};
async function openCheckout(){$('#checkout').hidden=false;$('#checkout').scrollTop=0;syncLock();coError('');renderCheckout();prefillCheckout();if(co.options)return;coWait(tr('Loading…'));
try{co.options=await json('/api/checkout');$('#coDelivery').innerHTML=co.options.delivery.map((o,i)=>coOption('delivery',o,i)).join('');$('#coPayment').innerHTML=co.options.payment.map((o,i)=>coOption('payment',o,i)).join('');renderCheckout()}catch{coWait(tr('Not available right now.'));coError(tr('Delivery and payment options could not be loaded. Check your connection.'),'retry')}}
// A signed-in customer starts with their email, phone and name filled in (never over what they typed). The full name
// is split at its last word: "Ana Maria Hoxha" → Ana Maria / Hoxha.
function prefillCheckout(){const a=acct.account,f=$('#coForm');if(!a)return;const words=String(a.name||'').trim().split(/\s+/),last=words.length>1?words.pop():'';const fill=(k,v)=>{if(v&&!f[k].value){f[k].value=v;markField(f[k],'')}};fill('email',a.email);fill('phone',a.phone);fill('firstName',words.join(' '));fill('lastName',last)}
function closeCheckout(){$('#checkout').hidden=true;syncLock()}
function renderCheckout(){const lines=bagLines();$('#coMain').hidden=!lines.length;$('#coDone').hidden=!!lines.length;
if(!lines.length){$('#coDone').innerHTML=`<p class="kicker">${tr('Checkout')}</p><h1>${tr('Your bag is empty')}</h1><p class="co-lead">${tr('Discover the collection and add the pieces you love.')}</p><a class="pdp-btn solid co-continue" href="/all">${tr('Continue shopping')}</a>`;return}
const delivery=co.options?.delivery.find(d=>d.key===$('#coForm').elements.delivery?.value),subtotal=lines.reduce((s,l)=>s+priceOf(l.p)*l.qty,0),total=subtotal+(delivery?.price||0),count=lines.reduce((n,l)=>n+l.qty,0);
$('#coSumCount').textContent=tr(count===1?'{n} piece':'{n} pieces',{n:count});$('#coSumTotal').textContent=money(total); // the collapsed summary on phones
$('#coEdit').textContent=tr(co.editing?'Done':'Edit bag');$('#coEdit').setAttribute('aria-pressed',co.editing);
$('#coLines').innerHTML=lines.map((l,i)=>{const c=l.color&&(productColors(l.p).find(x=>x.name===l.color)||{name:l.color});return`<div class="co-line"><img src="${esc(l.p.image)}" alt=""><div><p class="product-brand">${esc(l.p.brand)}</p><h3>${esc(l.p.name)}</h3>${c?`<p class="cart-color">${swatch(c)}${esc(c.name)}</p>`:''}${l.size?`<p>${esc(tr('Size {v}',{v:l.size}))}</p>`:''}${l.qty>1?`<p>${tr('Quantity {n}',{n:l.qty})}</p>`:''}</div><span>${money(priceOf(l.p)*l.qty)}</span>${co.editing?`<button type="button" class="co-remove" data-co-remove="${i}" aria-label="${esc(tr('Remove {name}',{name:l.p.name}))}">×</button>`:''}</div>`}).join('');
$('#coTotals').innerHTML=`<dt>${tr('Subtotal')}</dt><dd>${money(subtotal)}</dd><dt>${tr('Delivery')}</dt><dd>${!delivery?'—':delivery.price?money(delivery.price):tr('Free')}</dd><dt class="total">${tr('Total')}</dt><dd class="total">${money(total)}</dd>`;
$('#coPlace').textContent=tr('Place order · {total}',{total:money(total)});$('#coPlace').disabled=!co.options}
// Placing the order: on success the bag is emptied, the form cleared and a confirmation shown.
async function placeOrder(form){const d=Object.fromEntries(new FormData(form));
const{order,paymentNote}=await json('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contact:{email:d.email,phone:d.phone,firstName:d.firstName,lastName:d.lastName},address:{line1:d.line1,line2:d.line2,postalCode:d.postalCode,city:d.city,country:d.country},delivery:d.delivery,payment:d.payment,note:d.note,items:state.cart.filter(i=>state.products.some(p=>p.id===i.id))})});
state.cart=[];saveCart();form.reset();const a=order.address;$('#coMain').hidden=true;$('#coDone').hidden=false;$('#checkout').scrollTop=0;
$('#coDone').innerHTML=`<p class="kicker">${esc(tr('Order {id}',{id:order.id}))}</p><h1 tabindex="-1">${esc(tr('Thank you, {name}',{name:d.firstName}))}</h1><p class="co-lead">${esc(tr('Your order has been placed. A client advisor will contact you at {email} to confirm the delivery.',{email:order.email}))}</p><dl class="co-facts"><dt>${tr('Total')}</dt><dd>${money(order.total)}</dd><dt>${tr('Payment')}</dt><dd>${esc(tr(order.payment))}<small>${esc(tr(paymentNote))}</small></dd><dt>${tr('Delivery')}</dt><dd>${esc(trParts(order.delivery))}</dd><dt>${tr('Ships to')}</dt><dd>${[order.customer,a.line1,a.line2,`${a.postalCode} ${a.city}`,a.country].filter(Boolean).map(esc).join('<br>')}</dd></dl>${acct.account?`<p class="co-track-link"><a href="/account">${tr('Follow this order in My account')}</a></p>`:''}<a class="pdp-btn solid co-continue" href="/all">${tr('Continue shopping')}</a>`;$('#coDone h1').focus();
json('/api/products').then(p=>{state.products=p;renderProducts()}).catch(()=>{})} // fresh stock (sold sizes) for the store
document.addEventListener('click',e=>{const add=e.target.closest('[data-add]');if(add){if(add.dataset.needSize&&!add.dataset.size){$('#pdpSizeMsg').textContent=tr('Please select a size.');$('#pdpSizes button:not([disabled])')?.focus();return}state.cart.push({id:add.dataset.add,color:add.dataset.color||'',size:add.dataset.size||''});saveCart();openCart()}if(!e.target.closest('.color-select'))toggleColors(false);const rem=e.target.closest('[data-remove]');if(rem){state.cart.splice(+rem.dataset.remove,1);saveCart();$('#closeCart').focus()}if(e.target.closest('[data-open-cart]'))openCart()});
document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));renderProducts()}));
$('#bagOpen').addEventListener('click',openCart);$('#closeCart').addEventListener('click',closeCart);$('#overlay').addEventListener('click',()=>{if($('#filterDrawer').classList.contains('open'))return applyFilters();closeCart();closeMenu();closeInfo();closeFilters();closeSearch()});
$('#menuOpen').addEventListener('click',openMenu);$('#sideClose').addEventListener('click',closeMenu);
$('#sideMenu').addEventListener('click',e=>{const lg=e.target.closest('[data-lang]');if(lg)return EA_I18N.setLang(lg.dataset.lang);const sub=e.target.closest('[data-sub]');if(sub)return openSub(sub.dataset.sub);if(e.target.closest('[data-back]'))return closeSub();if(e.target.closest('a,[data-close-menu]'))closeMenu()});
renderShopMenus();
// Language menu (the globe in the header): Shqip / English, the current one ticked. Choosing the other reloads the page
// in it (frontend/i18n.js). Closes on a choice, a click elsewhere or Escape.
function setLangMenu(open){$('#langMenu').hidden=!open;$('#langOpen').setAttribute('aria-expanded',open);if(open)($('#langMenu [aria-current]')||$('#langMenu button')).focus()}
$('#langMenu').querySelectorAll('[data-lang]').forEach(b=>{if(b.dataset.lang===EA_I18N.lang)b.setAttribute('aria-current','true')});
$('.side-lang').querySelectorAll('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.lang===EA_I18N.lang)); // the ☰ menu's language buttons
$('#langOpen').addEventListener('click',()=>setLangMenu($('#langMenu').hidden));
$('#langMenu').addEventListener('click',e=>{const b=e.target.closest('[data-lang]');if(!b)return;setLangMenu(false);EA_I18N.setLang(b.dataset.lang)});
document.addEventListener('click',e=>{if(!$('#langMenu').hidden&&!e.target.closest('.lang-wrap'))setLangMenu(false)});
$('.lang-wrap').addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#langMenu').hidden){e.stopPropagation();setLangMenu(false);$('#langOpen').focus()}});
$('.lang-wrap').addEventListener('focusout',e=>{if(!$('.lang-wrap').contains(e.relatedTarget))setLangMenu(false)});
// The footer at the bottom of every page panel too (a copy of the home page's).
PANELS.forEach(p=>$(p).insertAdjacentHTML('beforeend',$('body>footer').outerHTML));
$('.site-header').addEventListener('mouseover',e=>{const item=e.target.closest('.hdr-item');if(item)openDrop(item);else if(e.target.closest('.hdr-nav>a,.hdr-end,.hdr-logo,.hdr-menu'))closeDrops()});
$('.site-header').addEventListener('mouseleave',()=>{dropHold=false;dropTimer=setTimeout(closeDrops,180)});
$('.site-header').addEventListener('mouseenter',()=>clearTimeout(dropTimer));
$('.hdr-nav').addEventListener('focusin',e=>{dropHold=false;const item=e.target.closest('.hdr-item');if(item)openDrop(item);else closeDrops()}); // focus (Tab) always opens it, also after a click
$('.hdr-nav').addEventListener('focusout',e=>{if(!$('.hdr-nav').contains(e.relatedTarget))closeDrops()});
$('.hdr-nav').addEventListener('keydown',e=>{if(e.key!=='Escape')return;const item=e.target.closest('.hdr-item.open');if(!item)return;e.stopPropagation();closeDrops();item.firstElementChild.focus()});
$('.hdr-nav').addEventListener('click',e=>{if(e.target.closest('a')){closeDrops();dropHold=true;document.activeElement.blur()}});
$('#searchOpen').addEventListener('click',openSearch);$('#searchClose').addEventListener('click',closeSearch);$('#searchInput').addEventListener('input',renderSearch);
$('#searchForm').addEventListener('submit',e=>{e.preventDefault();const q=$('#searchInput').value.trim();if(q)go(`/search/${encodeURIComponent(q)}`)});
addEventListener('popstate',()=>{coll.fromPage=true;closeSearch();route()});
// Closing goes back in history when the page was opened from inside the site, otherwise to the home page.
const closePanel=close=>{if(coll.fromPage)history.back();else{history.replaceState(null,'','/');close()}};
$('#collectionClose').addEventListener('click',()=>closePanel(closeCollection));
$('#pdpClose').addEventListener('click',()=>closePanel(closeProduct));
$('#checkoutBtn').addEventListener('click',()=>{closeCart();go('/checkout')});
$('#coClose').addEventListener('click',()=>closePanel(closeCheckout));
$('#coDelivery').addEventListener('change',renderCheckout);
$('#coSumToggle').addEventListener('click',e=>{const b=e.currentTarget;b.setAttribute('aria-expanded',b.getAttribute('aria-expanded')!=='true')});
$('#coError').addEventListener('click',e=>{if(e.target.id==='coRetry')openCheckout();if(e.target.closest('[data-co-edit]'))setCoEditing(true)});
// Edit bag: an × on each piece of the summary removes it (all of that piece, colour and size) from the bag; Done ends it.
function setCoEditing(on){co.editing=on;if(on)$('#coSumToggle').setAttribute('aria-expanded','true');renderCheckout();if(on)$('#coLines').scrollIntoView({block:'nearest'})} // on phones the summary opens first
$('#coEdit').addEventListener('click',()=>setCoEditing(!co.editing));
$('#coLines').addEventListener('click',e=>{const b=e.target.closest('[data-co-remove]');if(!b)return;const l=bagLines()[+b.dataset.coRemove];if(!l)return;state.cart=state.cart.filter(i=>!(i.id===l.p.id&&(i.color||'')===l.color&&(i.size||'')===l.size));saveCart();const next=$(`#coLines [data-co-remove="${Math.min(+b.dataset.coRemove,bagLines().length-1)}"]`);(next||$('#coEdit'))?.focus()});
// Address on a map: Leaflet with OpenStreetMap tiles, loaded the first time the map opens (no key needed). A tap drops
// the pin, which can be dragged; OpenStreetMap's address search (Nominatim) names the spot, and "Use this address"
// fills Address, Postal code, City and Country. The map starts on Tirana; "Use my location" moves the pin there.
let mapPick=null,mapSeq=0;
const loadLeaflet=()=>window.L?Promise.resolve():new Promise((ok,fail)=>{const css=document.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.append(css);const js=document.createElement('script');js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';js.onload=ok;js.onerror=fail;document.head.append(js)});
async function openMapPicker(){$('#mapModal').hidden=false;$('#mapClose').focus();try{await loadLeaflet()}catch{$('#mapFound').textContent=tr('The map could not be loaded. Check your connection.');return}
if(!mapPick){const map=L.map('mapCanvas').setView([41.3275,19.8187],14);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(map);mapPick={map,marker:null,found:null};map.on('click',e=>dropPin(e.latlng))}else mapPick.map.invalidateSize()}
function dropPin(ll){const m=mapPick;if(!m.marker){m.marker=L.marker(ll,{draggable:true,keyboard:false,icon:L.divIcon({className:'map-drop-pin',html:'<span></span>',iconSize:[30,40],iconAnchor:[15,40]})}).addTo(m.map);m.marker.on('dragend',()=>findAddress(m.marker.getLatLng()))}else m.marker.setLatLng(ll);findAddress(ll)}
async function findAddress(ll){const seq=++mapSeq;mapPick.found=null;$('#mapUse').disabled=true;$('#mapFound').textContent=tr('Finding the address…');
try{const d=await(await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${ll.lat}&lon=${ll.lng}&accept-language=${EA_I18N.lang}`)).json();if(seq!==mapSeq)return;const a=d.address||{};
const found={line1:[a.road||a.pedestrian||a.footway||a.neighbourhood||a.suburb,a.house_number].filter(Boolean).join(' '),postalCode:a.postcode||'',city:a.city||a.town||a.village||a.municipality||'',country:a.country||''};if(!found.line1&&!found.city)throw new Error('no address');
mapPick.found=found;$('#mapFound').textContent=[found.line1,[found.postalCode,found.city].filter(Boolean).join(' '),found.country].filter(Boolean).join(', ');$('#mapUse').disabled=false}
catch{if(seq===mapSeq)$('#mapFound').textContent=tr('No address found here. Try a spot on a street.')}}
function closeMapPicker(){if($('#mapModal').hidden)return;$('#mapModal').hidden=true;$('#coMapBtn').focus()}
$('#coMapBtn').addEventListener('click',openMapPicker);$('#mapClose').addEventListener('click',closeMapPicker);
$('#mapModal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeMapPicker()}); // a click beside the window
$('#mapModal').addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();closeMapPicker()}});
$('#mapUse').addEventListener('click',()=>{const f=$('#coForm'),a=mapPick.found;for(const k of ['line1','postalCode','city','country'])if(a[k]){f[k].value=a[k];markField(f[k],'')}closeMapPicker();(f.postalCode.value?f.line2:f.postalCode).focus()});
$('#mapLocate').addEventListener('click',()=>{if(!navigator.geolocation||!mapPick)return($('#mapFound').textContent=tr('Your location is not available.'));navigator.geolocation.getCurrentPosition(p=>{const ll=L.latLng(p.coords.latitude,p.coords.longitude);mapPick.map.setView(ll,17);dropPin(ll)},()=>{$('#mapFound').textContent=tr('Your location is not available.')},{timeout:10000})});
// Stock problems (409) point back to the bag; the button names what is happening while the order is placed.
$('#coForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.target,btn=$('#coPlace'),label=btn.textContent;coError('');if(!checkForm(form))return;btn.disabled=true;btn.textContent=tr('Placing order…');form.setAttribute('aria-busy','true');coError('');try{await placeOrder(form)}catch(err){const el=err.field&&form.elements[err.field];if(el){markField(el,err.message);el.focus();showTip(el,err.message)}else coError(err.message,err.status===409?'bag':'')}finally{btn.disabled=!co.options;btn.textContent=label;form.removeAttribute('aria-busy')}});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if($('#searchPanel').classList.contains('open'))closeSearch();else if($('#filterDrawer').classList.contains('open'))closeFilters();else if($('.side-sub.open'))closeSub();else if($('#sideMenu').classList.contains('open'))closeMenu();else if($('#infoDrawer').classList.contains('open'))closeInfo();else if($('#cartDrawer').classList.contains('open'))closeCart();else if(!$('#checkout').hidden)return;/* Escape never drops a checkout form */else if(!$('#product').hidden)$('#pdpClose').click();else if(!$('#collection').hidden)$('#collectionClose').click()});
$('#filterOpen').addEventListener('click',openFilters);$('#filterClose').addEventListener('click',closeFilters);$('#filterApply').addEventListener('click',applyFilters);
$('#pdpSizes').addEventListener('click',e=>{const b=e.target.closest('[data-size]');if(b&&!b.disabled){pdp.size=b.dataset.size;renderSizePicker()}});
// A chip's ×: that filter goes, applied at once.
$('#activeFilters').addEventListener('click',e=>{const b=e.target.closest('[data-unfilter]');if(!b)return;const f=pick(coll.applied),k=b.dataset.unfilter,v=b.dataset.value;
if(k==='q')f.q='';else if(k==='price')f.min=f.max=null;else if(k==='sort')f.sort='new';else if(k==='gender')f.genders=f.genders.filter(x=>x!==v);else if(k==='group')f.types=f.types.filter(t=>!coll.opts.types[v].has(t));else if(k==='type')f.types=f.types.filter(t=>t!==v);else if(k==='brand')f.brands=f.brands.filter(x=>x!==v);else if(k==='colour')f.colors=f.colors.filter(x=>x!==v);else{const fam=k.slice(5);f.sizes[fam]=f.sizes[fam].filter(x=>x!==v)}
showApplied(f);($('#activeFilters [data-unfilter]')||$('#filterOpen')).focus({preventScroll:true})});
$('#filterClear').addEventListener('click',()=>{clearFilters();coll.sort='new';renderFilters()});
$('#fSearch').addEventListener('input',e=>{coll.q=e.target.value;renderFilters()});
$('#fSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyFilters()}});
// Gender, Category, Brands: ticks. Ticking a group (or a half-ticked one) ticks all its types; ticking a full group unticks them.
$('#filterDrawer').addEventListener('change',e=>{const t=e.target;if(t.matches('[data-cat-type]'))coll.types=toggled(coll.types,t.dataset.catType);else if(t.matches('[data-cat-group]')){const of=t.dataset.of.split('|'),all=of.every(x=>coll.types.includes(x));coll.types=all?coll.types.filter(x=>!of.includes(x)):[...new Set([...coll.types,...of])]}else if(t.matches('[data-brand]'))coll.brands=toggled(coll.brands,t.dataset.brand);else if(t.matches('[data-gender]'))coll.genders=toggled(coll.genders,t.dataset.gender);else return;renderFilters()});
$('#filterDrawer').addEventListener('click',e=>{const more=e.target.closest('[data-more]'),chip=e.target.closest('[data-size-v]');if(more){coll.open=toggled(coll.open,more.dataset.more);renderFilters()}else if(chip){const f=chip.closest('[data-size-family]').dataset.sizeFamily;coll.sizes[f]=toggled(coll.sizes[f],chip.dataset.sizeV);renderFilters()}});
$('#filterDrawer').addEventListener('scroll',e=>{if(e.target.classList?.contains('f-list'))markMore(e.target)},true);
$('#fSort').addEventListener('click',e=>{const b=e.target.closest('[data-sort]');if(b){coll.sort=coll.view.noSort?.includes('new')&&coll.sort===b.dataset.sort?'new':b.dataset.sort;renderFilters()}});
$('#fColors').addEventListener('click',e=>{const b=e.target.closest('[data-filter-color]');if(!b)return;const c=b.dataset.filterColor;coll.colors=toggled(coll.colors,c);renderFilters()});
// Price range: the low handle never passes the high one; at the ends of the line there is no limit.
$('#fMin').addEventListener('input',e=>{const v=Math.min(+e.target.value,coll.max??coll.top);coll.min=v>0?v:null;renderFilters()});
$('#fMax').addEventListener('input',e=>{const v=Math.max(+e.target.value,coll.min??0);coll.max=v<coll.top?v:null;renderFilters()});
$('#pdpColor').addEventListener('click',e=>{if(e.target.closest('#pdpColorBtn'))toggleColors($('#pdpColorList').hidden);const opt=e.target.closest('[data-color-index]');if(opt)chooseColor(+opt.dataset.colorIndex)});
$('#pdpColor').addEventListener('keydown',e=>{const list=$('#pdpColorList');if(!list)return;const opt=e.target.closest('[role=option]');
if(!opt){if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();toggleColors(true)}return} // Enter/Space click the button
const opts=[...list.children],i=opts.indexOf(opt),go=j=>opts[(j+opts.length)%opts.length].focus();
if(e.key==='ArrowDown'){e.preventDefault();go(i+1)}else if(e.key==='ArrowUp'){e.preventDefault();go(i-1)}else if(e.key==='Home'){e.preventDefault();go(0)}else if(e.key==='End'){e.preventDefault();go(opts.length-1)}
else if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseColor(i)}else if(e.key==='Escape'){e.stopPropagation();toggleColors(false);$('#pdpColorBtn').focus()}else if(e.key==='Tab')toggleColors(false)});
$('#pdpThumbs').addEventListener('click',e=>{const t=e.target.closest('[data-media]');if(t){pdp.index=+t.dataset.media;renderProduct()}});
$('#pdpInfo').addEventListener('click',()=>openInfo('info'));$('#pdpCare').addEventListener('click',()=>openInfo('care'));$('#pdpStore').addEventListener('click',()=>openInfo('store'));$('#infoClose').addEventListener('click',closeInfo);
$('#infoBody').addEventListener('click',e=>{if(e.target.id!=='readMore')return;const clamped=$('#infoDesc').classList.toggle('clamp');e.target.textContent=tr(clamped?'Read More':'Read Less')});
$('#infoBody').addEventListener('submit',async e=>{if(e.target.id!=='storeForm')return;e.preventDefault();const f=e.target,btn=f.querySelector('button'),msg=$('#storeMsg');btn.disabled=true;msg.textContent='';try{const d=await json('/api/store-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...Object.fromEntries(new FormData(f)),productId:pdp.product.id})});msg.textContent=d.message;f.reset()}catch(err){msg.textContent=err.message}finally{btn.disabled=false}});
$('#pdpShare').addEventListener('click',async()=>{const p=pdp.product;try{if(navigator.share)return await navigator.share({title:`${p.brand} ${p.name}`,url:location.href});await navigator.clipboard.writeText(location.href);$('#pdpShared').textContent=tr('Link copied');setTimeout(()=>{$('#pdpShared').textContent=''},2000)}catch{/* share sheet dismissed or clipboard unavailable */}});
// Newsletter: full name, email and phone, checked like the account forms (tips under the fields); a problem the server
// finds with one field shows on it.
$('#newsletterForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.target,btn=f.querySelector('[type=submit]'),msg=$('#newsletterMessage');msg.textContent='';if(!checkForm(f))return;btn.disabled=true;try{const d=await json('/api/newsletter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(f)))});msg.textContent=d.message;f.reset()}catch(x){const el=x.field&&f.elements[x.field];if(el){markField(el,x.message);el.focus();showTip(el,x.message)}else msg.textContent=x.message}finally{btn.disabled=false}});
init();
// Story band: images in a viewport-pinned layer count as on screen from the start, so they are only named once the band is near (as in Subashi Metal's ParallaxBand).
(()=>{const band=$('#story');if(!band)return;const io=new IntersectionObserver(([e])=>{if(!e.isIntersecting)return;band.querySelectorAll('img[data-src]').forEach(i=>{i.src=i.dataset.src});io.disconnect()},{rootMargin:'100% 0px'});io.observe(band)})();
// Header scroll behaviour (see syncHeader).
addEventListener('scroll',()=>{if(!hdrRaf)hdrRaf=requestAnimationFrame(syncHeader)},{passive:true});syncHeader();
