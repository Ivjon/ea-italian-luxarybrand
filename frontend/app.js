// Bag items are {id, color}; bags saved before colours existed hold plain ids.
const loadCart=()=>{try{const c=JSON.parse(localStorage.getItem('ea-cart')||'[]');return Array.isArray(c)?c.map(x=>typeof x==='string'?{id:x,color:''}:x).filter(x=>x&&x.id):[]}catch{return[]}};
const state={products:[],cart:loadCart(),category:'All'};
// Collection panel: a full-screen product list for the current #hash (see viewFor). fromPage: the hash was set by navigating inside the site, so closing can go back.
// Filters: brand (dropdown) + the Filter panel: sort, price (max: highest price shown, null = no limit), colours (any of).
// size: chosen size per size chart ({clothing:'M', shoes:'39'}); sale: only discounted pieces. top: the view's highest price.
const coll={key:null,view:null,brand:'All',colors:[],size:{},sale:false,max:null,top:0,sort:'new',fromPage:false};
// Product types (the "type" field in products.json) listed under the Jewellery and Shoes menus, and the care guide; see catalog.js.
const GROUPS=EA_CATALOG.groups, CARE=EA_CATALOG.care;
const $=s=>document.querySelector(s), money=n=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
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
// Home page New Arrivals: pieces ticked "New arrival" in the CRM, newest first (the latest pieces until any are ticked).
const newArrivals=()=>{const ticked=state.products.filter(p=>p.isNew);return(ticked.length?ticked:state.products.slice(-8)).slice().reverse()};
const newBadge=p=>p.isNew?'<span class="badge-new">New arrival</span>':'';
// Brand logo (assets/brands/<brand>.png). All logo files share one canvas height, so a single CSS height sizes them
// while keeping their relative sizes; a brand without a logo file falls back to its name. ?v= busts old cached cuts.
const brandLogo=b=>`<img src="/assets/brands/${slug(b)}.png?v=2" alt="${esc(b)}" onerror="this.replaceWith(this.alt)">`;
// #all, #men, #women, #watches, #jewellery[/type], #shoes[/type], #brand/<brand>, #search/<query> -> {title, test, brand?, search?}; any other hash -> null.
function viewFor(hash){if(/^#search\//i.test(hash)){let q='';try{q=decodeURIComponent(hash.slice(8)).trim()}catch{}return q?{title:`Results for “${q}”`,test:p=>matchesSearch(p,q),search:true}:null}const[a,b]=hash.slice(1).toLowerCase().split('/');if(a==='all')return{title:'All products',test:()=>true};if(a==='men'||a==='women'){const c=cap(a);return{title:c,test:p=>inCategory(p,c)}}if(a==='kids')return{title:'Kids',test:p=>p.category==='Kids'};if(a==='watches')return{title:'Watches',test:p=>p.type==='Watches'};if(GROUPS[a]){const types=b?GROUPS[a].filter(t=>slug(t)===b):GROUPS[a];return types.length?{title:b?types[0]:cap(a),test:p=>types.includes(p.type)}:null}if(a==='brand'){const brand=[...new Set(state.products.map(p=>p.brand))].find(x=>slug(x)===b);return brand?{title:brand,test:p=>p.brand===brand,brand:true}:null}return null}
async function json(url,opts){const r=await fetch(url,opts);const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.message||`Request failed (${r.status})`),{status:r.status});return d}
async function init(){try{const[products,brands]=await Promise.all([json('/api/products'),json('/api/brands')]);state.products=products;$('#brandRow').innerHTML=brands.map(b=>`<a class="brand-pill" href="#brand/${slug(b)}">${brandLogo(b)}</a>`).join('');renderMenu(brands)}catch(err){$('#productGrid').innerHTML=`<div class="empty">The collection could not be loaded. Is the backend running? (${esc(err.message)})</div>`;return}renderProducts();renderCart();await loadAccount();route()}
const productCard=p=>`<article class="product-card"><a class="product-image" href="#product/${esc(p.id)}"><img src="${esc(p.image)}" alt="${esc(p.brand)} ${esc(p.name)}">${newBadge(p)}</a><div class="product-meta"><div class="product-brand">${esc(p.brand)}</div><h3 class="product-name"><a href="#product/${esc(p.id)}">${esc(p.name)}</a></h3><div class="product-row"><span class="product-price">${priceHtml(p)}</span>${productSizes(p).length?`<a class="add-btn" href="#product/${esc(p.id)}">${inStockSizes(p).length?'Select size':'Sold out'}</a>`:`<button class="add-btn" data-add="${esc(p.id)}" data-color="${esc(productColors(p)[0]?.name)}">Add to bag</button>`}</div></div></article>`;
// Home grid: the New Arrivals (search has its own panel and collection view).
function renderProducts(){const rows=newArrivals().filter(p=>state.category==='All'||inCategory(p,state.category));$('#productGrid').innerHTML=rows.length?rows.map(productCard).join(''):'<div class="empty">No pieces found.</div>'}
// Sort "New arrivals": pieces ticked "New arrival" first, each group newest first (the product added last in products.json).
function renderCollection(){const inView=state.products.filter(coll.view.test);const brands=[...new Set(inView.map(p=>p.brand))];if(!brands.includes(coll.brand))coll.brand='All';$('#collectionBrand').hidden=!!coll.view.brand;$('#collectionBrand').innerHTML=['All',...brands].map(b=>`<option value="${esc(b)}"${b===coll.brand?' selected':''}>${b==='All'?'All brands':esc(b)}</option>`).join('');
const colors=[...new Set(inView.flatMap(p=>productColors(p).map(c=>c.name)))].sort((a,b)=>a.localeCompare(b));coll.colors=coll.colors.filter(c=>colors.includes(c));
// sizes in stock per size chart; any size the admin adds in the CRM shows up here automatically
const bySize={};for(const p of inView)for(const s of inStockSizes(p))(bySize[sizeKind(p)]||=new Set()).add(s);const kinds=Object.keys(SIZE_TYPES).filter(k=>bySize[k]).map(k=>({kind:k,sizes:EA_CATALOG.sortSizes([...bySize[k]])}));
for(const k in coll.size)if(!bySize[k])delete coll.size[k];const sale=inView.some(p=>p.discount);if(!sale)coll.sale=false;
const top=coll.top=inView.length?Math.max(...inView.map(priceOf)):0,max=Math.min(coll.max??top,top);coll.max=max<top?max:null;
const sizeFilters=Object.entries(coll.size),sizeOk=p=>!sizeFilters.length||sizeFilters.some(([k,v])=>sizeKind(p)===k&&inStockSizes(p).some(s=>sameSize(s,v)));
const rows=inView.filter(p=>(coll.brand==='All'||p.brand===coll.brand)&&(!coll.colors.length||productColors(p).some(c=>coll.colors.includes(c.name)))&&sizeOk(p)&&(!coll.sale||p.discount>0)&&priceOf(p)<=max);
if(coll.sort==='new'){rows.reverse();rows.sort((a,b)=>(b.isNew?1:0)-(a.isNew?1:0))}else rows.sort((a,b)=>coll.sort==='price-asc'?priceOf(a)-priceOf(b):priceOf(b)-priceOf(a));
$('#collectionCount').textContent=`${rows.length} ${rows.length===1?'piece':'pieces'}`;$('#collectionGrid').innerHTML=rows.length?rows.map(productCard).join(''):`<div class="empty">${inView.length?'No pieces match these filters.':coll.view.search?'Nothing matches this search. Try a brand name, or a piece such as “blazer” or “sandal”.':'New pieces are arriving soon.'}</div>`;renderFilters(inView,colors,kinds,sale,rows.length)}
// Filter panel. Controls are only rebuilt when their options change, never while a customer drags or types.
function renderFilters(inView,colors,kinds,sale,count){
$('#fSizeSec').hidden=!kinds.length;const sizeKey=kinds.map(k=>`${k.kind}:${k.sizes.join(',')}`).join('|');
if($('#fSizes').dataset.key!==sizeKey){$('#fSizes').dataset.key=sizeKey;$('#fSizes').innerHTML=kinds.map(({kind,sizes})=>{const t=SIZE_TYPES[kind];return t.input==='select'
?`<label class="size-filter"><span>${t.label}</span><select data-size-kind="${kind}"><option value="">All sizes</option>${sizes.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select></label>`
:`<label class="size-filter"><span>${t.label}</span><input data-size-kind="${kind}" list="sizes-${kind}" inputmode="decimal" autocomplete="off" placeholder="Type your size, e.g. ${esc(sizes[Math.floor(sizes.length/2)])}"><datalist id="sizes-${kind}">${sizes.map(s=>`<option value="${esc(s)}">`).join('')}</datalist></label><p class="size-note" data-size-note="${kind}"></p>`}).join('')}
for(const{kind,sizes}of kinds){const el=$(`#fSizes [data-size-kind="${kind}"]`),v=coll.size[kind]||'';if(document.activeElement!==el)el.value=v;const note=$(`#fSizes [data-size-note="${kind}"]`);if(note)note.textContent=!v?`Available: ${sizes.join(', ')}`:sizes.some(s=>sameSize(s,v))?'':`Not available in ${v}. Available: ${sizes.join(', ')}`}
$('#fSaleSec').hidden=!sale;$('#fSale').setAttribute('aria-pressed',coll.sale);
document.querySelectorAll('#fSort [data-sort]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.sort===coll.sort));
// Price: one handle on a straight line from €0 to the view's highest price (after discounts), moving smoothly in €1 steps.
const top=coll.top,max=coll.max??top,price=$('#fMax');$('#fPriceSec').hidden=!top;price.max=top;price.value=max;price.setAttribute('aria-valuetext',money(max));
$('#fFill').style.width=`${top?max/top*100:0}%`;$('#fValues').textContent=`${money(0)} – ${money(max)}`;
$('#fColorSec').hidden=!colors.length;if($('#fColors').dataset.key!==colors.join('|')){$('#fColors').dataset.key=colors.join('|');const hex={};inView.flatMap(productColors).forEach(c=>{if(c.hex&&!hex[c.name])hex[c.name]=c.hex});$('#fColors').innerHTML=colors.map(c=>`<button data-filter-color="${esc(c)}"><span class="sq${hex[c]?'':' none'}"${hex[c]?` style="background:${esc(hex[c])}"`:''}></span>${esc(c)}</button>`).join('')}
$('#fColors').querySelectorAll('[data-filter-color]').forEach(b=>b.setAttribute('aria-pressed',coll.colors.includes(b.dataset.filterColor)));
const active=coll.colors.length+Object.keys(coll.size).length+(coll.sale?1:0)+(coll.max!==null?1:0);$('#filterCount').textContent=active?` (${active})`:'';$('#filterApply').textContent=`View results (${count})`;$('#filterClear').hidden=!active&&coll.sort==='new'}
function openFilters(){$('#filterDrawer').classList.add('open');syncOverlay();$('#filterClose').focus()}
function closeFilters(){$('#filterDrawer').classList.remove('open');syncOverlay()}
// Brand loader while a collection opens: the EA mark fills from the bottom up (CSS, 1.2s), holds, then fades out.
let loaderTimer;
function showLoader(){const l=$('#loader');clearTimeout(loaderTimer);l.classList.remove('done');l.hidden=false;loaderTimer=setTimeout(()=>{l.classList.add('done');loaderTimer=setTimeout(()=>{l.hidden=true},350)},1500)}
function hideLoader(){clearTimeout(loaderTimer);$('#loader').hidden=true}
// The page behind full-screen panels doesn't scroll; the overlay dims the page while a drawer is open.
function syncLock(){document.body.classList.toggle('locked',!$('#collection').hidden||!$('#product').hidden||!$('#checkout').hidden||!$('#account').hidden)}
function syncOverlay(){$('#overlay').classList.toggle('show',['#cartDrawer','#sideMenu','#infoDrawer','#filterDrawer','#searchPanel'].some(s=>$(s).classList.contains('open')))}
function openCollection(key,view){showLoader();if(coll.key!==key){coll.brand='All';coll.colors=[];coll.size={};coll.sale=false;coll.max=null}coll.key=key;coll.view=view;$('#collectionTitle').textContent=view.title;renderCollection();$('#collection').hidden=false;$('#collection').scrollTop=0;syncLock()}
function closeCollection(){hideLoader();closeFilters();$('#collection').hidden=true;syncLock()}
// #checkout opens the checkout on top of whatever is open; #product/<id> opens the product page on top (a collection
// underneath stays as it was); other hashes go to viewFor.
function route(){if(location.hash==='#account')return openAccount();closeAccount();if(location.hash==='#checkout')return openCheckout();closeCheckout();const m=/^#product\/(.+)$/.exec(location.hash);const product=m&&state.products.find(p=>p.id===decodeURIComponent(m[1]));if(product)return openProduct(product);closeProduct();const key=location.hash.toLowerCase(),view=state.products.length?viewFor(location.hash):null;if(!view)return closeCollection();if(coll.key!==key||$('#collection').hidden)openCollection(key,view)}

// Product page: media gallery, Find a store / Add to bag, Info & Details and Product care drawers.
const pdp={product:null,index:0,colorIndex:0};
const productMedia=p=>p.media&&p.media.length?p.media:[{type:'image',src:p.image}];
// Opening from a collection filtered by colour preselects that colour.
function openProduct(p){if(pdp.product!==p){pdp.product=p;pdp.index=0;pdp.size=inStockSizes(p).find(s=>coll.size[sizeKind(p)]&&sameSize(s,coll.size[sizeKind(p)]))||'';pdp.colorIndex=Math.max(0,productColors(p).findIndex(c=>coll.colors.includes(c.name)))}renderProduct();$('#product').hidden=false;$('#product').scrollTop=0;syncLock()}
// One colour: shown as text. Several: a dropdown; the chosen colour goes into the bag with the product.
function renderColorPicker(){const colors=productColors(pdp.product),cur=colors[pdp.colorIndex]||colors[0];
$('#pdpColor').innerHTML=!cur?'':colors.length===1?`<b>Color:</b> ${swatch(cur)}${esc(cur.name)}`:`<b>Color:</b><div class="color-select"><button class="color-current" id="pdpColorBtn" aria-haspopup="listbox" aria-expanded="false" aria-label="Color: ${esc(cur.name)}, choose another colour">${swatch(cur)}<span>${esc(cur.name)}</span><span class="caret" aria-hidden="true"></span></button><ul class="color-options" id="pdpColorList" role="listbox" aria-label="Colours" hidden>${colors.map((c,i)=>`<li role="option" data-color-index="${i}" aria-selected="${i===pdp.colorIndex}" tabindex="-1">${swatch(c)}${esc(c.name)}</li>`).join('')}</ul></div>`;
$('#pdpAdd').dataset.color=cur?cur.name:''}
// Size buttons (sold-out sizes can't be chosen). A product with sizes needs one chosen before it goes in the bag.
function renderSizePicker(){const p=pdp.product,list=productSizes(p),add=$('#pdpAdd'),box=$('#pdpSizes');
if(!list.length){box.innerHTML='';delete add.dataset.needSize;delete add.dataset.size;add.disabled=false;add.textContent='Add to bag';return}
const sizes=EA_CATALOG.sortSizes(list.map(s=>s.size)).map(n=>list.find(s=>s.size===n)),cur=sizes.find(s=>s.size===pdp.size&&s.qty>0),soldOut=!sizes.some(s=>s.qty>0);if(!cur)pdp.size='';
box.innerHTML=`<p class="pdp-size-label"><b>Size:</b> ${cur?esc(cur.size):'<span>Select a size</span>'}</p><div class="size-chips">${sizes.map(s=>`<button data-size="${esc(s.size)}" aria-pressed="${s.size===pdp.size}"${s.qty?'':` disabled aria-label="${esc(s.size)}, sold out"`}>${esc(s.size)}</button>`).join('')}</div><p class="pdp-size-msg" id="pdpSizeMsg" role="alert">${cur&&cur.qty<=3?`Only ${cur.qty} left in this size`:''}</p>`;
add.dataset.needSize='1';add.dataset.size=pdp.size;add.disabled=soldOut;add.textContent=soldOut?'Sold out':'Add to bag'}
function closeProduct(){closeInfo();$('#product').hidden=true;$('#pdpStage').innerHTML='';syncLock()}
function renderProduct(){const p=pdp.product,media=productMedia(p),m=media[pdp.index]||media[0];$('#pdpBrand').textContent=p.brand;$('#pdpName').textContent=p.name;$('#pdpPrice').innerHTML=priceHtml(p);renderColorPicker();renderSizePicker();$('#pdpAdd').dataset.add=p.id;
$('#pdpStage').innerHTML=(m.type==='video'?`<video src="${esc(m.src)}" controls playsinline preload="metadata"></video>`:`<img src="${esc(m.src)}" alt="${esc(p.brand)} ${esc(p.name)}">`)+newBadge(p);
$('#pdpThumbs').innerHTML=media.length>1?media.map((x,i)=>`<button class="pdp-thumb${i===pdp.index?' active':''}" data-media="${i}" aria-label="Show ${x.type} ${i+1} of ${media.length}">${x.type==='video'?`<video src="${esc(x.src)}#t=0.1" muted playsinline preload="metadata"></video><span class="play" aria-hidden="true">▶</span>`:`<img src="${esc(x.src)}" alt="">`}</button>`).join(''):'';
const group=Object.keys(GROUPS).find(g=>GROUPS[g].includes(p.type));const crumbs=[['Home','#top'],p.category!=='Unisex'&&[p.category,`#${slug(p.category)}`],p.type&&[p.type,group?`#${group}/${slug(p.type)}`:''],[p.name,'']].filter(Boolean);
$('#pdpCrumbs').innerHTML=crumbs.map(([t,h])=>h?`<a href="${h}">${esc(t)}</a>`:`<span>${esc(t)}</span>`).join('<span aria-hidden="true"> / </span>');
$('#pdpInfo').hidden=!(p.description||p.composition||p.details?.length||p.code);$('#pdpCare').hidden=!(p.care?.length||p.composition||p.careNote)}
const section=(title,body)=>body?`<h3>${title}</h3>${body}`:'', para=t=>t?`<p>${esc(t)}</p>`:'';
function openInfo(kind){const p=pdp.product;let title,html;
if(kind==='info'){title='Info & Details';html=section('Product Description',p.description&&`<p class="clamp" id="infoDesc">${esc(p.description)}</p><button class="read-more" id="readMore" hidden>Read More</button>`)+section('Composition',para(p.composition))+section('Details',p.details?.length&&`<p>${p.details.map(esc).join('<br>')}</p>`)+section('Product code',para(p.code))}
else if(kind==='care'){title='Product care';html='<p>For each product, you can find information for optimal care of your garments both on the website as well as on the labels of our garments.</p>'+section('Composition',para(p.composition))+section('Directions for garment care',(p.care||[]).map(k=>CARE.find(c=>c.key===k)).filter(Boolean).map(c=>`<div class="care-item"><h4>${c.svg}<span>${esc(c.title)}</span></h4><p>${esc(c.text)}</p></div>`).join(''))+section('Care notes',para(p.careNote))}
else{title='Find a store';html='<p>See this piece in person at an EA Luxury boutique. Leave your details and a client advisor will contact you about availability and arrange your visit.</p><form class="store-form" id="storeForm"><label>Name<input name="name" required maxlength="120" autocomplete="name"></label><label>Email<input name="email" type="email" required autocomplete="email"></label><button>Request an appointment</button><p class="store-msg" id="storeMsg" role="status"></p></form>'}
$('#infoTitle').textContent=title;$('#infoBody').innerHTML=html;$('#infoBody').scrollTop=0;$('#infoDrawer').classList.add('open');syncOverlay();const d=$('#infoDesc');if(d)$('#readMore').hidden=d.scrollHeight<=d.clientHeight+1;$('#infoClose').focus()}
function closeInfo(){$('#infoDrawer').classList.remove('open');syncOverlay()}

// Side menu (☰): brands with their logos, shop links, and the Jewellery / Shoes sub-menus built from GROUPS.
function renderMenu(brands){$('#sideBrands').innerHTML=brands.map(b=>`<li><a href="#brand/${slug(b)}">${brandLogo(b)}</a></li>`).join('');for(const g in GROUPS)$(`#side-${g}`).innerHTML=[[`All ${g}`,`#${g}`],...GROUPS[g].map(t=>[t,`#${g}/${slug(t)}`])].map(([t,h])=>`<li><a href="${h}">${esc(t)}</a></li>`).join('')}
function showPanel(name){document.querySelectorAll('.side-panel').forEach(p=>{p.hidden=p.dataset.panel!==name})}
function openMenu(){showPanel('main');$('#sideMenu').classList.add('open');syncOverlay();$('#sideClose').focus()}
function closeMenu(){$('#sideMenu').classList.remove('open');syncOverlay()}
function saveCart(){localStorage.setItem('ea-cart',JSON.stringify(state.cart));renderCart();if(!$('#checkout').hidden){coError('');renderCheckout()}} // the bag can be edited on top of the checkout
// Product page colour dropdown (a listbox so each colour shows its swatch): click, or arrows / Enter / Escape.
function toggleColors(open){const list=$('#pdpColorList');if(!list||list.hidden===!open)return;list.hidden=!open;$('#pdpColorBtn').setAttribute('aria-expanded',open);if(open)(list.querySelector('[aria-selected="true"]')||list.firstElementChild).focus()}
function chooseColor(i){pdp.colorIndex=i;renderColorPicker();$('#pdpColorBtn').focus()}
function renderCart(){const count=state.cart.length;document.querySelectorAll('.bag-count').forEach(el=>{el.textContent=count});$('#bagOpen').dataset.count=count;$('#bagOpen').setAttribute('aria-label',`Bag, ${count} ${count===1?'item':'items'}`);$('#checkoutBtn').disabled=!count;const items=$('#cartItems');if(!items)return;if(!count){items.innerHTML='<p>Your bag is empty.</p>';$('#cartTotal').textContent=money(0);return}items.innerHTML=state.cart.map((item,i)=>{const p=state.products.find(x=>x.id===item.id);if(!p)return'';const c=item.color&&(productColors(p).find(x=>x.name===item.color)||{name:item.color});return`<div class="cart-item"><img class="cart-thumb" src="${esc(p.image)}" alt=""><div><h4>${esc(p.name)}</h4><div class="product-brand">${esc(p.brand)}</div>${c?`<p class="cart-color">${swatch(c)}${esc(c.name)}</p>`:''}${item.size?`<p class="cart-size">Size: ${esc(item.size)}</p>`:''}<p>${priceHtml(p)}</p></div><button class="remove" data-remove="${i}" aria-label="Remove ${esc(p.name)}">×</button></div>`}).join('');$('#cartTotal').textContent=money(state.cart.reduce((s,item)=>{const p=state.products.find(x=>x.id===item.id);return s+(p?priceOf(p):0)},0))}
// Like the menu and info drawers, the bag takes focus when it opens and hands it back when it closes.
let cartReturn=null;
// My account (#account): sign in or create an account, then the customer's orders with where each one is.
const acct={account:null};
const STEPS=[['Processing','Order placed'],['Shipped','On its way'],['Delivered','Delivered']];
const longDate=d=>new Date(`${d}T12:00`).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
async function loadAccount(){try{const r=await fetch('/api/account/me'),d=await r.json().catch(()=>({}));acct.account=r.ok?d.account:null}catch{acct.account=null}syncAccountLink()}
function syncAccountLink(){const a=$('#accountLink');a.setAttribute('aria-label',acct.account?`My account, signed in as ${acct.account.name}`:'Sign in or create an account');a.classList.toggle('signed-in',!!acct.account)}
function openAccount(){$('#account').hidden=false;$('#account').scrollTop=0;syncLock();renderAccount()}
function closeAccount(){$('#account').hidden=true;syncLock()}
const pwField=(id,name,auto,extra='')=>`<span class="acct-pw"><input id="${id}" name="${name}" type="password" autocomplete="${auto}" required maxlength="200"${extra}><button type="button" class="acct-show" data-show="${id}" aria-pressed="false">Show</button></span>`;
function authHtml(){return `<div class="acct-auth"><p class="kicker">My account</p><h1 id="acctTitle">Sign in or create an account</h1><p class="co-lead acct-lead">See everything you have bought, follow each order until it arrives and check out faster.</p>
<div class="acct-tabs" role="tablist"><button type="button" role="tab" id="tabSignin" aria-controls="signinForm" aria-selected="true">Sign in</button><button type="button" role="tab" id="tabSignup" aria-controls="signupForm" aria-selected="false">Create account</button></div>
<form class="co-form acct-form" id="signinForm" role="tabpanel" aria-labelledby="tabSignin"><label>Email<input name="email" type="email" autocomplete="email" required maxlength="254" spellcheck="false"></label><label for="siPw">Password</label>${pwField('siPw','password','current-password')}<p class="co-error" role="alert"></p><button type="submit" class="pdp-btn solid">Sign in</button></form>
<form class="co-form acct-form" id="signupForm" role="tabpanel" aria-labelledby="tabSignup" hidden><label>Name<input name="name" autocomplete="name" required maxlength="120"></label><label>Email<input name="email" type="email" autocomplete="email" required maxlength="254" spellcheck="false"></label><label for="suPw">Password <small>at least 8 characters</small></label>${pwField('suPw','password','new-password',' minlength="8"')}<p class="co-error" role="alert"></p><button type="submit" class="pdp-btn solid">Create account</button></form>
<p class="acct-staff">Store staff? <a href="/admin/login.html">Sign in to the CRM</a></p></div>`}
const tracker=o=>{const at=STEPS.findIndex(s=>s[0]===o.status);return `<ol class="acct-track" aria-label="Order status: ${esc(o.status)}">${STEPS.map(([,label],i)=>`<li class="${i<=at?'done':''}"${i===at?' aria-current="step"':''}>${label}</li>`).join('')}</ol>`};
const orderCard=o=>`<article class="acct-order"><header><div><h3>Order ${esc(o.id)}</h3><p>${esc(longDate(o.date))}</p></div><b>${money(o.total)}</b></header>${tracker(o)}${o.lines?`<ul class="acct-lines">${o.lines.map(l=>`<li><img src="${esc(l.image)}" alt=""><div><span class="product-brand">${esc(l.brand)}</span><b>${esc(l.name)}</b><small>${[l.color,l.size&&`Size ${l.size}`,l.qty>1&&`Quantity ${l.qty}`].filter(Boolean).map(esc).join(' · ')}</small></div><span>${money(l.price*l.qty)}</span></li>`).join('')}</ul>`:`<p class="acct-note">${o.items} ${o.items===1?'piece':'pieces'}</p>`}${o.delivery||o.payment?`<p class="acct-note">${[o.delivery,o.payment].filter(Boolean).map(esc).join(' · ')}</p>`:''}</article>`;
async function renderAccount(){const main=$('#acctMain');if(!acct.account){main.innerHTML=authHtml();main.querySelector('#signinForm input').focus({preventScroll:true});return}
const a=acct.account;main.innerHTML=`<div class="acct-home"><p class="kicker">My account</p><h1 id="acctTitle">Hello, ${esc(a.name.split(' ')[0])}</h1><p class="acct-who">Signed in as ${esc(a.email)} · <button type="button" class="acct-out" id="acctSignOut">Sign out</button></p><h2>Your orders</h2><div id="acctOrders"><p class="co-wait">Loading your orders…</p></div></div>`;
try{const orders=await json('/api/account/orders');$('#acctOrders').innerHTML=orders.length?orders.map(orderCard).join(''):'<div class="acct-empty"><p>No orders yet. Orders you place while signed in, or with this email, appear here with their status.</p><a class="pdp-btn solid co-continue" href="#all">Discover the collection</a></div>'}
catch(err){if(err.status===401){acct.account=null;syncAccountLink();return renderAccount()}$('#acctOrders').innerHTML=`<p class="co-error">Your orders could not be loaded. ${esc(err.message)} <button type="button" id="acctRetry">Try again</button></p>`}}
$('#acctMain').addEventListener('click',async e=>{const tab=e.target.closest('[role=tab]');if(tab){const up=tab.id==='tabSignup';$('#tabSignin').setAttribute('aria-selected',!up);$('#tabSignup').setAttribute('aria-selected',up);$('#signinForm').hidden=up;$('#signupForm').hidden=!up;$(`#${up?'signupForm':'signinForm'} input`).focus();return}
const show=e.target.closest('[data-show]');if(show){const i=$(`#${show.dataset.show}`),reveal=i.type==='password';i.type=reveal?'text':'password';show.textContent=reveal?'Hide':'Show';show.setAttribute('aria-pressed',reveal);i.focus();return}
if(e.target.id==='acctRetry')renderAccount();if(e.target.id==='acctSignOut'){try{await json('/api/account/logout',{method:'POST'})}catch{}acct.account=null;syncAccountLink();renderAccount()}});
$('#acctMain').addEventListener('submit',async e=>{const f=e.target;if(f.id!=='signinForm'&&f.id!=='signupForm')return;e.preventDefault();const btn=f.querySelector('[type=submit]'),err=f.querySelector('.co-error'),label=btn.textContent,up=f.id==='signupForm';btn.disabled=true;btn.textContent=up?'Creating your account…':'Signing in…';err.textContent='';
try{const d=await json(`/api/account/${up?'signup':'login'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(f)))});acct.account=d.account;syncAccountLink();renderAccount()}catch(x){err.innerHTML=x.status===409?`${esc(x.message)} <button type="button" data-goto-signin>Sign in</button>`:esc(x.message);btn.disabled=false;btn.textContent=label}});
$('#acctMain').addEventListener('click',e=>{if(!e.target.closest('[data-goto-signin]'))return;const email=$('#signupForm').email.value;$('#tabSignin').click();$('#signinForm').email.value=email;$('#siPw').focus()});
$('#acctClose').addEventListener('click',()=>closeHashPanel(closeAccount));
// Search panel: pieces matching every word of the query as you type; Enter opens them all as a collection (#search/<query>).
// Closing clears the query and hands focus back to whatever opened the panel.
const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const searchWords=q=>norm(q).split(/[^a-z0-9]+/).filter(Boolean);
const matchesSearch=(p,q)=>{const words=searchWords(q),text=norm(`${p.name} ${p.brand} ${p.category} ${p.type||''} ${productColors(p).map(c=>c.name).join(' ')}`);return words.length>0&&words.every(w=>text.includes(w))};
let searchReturn=null;
function openSearch(){searchReturn=document.activeElement;$('#searchPanel').classList.add('open');$('#searchOpen').setAttribute('aria-expanded','true');syncOverlay();$('#searchInput').focus()}
function closeSearch(){if(!$('#searchPanel').classList.contains('open'))return;$('#searchPanel').classList.remove('open');$('#searchOpen').setAttribute('aria-expanded','false');$('#searchInput').value='';renderSearch();syncOverlay();if($('#searchPanel').contains(document.activeElement))searchReturn?.focus()}
function renderSearch(){const q=$('#searchInput').value.trim(),box=$('#searchResults');if(!q){box.innerHTML='';$('#searchStatus').textContent='';return}
const hits=state.products.filter(p=>matchesSearch(p,q)),n=`${hits.length} ${hits.length===1?'piece':'pieces'}`,brands=[...new Set(state.products.map(p=>p.brand))];$('#searchStatus').textContent=hits.length?`${n} found`:'No pieces found';
box.innerHTML=hits.length?`<p class="search-count">${n}</p><ul class="search-list">${hits.slice(0,6).map(p=>`<li><a href="#product/${esc(p.id)}"><img src="${esc(p.image)}" alt="" loading="lazy"><span><span class="product-brand">${esc(p.brand)}</span><b>${esc(p.name)}</b><span class="search-price">${priceHtml(p)}</span></span></a></li>`).join('')}</ul><a class="search-all" href="#search/${encodeURIComponent(q)}">View all ${n}</a>`
:`<p class="search-none">Nothing matches “${esc(q)}”. Try one of our houses:</p><p class="search-brands">${brands.map(b=>`<a href="#brand/${slug(b)}">${esc(b)}</a>`).join('')}</p>`}
function openCart(){cartReturn=document.activeElement;$('#cartDrawer').classList.add('open');syncOverlay();$('#closeCart').focus()}
function closeCart(){if(!$('#cartDrawer').classList.contains('open'))return;$('#cartDrawer').classList.remove('open');syncOverlay();if(!$('#cartDrawer').contains(document.activeElement))return;const back=cartReturn?.isConnected?cartReturn:!$('#checkout').hidden?$('#coPlace'):null;back?.focus()}

// Checkout (#checkout): contact, address, delivery and payment, with the bag as the order summary. The server re-prices
// the bag, checks stock and records the order in the CRM. The form stays in the page, so what was typed is kept.
const co={options:null}; // delivery and payment choices from the server
// The bag as order lines (same piece, colour and size grouped with a quantity); pieces no longer in the store are left out.
function bagLines(){const lines=[];for(const item of state.cart){const p=state.products.find(x=>x.id===item.id);if(!p)continue;const color=item.color||'',size=item.size||'',line=lines.find(l=>l.p===p&&l.color===color&&l.size===size);if(line)line.qty++;else lines.push({p,color,size,qty:1})}return lines}
// The message above Place order, with the way out when there is one: back to the bag, or reload the options.
const CO_ACTIONS={bag:'<button type="button" data-open-cart>Review your bag</button>',retry:'<button type="button" id="coRetry">Try again</button>'};
function coError(msg,action){$('#coError').innerHTML=msg?`${esc(msg)} ${CO_ACTIONS[action]||''}`:''}
const coOption=(name,o,i)=>`<label class="co-option"><input type="radio" name="${name}" value="${esc(o.key)}" required${i?'':' checked'}><span><b>${esc(o.label)}</b><small>${esc(o.note)}</small></span>${'price' in o?`<em>${o.price?money(o.price):'Free'}</em>`:''}</label>`;
const coWait=text=>{$('#coDelivery').innerHTML=$('#coPayment').innerHTML=`<p class="co-wait">${text}</p>`};
async function openCheckout(){$('#checkout').hidden=false;$('#checkout').scrollTop=0;syncLock();coError('');renderCheckout();prefillCheckout();if(co.options)return;coWait('Loading…');
try{co.options=await json('/api/checkout');$('#coDelivery').innerHTML=co.options.delivery.map((o,i)=>coOption('delivery',o,i)).join('');$('#coPayment').innerHTML=co.options.payment.map((o,i)=>coOption('payment',o,i)).join('');renderCheckout()}catch{coWait('Not available right now.');coError('Delivery and payment options could not be loaded. Check your connection.','retry')}}
// A signed-in customer starts with their name and email filled in (never over what they typed).
function prefillCheckout(){const a=acct.account,f=$('#coForm');if(!a)return;const[first,...rest]=a.name.split(' ');if(!f.email.value)f.email.value=a.email;if(!f.firstName.value)f.firstName.value=first;if(!f.lastName.value)f.lastName.value=rest.join(' ')}
function closeCheckout(){$('#checkout').hidden=true;syncLock()}
function renderCheckout(){const lines=bagLines();$('#coMain').hidden=!lines.length;$('#coDone').hidden=!!lines.length;
if(!lines.length){$('#coDone').innerHTML='<p class="kicker">Checkout</p><h1>Your bag is empty</h1><p class="co-lead">Discover the collection and add the pieces you love.</p><a class="pdp-btn solid co-continue" href="#all">Continue shopping</a>';return}
const delivery=co.options?.delivery.find(d=>d.key===$('#coForm').elements.delivery?.value),subtotal=lines.reduce((s,l)=>s+priceOf(l.p)*l.qty,0),total=subtotal+(delivery?.price||0),count=lines.reduce((n,l)=>n+l.qty,0);
$('#coSumCount').textContent=`${count} ${count===1?'piece':'pieces'}`;$('#coSumTotal').textContent=money(total); // the collapsed summary on phones
$('#coLines').innerHTML=lines.map(l=>{const c=l.color&&(productColors(l.p).find(x=>x.name===l.color)||{name:l.color});return`<div class="co-line"><img src="${esc(l.p.image)}" alt=""><div><p class="product-brand">${esc(l.p.brand)}</p><h3>${esc(l.p.name)}</h3>${c?`<p class="cart-color">${swatch(c)}${esc(c.name)}</p>`:''}${l.size?`<p>Size ${esc(l.size)}</p>`:''}${l.qty>1?`<p>Quantity ${l.qty}</p>`:''}</div><span>${money(priceOf(l.p)*l.qty)}</span></div>`}).join('');
$('#coTotals').innerHTML=`<dt>Subtotal</dt><dd>${money(subtotal)}</dd><dt>Delivery</dt><dd>${!delivery?'—':delivery.price?money(delivery.price):'Free'}</dd><dt class="total">Total</dt><dd class="total">${money(total)}</dd>`;
$('#coPlace').textContent=`Place order · ${money(total)}`;$('#coPlace').disabled=!co.options}
// Placing the order: on success the bag is emptied, the form cleared and a confirmation shown.
async function placeOrder(form){const d=Object.fromEntries(new FormData(form));
const{order,paymentNote}=await json('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contact:{email:d.email,phone:d.phone,firstName:d.firstName,lastName:d.lastName},address:{line1:d.line1,line2:d.line2,postalCode:d.postalCode,city:d.city,country:d.country},delivery:d.delivery,payment:d.payment,note:d.note,items:state.cart.filter(i=>state.products.some(p=>p.id===i.id))})});
state.cart=[];saveCart();form.reset();const a=order.address;$('#coMain').hidden=true;$('#coDone').hidden=false;$('#checkout').scrollTop=0;
$('#coDone').innerHTML=`<p class="kicker">Order ${esc(order.id)}</p><h1 tabindex="-1">Thank you, ${esc(d.firstName)}</h1><p class="co-lead">Your order has been placed. A client advisor will contact you at ${esc(order.email)} to confirm the delivery.</p><dl class="co-facts"><dt>Total</dt><dd>${money(order.total)}</dd><dt>Payment</dt><dd>${esc(order.payment)}<small>${esc(paymentNote)}</small></dd><dt>Delivery</dt><dd>${esc(order.delivery)}</dd><dt>Ships to</dt><dd>${[order.customer,a.line1,a.line2,`${a.postalCode} ${a.city}`,a.country].filter(Boolean).map(esc).join('<br>')}</dd></dl>${acct.account?'<p class="co-track-link"><a href="#account">Follow this order in My account</a></p>':''}<a class="pdp-btn solid co-continue" href="#all">Continue shopping</a>`;$('#coDone h1').focus();
json('/api/products').then(p=>{state.products=p;renderProducts()}).catch(()=>{})} // fresh stock (sold sizes) for the store
document.addEventListener('click',e=>{const add=e.target.closest('[data-add]');if(add){if(add.dataset.needSize&&!add.dataset.size){$('#pdpSizeMsg').textContent='Please select a size.';$('#pdpSizes button:not([disabled])')?.focus();return}state.cart.push({id:add.dataset.add,color:add.dataset.color||'',size:add.dataset.size||''});saveCart();openCart()}if(!e.target.closest('.color-select'))toggleColors(false);const rem=e.target.closest('[data-remove]');if(rem){state.cart.splice(+rem.dataset.remove,1);saveCart();$('#closeCart').focus()}if(e.target.closest('[data-open-cart]'))openCart()});
document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.filter;document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));renderProducts()}));
$('#bagOpen').addEventListener('click',openCart);$('#closeCart').addEventListener('click',closeCart);$('#overlay').addEventListener('click',()=>{closeCart();closeMenu();closeInfo();closeFilters();closeSearch()});
$('#menuOpen').addEventListener('click',openMenu);$('#sideClose').addEventListener('click',closeMenu);
$('#sideMenu').addEventListener('click',e=>{const sub=e.target.closest('[data-sub]');if(sub)showPanel(sub.dataset.sub);if(e.target.closest('[data-back]'))showPanel('main');if(e.target.closest('a'))closeMenu()});
$('#searchOpen').addEventListener('click',openSearch);$('#searchClose').addEventListener('click',closeSearch);$('#searchInput').addEventListener('input',renderSearch);
$('#searchForm').addEventListener('submit',e=>{e.preventDefault();const q=$('#searchInput').value.trim();if(q)location.hash=`search/${encodeURIComponent(q)}`});
window.addEventListener('hashchange',()=>{coll.fromPage=true;closeSearch();route()});
// Closing goes back in history when the panel was opened from inside the site, otherwise just drops the hash.
const closeHashPanel=close=>{if(coll.fromPage)history.back();else{history.replaceState(null,'',location.pathname+location.search);close()}};
$('#collectionClose').addEventListener('click',()=>closeHashPanel(closeCollection));
$('#pdpClose').addEventListener('click',()=>closeHashPanel(closeProduct));
$('#checkoutBtn').addEventListener('click',()=>{closeCart();location.hash='checkout'});
$('#coClose').addEventListener('click',()=>closeHashPanel(closeCheckout));
$('#coDelivery').addEventListener('change',renderCheckout);
$('#coSumToggle').addEventListener('click',e=>{const b=e.currentTarget;b.setAttribute('aria-expanded',b.getAttribute('aria-expanded')!=='true')});
$('#coError').addEventListener('click',e=>{if(e.target.id==='coRetry')openCheckout()});
// Stock problems (409) point back to the bag; the button names what is happening while the order is placed.
$('#coForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.target,btn=$('#coPlace'),label=btn.textContent;btn.disabled=true;btn.textContent='Placing order…';form.setAttribute('aria-busy','true');coError('');try{await placeOrder(form)}catch(err){coError(err.message,err.status===409?'bag':'')}finally{btn.disabled=!co.options;btn.textContent=label;form.removeAttribute('aria-busy')}});
// Same wording as the server when the phone number doesn't fit the pattern.
$('#coForm').addEventListener('invalid',e=>{if(e.target.name==='phone'&&e.target.validity.patternMismatch)e.target.setCustomValidity('Please enter a valid phone number.');else if(e.target.name==='email'&&e.target.validity.patternMismatch)e.target.setCustomValidity('Please enter a valid email.')},true);
$('#coForm').addEventListener('input',e=>{if(e.target.validity?.customError)e.target.setCustomValidity('')});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if($('#searchPanel').classList.contains('open'))closeSearch();else if($('#filterDrawer').classList.contains('open'))closeFilters();else if($('#sideMenu').classList.contains('open'))closeMenu();else if($('#infoDrawer').classList.contains('open'))closeInfo();else if($('#cartDrawer').classList.contains('open'))closeCart();else if(!$('#checkout').hidden)return;/* Escape never drops a checkout form */else if(!$('#product').hidden)$('#pdpClose').click();else if(!$('#collection').hidden)$('#collectionClose').click()});
$('#collectionBrand').addEventListener('change',e=>{coll.brand=e.target.value;renderCollection()});
$('#filterOpen').addEventListener('click',openFilters);$('#filterClose').addEventListener('click',closeFilters);$('#filterApply').addEventListener('click',()=>{closeFilters();$('#collection').scrollTo({top:0})});
$('#pdpSizes').addEventListener('click',e=>{const b=e.target.closest('[data-size]');if(b&&!b.disabled){pdp.size=b.dataset.size;renderSizePicker()}});
$('#fSizes').addEventListener('input',e=>{const el=e.target.closest('[data-size-kind]');if(!el)return;const v=el.value.trim();if(v)coll.size[el.dataset.sizeKind]=v;else delete coll.size[el.dataset.sizeKind];renderCollection()});
$('#fSale').addEventListener('click',()=>{coll.sale=!coll.sale;renderCollection()});
$('#filterClear').addEventListener('click',()=>{coll.colors=[];coll.size={};coll.sale=false;coll.max=null;coll.sort='new';renderCollection()});
$('#fSort').addEventListener('click',e=>{const b=e.target.closest('[data-sort]');if(b){coll.sort=b.dataset.sort;renderCollection()}});
$('#fColors').addEventListener('click',e=>{const b=e.target.closest('[data-filter-color]');if(!b)return;const c=b.dataset.filterColor;coll.colors=coll.colors.includes(c)?coll.colors.filter(x=>x!==c):[...coll.colors,c];renderCollection()});
// Price slider: the handle sets the highest price shown; at the end of the line there is no limit. Clicking the line moves it there.
$('#fMax').addEventListener('input',e=>{const v=+e.target.value;coll.max=v<coll.top?v:null;renderCollection()});
$('#pdpColor').addEventListener('click',e=>{if(e.target.closest('#pdpColorBtn'))toggleColors($('#pdpColorList').hidden);const opt=e.target.closest('[data-color-index]');if(opt)chooseColor(+opt.dataset.colorIndex)});
$('#pdpColor').addEventListener('keydown',e=>{const list=$('#pdpColorList');if(!list)return;const opt=e.target.closest('[role=option]');
if(!opt){if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();toggleColors(true)}return} // Enter/Space click the button
const opts=[...list.children],i=opts.indexOf(opt),go=j=>opts[(j+opts.length)%opts.length].focus();
if(e.key==='ArrowDown'){e.preventDefault();go(i+1)}else if(e.key==='ArrowUp'){e.preventDefault();go(i-1)}else if(e.key==='Home'){e.preventDefault();go(0)}else if(e.key==='End'){e.preventDefault();go(opts.length-1)}
else if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseColor(i)}else if(e.key==='Escape'){e.stopPropagation();toggleColors(false);$('#pdpColorBtn').focus()}else if(e.key==='Tab')toggleColors(false)});
$('#pdpThumbs').addEventListener('click',e=>{const t=e.target.closest('[data-media]');if(t){pdp.index=+t.dataset.media;renderProduct()}});
$('#pdpInfo').addEventListener('click',()=>openInfo('info'));$('#pdpCare').addEventListener('click',()=>openInfo('care'));$('#pdpStore').addEventListener('click',()=>openInfo('store'));$('#infoClose').addEventListener('click',closeInfo);
$('#infoBody').addEventListener('click',e=>{if(e.target.id!=='readMore')return;const clamped=$('#infoDesc').classList.toggle('clamp');e.target.textContent=clamped?'Read More':'Read Less'});
$('#infoBody').addEventListener('submit',async e=>{if(e.target.id!=='storeForm')return;e.preventDefault();const f=e.target,btn=f.querySelector('button'),msg=$('#storeMsg');btn.disabled=true;msg.textContent='';try{const d=await json('/api/store-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...Object.fromEntries(new FormData(f)),productId:pdp.product.id})});msg.textContent=d.message;f.reset()}catch(err){msg.textContent=err.message}finally{btn.disabled=false}});
$('#pdpShare').addEventListener('click',async()=>{const p=pdp.product;try{if(navigator.share)return await navigator.share({title:`${p.brand} ${p.name}`,url:location.href});await navigator.clipboard.writeText(location.href);$('#pdpShared').textContent='Link copied';setTimeout(()=>{$('#pdpShared').textContent=''},2000)}catch{/* share sheet dismissed or clipboard unavailable */}});
$('#newsletterForm').addEventListener('submit',async e=>{e.preventDefault();const email=new FormData(e.target).get('email');try{const d=await json('/api/newsletter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});$('#newsletterMessage').textContent=d.message;e.target.reset()}catch(err){$('#newsletterMessage').textContent=err.message}});
init();
