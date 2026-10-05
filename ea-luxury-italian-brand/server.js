const http=require('http');const fs=require('fs');const path=require('path');const{URL}=require('url');
const PORT=process.env.PORT||3000,PUBLIC=path.join(__dirname,'public'),DATA=path.join(__dirname,'data');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml'};
const file=n=>path.join(DATA,n);const read=n=>JSON.parse(fs.readFileSync(file(n),'utf8'));const write=(n,v)=>fs.writeFileSync(file(n),JSON.stringify(v,null,2));
function send(res,status,body,type='application/json; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':type.startsWith('image/')?'public,max-age=86400':'no-cache'});res.end(body)}
function body(req){return new Promise((ok,bad)=>{let s='';req.on('data',c=>{s+=c;if(s.length>1e6)req.destroy()});req.on('end',()=>{try{ok(s?JSON.parse(s):{})}catch(e){bad(e)}});req.on('error',bad)})}
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,`http://${req.headers.host}`);try{
 if(req.method==='GET'&&url.pathname==='/api/products')return send(res,200,JSON.stringify(read('products.json')));
 if(req.method==='GET'&&url.pathname==='/api/brands')return send(res,200,JSON.stringify([...new Set(read('products.json').map(p=>p.brand))]));
 if(req.method==='GET'&&url.pathname==='/api/crm/orders')return send(res,200,JSON.stringify(read('orders.json')));
 if(req.method==='GET'&&url.pathname==='/api/crm/customers')return send(res,200,JSON.stringify(read('customers.json')));
 if(req.method==='GET'&&url.pathname==='/api/crm/leads')return send(res,200,JSON.stringify(read('leads.json')));
 if(req.method==='POST'&&url.pathname==='/api/crm/customers'){const b=await body(req),rows=read('customers.json');const item={id:`C${1001+rows.length}`,name:b.name||'New customer',email:b.email||'',city:b.city||'',orders:0,spent:0,status:'New'};rows.push(item);write('customers.json',rows);return send(res,201,JSON.stringify(item))}
 if(req.method==='POST'&&url.pathname==='/api/crm/leads'){const b=await body(req),rows=read('leads.json');const item={id:`L${rows.length+1}`,name:b.name||'New lead',email:b.email||'',source:b.source||'Website',stage:'New'};rows.push(item);write('leads.json',rows);return send(res,201,JSON.stringify(item))}
 if(req.method==='POST'&&url.pathname==='/api/newsletter'){const b=await body(req);if(!b.email||!/^\S+@\S+\.\S+$/.test(b.email))return send(res,400,JSON.stringify({ok:false,message:'Please enter a valid email.'}));return send(res,200,JSON.stringify({ok:true,message:'Welcome to EA Luxury.'}))}
 if(req.method==='POST'&&url.pathname==='/api/contact')return send(res,200,JSON.stringify({ok:true,message:'Your message has been received.'}));
 let safe=path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/,''),fp=path.join(PUBLIC,safe==='/'?'index.html':safe);if(!fp.startsWith(PUBLIC))return send(res,403,'Forbidden','text/plain');fs.stat(fp,(e,st)=>{if(!e&&st.isDirectory())fp=path.join(fp,'index.html');fs.readFile(fp,(er,data)=>{if(er)return send(res,404,'Not found','text/plain; charset=utf-8');send(res,200,data,mime[path.extname(fp).toLowerCase()]||'application/octet-stream')})});
 }catch(e){send(res,500,JSON.stringify({ok:false,error:e.message}))}});server.listen(PORT,()=>console.log(`EA Luxury running at http://localhost:${PORT}\nCRM: http://localhost:${PORT}/admin/`));
