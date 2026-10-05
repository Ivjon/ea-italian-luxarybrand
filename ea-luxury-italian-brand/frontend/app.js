// Bag items are {id, color}; bags saved before colours existed hold plain ids.
const loadCart=()=>{try{const c=JSON.parse(localStorage.getItem('ea-cart')||'[]');return Array.isArray(c)?c.map(x=>typeof x==='string'?{id:x,color:''}:x).filter(x=>x&&x.id):[]}catch{return[]}};
const state={products:[],cart:loadCart(),category:'All',search:''};
// Collection panel: a full-screen product list for the current #hash (see viewFor). fromPage: the hash was set by navigating inside the site, so closing can go back.
const coll={key:null,view:null,brand:'All',color:'All',price:'all',sort:'new',fromPage:false};
const PRICE_RANGES={all:[0,Infinity],'0-500':[0,500],'500-1000':[500,1000],'1000-':[1000,Infinity]};
// Product types (the "type" field in products.json) listed under the Jewellery and Shoes menus, and the care guide; see catalog.js.
const GROUPS=EA_CATALOG.groups, CARE=EA_CATALOG.care;
const $=s=>document.querySelector(s), money=n=>new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''), cap=s=>s[0].toUpperCase()+s.slice(1);
const inCategory=(p,c)=>p.category===c||p.category==='Unisex';
// Colours a product comes in, set in the CRM (older products have a single `color` / `colorHex`); the first is the main one.
const productColors=p=>p.colors||(p.color?[{name:p.color,hex:p.colorHex}]:[]);
const swatch=c=>`<span class="pdp-swatch${c.hex?'':' empty'}"${c.hex?` style="background:${esc(c.hex)}"`:''}></span>`;
// Brand logo (assets/brands/<brand>.png, cut at 3x the design size). The srcset density sets the display size and
// keeps the logos' relative sizes; a brand without a logo file falls back to its name.
const brandLogo=(b,density)=>`<img src="/assets/brands/${slug(b)}.png" srcset="/assets/brands/${slug(b)}.png ${density}x" alt="${esc(b)}" onerror="this.replaceWith(this.alt)">`;
// #all, #men, #women, #watches, #jewellery[/type], #shoes[/type], #brand/<brand> -> {title, test, brand?}; any other hash -> null.
function viewFor(hash){const[a,b]=hash.slice(1).toLowerCase().split('/');if(a==='all')return{title:'All products',test:()=>true};if(a==='men'||a==='women'){const c=cap(a);return{title:c,test:p=>inCategory(p,c)}}if(a==='watches')return{title:'Watches',test:p=>p.type==='Watches'};if(GROUPS[a]){const types=b?GROUPS[a].filter(t=>slug(t)===b):GROUPS[a];return types.length?{title:b?types[0]:cap(a),test:p=>types.includes(p.type)}:null}if(a==='brand'){const brand=[...new Set(state.products.map(p=>p.brand))].find(x=>slug(x)===b);return brand?{title:brand,test:p=>p.brand===brand,brand:true}:null}return null}
async function json(url,opts){const r=await fetch(url,opts);const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||`Request failed (${r.status})`);return d}
async function init(){try{const[products,brands]=await Promise.all([json('/api/products'),json('/api/brands')]);state.products=products;$('#brandRow').innerHTML=brands.map(b=>`<a class="brand-pill" href="#brand/${slug(b)}">${brandLogo(b,2.6)}</a>`).join('');renderMenu(brands)}catch(err){$('#productGrid').innerHTML=`<div class="empty">The collection could not be loaded. Is the backend running? (${esc(err.message)})</div>`;return}renderProducts();renderCart();route()}
const productCard=p=>`<article class="product-card"><a class="product-image" href="#product/${esc(p.id)}"><img src="${esc(p.image)}" alt="${esc(p.brand)} ${esc(p.name)}"></a><div class="product-meta"><div class="product-brand">${esc(p.brand)}</div><h3 class="product-name"><a href="#product/${esc(p.id)}">${esc(p.name)}</a></h3><div class="product-row"><span class="product-price">${money(p.price)}</span><button class="add-btn" data-add="${esc(p.id)}" data-color="${esc(productColors(p)[0]?.name)}">Add to bag</button></div></div></article>`;
function renderProducts(){const q=state.search.toLowerCase();const rows=state.products.filter(p=>(state.category==='All'||inCategory(p,state.category))&&(!q||`${p.name} ${p.brand} ${p.category} ${p.type||''}`.toLowerCase().includes(q)));$('#productGrid').innerHTML=rows.length?rows.map(productCard).join(''):'<div class="empty">No pieces found.</div>'}
// "New arrivals" = newest first, where newest is the product added last in products.json.
function renderCollection(){const inView=state.products.filter(coll.view.test);const brands=[...new Set(inView.map(p=>p.brand))];if(!brands.includes(coll.brand))coll.brand='All';$('#collectionBrand').hidden=!!coll.view.brand;$('#collectionBrand').innerHTML=['All',...brands].map(b=>`<option value="${esc(b)}"${b===coll.brand?' selected':''}>${b==='All'?'All brands':esc(b)}</option>`).join('');const colors=[...new Set(inView.flatMap(p=>productColors(p).map(c=>c.name)))].sort((a,b)=>a.localeCompare(b));if(!colors.includes(coll.color))coll.color='All';$('#collectionColor').hidden=!colors.length;$('#collectionColor').innerHTML=['All',...colors].map(c=>`<option value="${esc(c)}"${c===coll.color?' selected':''}>${c==='All'?'All colours':esc(c)}</option>`).join('');const[min,max]=PRICE_RANGES[coll.price];const rows=inView.filter(p=>(coll.brand==='All'||p.brand===coll.brand)&&(coll.color==='All'||productColors(p).some(c=>c.name===coll.color))&&p.price>=min&&p.price<max);if(coll.sort==='new')rows.reverse();else rows.sort((a,b)=>coll.sort==='price-asc'?a.price-b.price:b.price-a.price);$('#collectionCount').textContent=`${rows.length} ${rows.length===1?'piece':'pieces'}`;$('#collectionGrid').innerHTML=rows.length?rows.map(productCard).join(''):`<div class="empty">${inView.length?'No pieces match these filters.':'New pieces are arriving soon.'}</div>`}
// Brand loader while a collection opens: the EA mark fills from the bottom up (CSS, 1.2s), holds, then fades out.
let loaderTimer;
function showLoader(){const l=$('#loader');clearTimeout(loaderTimer);l.classList.remove('done');l.hidden=false;loaderTimer=setTimeout(()=>{l.classList.add('done');loaderTimer=setTimeout(()=>{l.hidden=true},350)},1500)}
function hideLoader(){clearTimeout(loaderTimer);$('#loader').hidden=true}
// The page behind full-screen panels doesn't scroll; the overlay dims the page while a drawer is open.
function syncLock(){document.body.classList.toggle('locked',!$('#collection').hidden||!$('#product').hidden)}
function syncOverlay(){$('#overlay').classList.toggle('show',['#cartDrawer','#sideMenu','#infoDrawer'].some(s=>$(s).classList.contains('open')))}
function openCollection(key,view){showLoader();if(coll.key!==key){coll.brand='All';coll.color='All'}coll.key=key;coll.view=view;$('#collectionTitle').textContent=view.title;renderCollection();$('#collection').hidden=false;$('#collection').scrollTop=0;syncLock()}
function closeCollection(){hideLoader();$('#collection').hidden=true;syncLock()}
// #product/<id> opens the product page on top (a collection underneath stays as it was); other hashes go to viewFor.
function route(){const m=/^#product\/(.+)$/.exec(location.hash);const product=m&&state.products.find(p=>p.id===decodeURIComponent(m[1]));if(product)return openProduct(product);closeProduct();const key=location.hash.toLowerCase(),view=state.products.length?viewFor(location.hash):null;if(!view)return closeCollection();if(coll.key!==key||$('#collection').hidden)openCollection(key,view)}

// Product page: media gallery, Find a store / Add to bag, Info & Details and Product care drawers.
const pdp={product:null,index:0,colorIndex:0};
const productMedia=p=>p.media&&p.media.length?p.media:[{type:'image',src:p.image}];
// Opening from a collection filtered by colour preselects that colour.
function openProduct(p){if(pdp.product!==p){pdp.product=p;pdp.index=0;pdp.colorIndex=Math.max(0,productColors(p).findIndex(c=>c.name===coll.color))}renderProduct();$('#product').hidden=false;$('#product').scrollTop=0;syncLock()}
// One colour: shown as text. Several: a dropdown; the chosen colour goes into the bag with the product.
function renderColorPicker(){const colors=productColors(pdp.product),cur=colors[pdp.colorIndex]||colors[0];
$('#pdpColor').innerHTML=!cur?'':colors.length===1?`<b>Color:</b> ${swatch(cur)}${esc(cur.name)}`:`<b>Color:</b><div class="color-select"><button class="color-current" id="pdpColorBtn" aria-haspopup="listbox" aria-expanded="false" aria-label="Color: ${esc(cur.name)}, choose another colour">${swatch(cur)}<span>${esc(cur.name)}</span><span class="caret" aria-hidden="true"></span></button><ul class="color-options" id="pdpColorList" role="listbox" aria-label="Colours" hidden>${colors.map((c,i)=>`<li role="option" data-color-index="${i}" aria-selected="${i===pdp.colorIndex}" tabindex="-1">${swatch(c)}${esc(c.name)}</li>`).join('')}</ul></div>`;
$('#pdpAdd').dataset.color=cur?cur.name:''}
function closeProduct(){closeInfo();$('#product').hidden=true;$('#pdpStage').innerHTML='';syncLock()}
function renderProduct(){const p=pdp.product,media=productMedia(p),m=media[pdp.index]||media[0];$('#pdpBrand').textContent=p.brand;$('#pdpName').textContent=p.name;$('#pdpPrice').textContent=money(p.price);renderColorPicker();$('#pdpAdd').dataset.add=p.id;
$('#pdpStage').innerHTML=m.type==='video'?`<video src="${esc(m.src)}" controls playsinline preload="metadata"></video>`:`<img src="${esc(m.src)}" alt="${esc(p.brand)} ${esc(p.name)}">`;
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
function renderMenu(brands){$('#sideBrands').innerHTML=brands.map(b=>`<li><a href="#brand/${slug(b)}">${brandLogo(b,3.2)}</a></li>`).join('');for(const g in GROUPS)$(`#side-${g}`).innerHTML=[[`All ${g}`,`#${g}`],...GROUPS[g].map(t=>[t,`#${g}/${slug(t)}`])].map(([t,h])=>`<li><a href="${h}">${esc(t)}</a></li>`).join('')}
function showPanel(name){document.querySelectorAll('.side-panel').forEach(p=>{p.hidden=p.dataset.panel!==name})}
function openMenu(){showPanel('main');$('#sideMenu').classList.add('open');syncOverlay();$('#sideClose').focus()}
function closeMenu(){$('#sideMenu').classList.remove('open');syncOverlay()}
function saveCart(){localStorage.setItem('ea-cart',JSON.stringify(state.cart));renderCart()}
// Product page colour dropdown (a listbox so each colour shows its swatch): click, or arrows / Enter / Escape.
function toggleColors(open){const list=$('#pdpColorList');if(!list||list.hidden===!open)return;list.hidden=!open;$('#pdpColorBtn').setAttribute('aria-expanded',open);if(open)(list.querySelector('[aria-selected="true"]')||list.firstElementChild).focus()}
function chooseColor(i){pdp.colorIndex=i;renderColorPicker();$('#pdpColorBtn').focus()}
function renderCart(){const count=state.cart.length;document.querySelectorAll('.bag-count').forEach(el=>{el.textContent=count});const items=$('#cartItems');if(!items)return;if(!count){items.innerHTML='<p>Your bag is empty.</p>';$('#cartTotal').textContent=money(0);return}items.innerHTML=state.cart.map((item,i)=>{const p=state.products.find(x=>x.id===item.id);if(!p)return'';const c=item.color&&(productColors(p).find(x=>x.name===item.color)||{name:item.color});return`<div class="cart-item"><img class="cart-thumb" src="${esc(p.image)}" alt=""><div><h4>${esc(p.name)}</h4><div class="product-brand">${esc(p.brand)}</div>${c?`<p class="cart-color">${swatch(c)}${esc(c.name)}</p>`:''}<p>${money(p.price)}</p></div><button class="remove" data-remove="${i}" aria-label="Remove ${esc(p.name)}">×</button></div>`}).join('');$('#cartTotal').textContent=money(state.cart.reduce((s,item)=>s+(state.products.find(p=>p.id===item.id)?.price||0),0))}
function openCart(){$('#cartDrawer').classList.add('open');syncOverlay()}function closeCart(){$('#cartDrawer').classList.remove('open');syncOverlay()}
document.addEventListener('click',e=>{const add=e.target.closest('[data-add]');if(add){state.cart.push({id:add.dataset.add,color:add.dataset.color||''});saveCart();openCart()}if(!e.target.closest('.color-select'))toggleColors(false);const rem=e.target.closest('[data-remove]');if(rem){state.cart.splice(+rem.dataset.remove,1);saveCart()}if(e.target.closest('[data-open-cart]'))openCart()});
document.querySelectorAll('.filter').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.filter;state.search='';document.querySelectorAll('.filter').forEach(x=>x.classList.toggle('active',x===b));renderProducts()}));
['#bagOpen','#mobileBag'].forEach(s=>{const el=$(s);if(el)el.addEventListener('click',openCart)});$('#closeCart').addEventListener('click',closeCart);$('#overlay').addEventListener('click',()=>{closeCart();closeMenu();closeInfo()});
['#menuOpen','#mobileMenu'].forEach(s=>{const el=$(s);if(el)el.addEventListener('click',openMenu)});$('#sideClose').addEventListener('click',closeMenu);
$('#sideMenu').addEventListener('click',e=>{const sub=e.target.closest('[data-sub]');if(sub)showPanel(sub.dataset.sub);if(e.target.closest('[data-back]'))showPanel('main');if(e.target.closest('a'))closeMenu()});
const openSearch=()=>{$('#searchPanel').classList.add('open');$('#searchInput').focus()};if($('#searchOpen'))$('#searchOpen').addEventListener('click',openSearch);$('#searchClose').addEventListener('click',()=>$('#searchPanel').classList.remove('open'));$('#searchInput').addEventListener('input',e=>{state.search=e.target.value;renderProducts()});
window.addEventListener('hashchange',()=>{coll.fromPage=true;route()});
// Closing goes back in history when the panel was opened from inside the site, otherwise just drops the hash.
const closeHashPanel=close=>{if(coll.fromPage)history.back();else{history.replaceState(null,'',location.pathname+location.search);close()}};
$('#collectionClose').addEventListener('click',()=>closeHashPanel(closeCollection));
$('#pdpClose').addEventListener('click',()=>closeHashPanel(closeProduct));
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if($('#sideMenu').classList.contains('open'))closeMenu();else if($('#infoDrawer').classList.contains('open'))closeInfo();else if($('#cartDrawer').classList.contains('open'))closeCart();else if(!$('#product').hidden)$('#pdpClose').click();else if(!$('#collection').hidden)$('#collectionClose').click()});
$('#collectionBrand').addEventListener('change',e=>{coll.brand=e.target.value;renderCollection()});
$('#collectionColor').addEventListener('change',e=>{coll.color=e.target.value;renderCollection()});
$('#pdpColor').addEventListener('click',e=>{if(e.target.closest('#pdpColorBtn'))toggleColors($('#pdpColorList').hidden);const opt=e.target.closest('[data-color-index]');if(opt)chooseColor(+opt.dataset.colorIndex)});
$('#pdpColor').addEventListener('keydown',e=>{const list=$('#pdpColorList');if(!list)return;const opt=e.target.closest('[role=option]');
if(!opt){if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();toggleColors(true)}return} // Enter/Space click the button
const opts=[...list.children],i=opts.indexOf(opt),go=j=>opts[(j+opts.length)%opts.length].focus();
if(e.key==='ArrowDown'){e.preventDefault();go(i+1)}else if(e.key==='ArrowUp'){e.preventDefault();go(i-1)}else if(e.key==='Home'){e.preventDefault();go(0)}else if(e.key==='End'){e.preventDefault();go(opts.length-1)}
else if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseColor(i)}else if(e.key==='Escape'){e.stopPropagation();toggleColors(false);$('#pdpColorBtn').focus()}else if(e.key==='Tab')toggleColors(false)});
$('#collectionPrice').addEventListener('change',e=>{coll.price=e.target.value;renderCollection()});
$('#collectionSort').addEventListener('change',e=>{coll.sort=e.target.value;renderCollection()});
$('#pdpThumbs').addEventListener('click',e=>{const t=e.target.closest('[data-media]');if(t){pdp.index=+t.dataset.media;renderProduct()}});
$('#pdpInfo').addEventListener('click',()=>openInfo('info'));$('#pdpCare').addEventListener('click',()=>openInfo('care'));$('#pdpStore').addEventListener('click',()=>openInfo('store'));$('#infoClose').addEventListener('click',closeInfo);
$('#infoBody').addEventListener('click',e=>{if(e.target.id!=='readMore')return;const clamped=$('#infoDesc').classList.toggle('clamp');e.target.textContent=clamped?'Read More':'Read Less'});
$('#infoBody').addEventListener('submit',async e=>{if(e.target.id!=='storeForm')return;e.preventDefault();const f=e.target,btn=f.querySelector('button'),msg=$('#storeMsg');btn.disabled=true;msg.textContent='';try{const d=await json('/api/store-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...Object.fromEntries(new FormData(f)),productId:pdp.product.id})});msg.textContent=d.message;f.reset()}catch(err){msg.textContent=err.message}finally{btn.disabled=false}});
$('#pdpShare').addEventListener('click',async()=>{const p=pdp.product;try{if(navigator.share)return await navigator.share({title:`${p.brand} ${p.name}`,url:location.href});await navigator.clipboard.writeText(location.href);$('#pdpShared').textContent='Link copied';setTimeout(()=>{$('#pdpShared').textContent=''},2000)}catch{/* share sheet dismissed or clipboard unavailable */}});
$('#newsletterForm').addEventListener('submit',async e=>{e.preventDefault();const email=new FormData(e.target).get('email');try{const d=await json('/api/newsletter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});$('#newsletterMessage').textContent=d.message;e.target.reset()}catch(err){$('#newsletterMessage').textContent=err.message}});
init();
