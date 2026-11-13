function M(t){let a=t.leads*t.valueLakh*1e5,n=a*t.conv/100,r=a-n,o=Math.min(t.lift,100-t.conv),p=t.conv+o,d=a*o/100;return{opportunity:a,won:n,lost:r,liftApplied:o,newConv:p,recovered:d}}function U(t,a={}){let n=M(t),r={leads:t.leads,valueLakh:t.valueLakh,conv:t.conv,lift:t.lift,opportunity:Math.round(n.opportunity),recovered:Math.round(n.recovered)};return a.field&&(r.field=a.field),typeof a.saves=="number"&&(r.saves=a.saves),r}var L={label:"Cab travel",amountInr:4e3,mode:"By cab from our Gurugram office, there and back the same day"};var me=[{city:"Adityapur",state:"Jharkhand",sectors:"Auto components, machinery, fabrication"},{city:"Agra",state:"Uttar Pradesh",sectors:"Footwear, leather, engineering"},{city:"Ahilyanagar (Ahmednagar)",state:"Maharashtra",sectors:"Auto components, agricultural machinery"},{city:"Ahmedabad",state:"Gujarat",sectors:"Textiles, pharma, engineering, chemicals"},{city:"Aligarh",state:"Uttar Pradesh",sectors:"Locks, hardware, metal products"},{city:"Alwar",state:"Rajasthan",sectors:"Automobiles, engineering, electricals"},{city:"Ambala",state:"Haryana",sectors:"Scientific instruments, engineering"},{city:"Ambattur",state:"Tamil Nadu",sectors:"Engineering, electricals, auto components"},{city:"Amravati",state:"Maharashtra",sectors:"Textiles, cotton processing"},{city:"Amritsar",state:"Punjab",sectors:"Textiles, food processing, engineering"},{city:"Anand",state:"Gujarat",sectors:"Dairy, food processing, engineering"},{city:"Angul",state:"Odisha",sectors:"Aluminium, steel, industrial equipment"},{city:"Ankleshwar",state:"Gujarat",sectors:"Chemicals, pharma"},{city:"Asansol",state:"West Bengal",sectors:"Steel, metals, engineering"},{city:"Baddi",state:"Himachal Pradesh",sectors:"Pharmaceuticals, consumer products"},{city:"Ballari",state:"Karnataka",sectors:"Steel, metals, fabrication"},{city:"Batala",state:"Punjab",sectors:"Machine tools, castings, engineering"},{city:"Belagavi",state:"Karnataka",sectors:"Foundries, castings, aerospace components"},{city:"Bengaluru",state:"Karnataka",sectors:"Electronics, aerospace, engineering"},{city:"Bhagalpur",state:"Bihar",sectors:"Silk textiles, garments, food processing"},{city:"Bharuch",state:"Gujarat",sectors:"Chemicals, pharmaceuticals"},{city:"Bhavnagar",state:"Gujarat",sectors:"Ship recycling, engineering, salt"},{city:"Bhilai",state:"Chhattisgarh",sectors:"Steel, heavy engineering, machinery"},{city:"Bhilwara",state:"Rajasthan",sectors:"Textiles, yarn, fabrics"},{city:"Bhiwadi",state:"Rajasthan",sectors:"Automobiles, electronics, machinery"},{city:"Bhiwandi",state:"Maharashtra",sectors:"Textiles, packaging, light manufacturing"},{city:"Bhopal",state:"Madhya Pradesh",sectors:"Electricals, engineering, industrial equipment"},{city:"Bhubaneswar",state:"Odisha",sectors:"Electronics, food processing, engineering"},{city:"Bilaspur",state:"Chhattisgarh",sectors:"Cement, engineering, food processing"},{city:"Bokaro",state:"Jharkhand",sectors:"Steel, industrial fabrication"},{city:"Chakan",state:"Maharashtra",sectors:"Automobiles, engineering, auto components"},{city:"Chennai",state:"Tamil Nadu",sectors:"Automobiles, electronics, engineering"},{city:"Chhatrapati Sambhajinagar",state:"Maharashtra",sectors:"Automobiles, engineering, pharmaceuticals"},{city:"Coimbatore",state:"Tamil Nadu",sectors:"Pumps, motors, machinery, foundries"},{city:"Dahej",state:"Gujarat",sectors:"Chemicals, petrochemicals"},{city:"Davanagere",state:"Karnataka",sectors:"Textiles, food processing"},{city:"Dewas",state:"Madhya Pradesh",sectors:"Pharmaceuticals, engineering, food products"},{city:"Delhi",state:"Delhi",sectors:"Engineering, garments, electricals, printing"},{city:"Dharuhera",state:"Haryana",sectors:"Automobiles, auto components"},{city:"Dharwad",state:"Karnataka",sectors:"Engineering, automobiles"},{city:"Dindigul",state:"Tamil Nadu",sectors:"Textiles, leather, food processing"},{city:"Durgapur",state:"West Bengal",sectors:"Steel, heavy engineering, chemicals"},{city:"Erode",state:"Tamil Nadu",sectors:"Textiles, food processing"},{city:"Faridabad",state:"Haryana",sectors:"Engineering, machinery, auto components"},{city:"Firozabad",state:"Uttar Pradesh",sectors:"Glassware, glass products"},{city:"Gandhinagar",state:"Gujarat",sectors:"Electronics, engineering, pharma"},{city:"Ghaziabad",state:"Uttar Pradesh",sectors:"Engineering, machinery, metals"},{city:"Goa / Verna",state:"Goa",sectors:"Goa"},{city:"Gorakhpur",state:"Uttar Pradesh",sectors:"Chemicals, plastics, food processing"},{city:"Greater Noida",state:"Uttar Pradesh",sectors:"Electronics, automobiles, appliances"},{city:"Guntur",state:"Andhra Pradesh",sectors:"Textiles, food processing, tobacco"},{city:"Gurugram",state:"Haryana",sectors:"Automobiles, electronics, industrial equipment"},{city:"Guwahati",state:"Assam",sectors:"Assam"},{city:"Gwalior",state:"Madhya Pradesh",sectors:"Chemicals, textiles, food processing"},{city:"Haldia",state:"West Bengal",sectors:"Petrochemicals, chemicals, processing"},{city:"Halol",state:"Gujarat",sectors:"Automobiles, engineering"},{city:"Haridwar",state:"Uttarakhand",sectors:"Automobiles, pharmaceuticals, engineering"},{city:"Hoshiarpur",state:"Punjab",sectors:"Auto components, agricultural machinery"},{city:"Hosur",state:"Tamil Nadu",sectors:"Automobiles, electronics, engineering"},{city:"Howrah",state:"West Bengal",sectors:"Foundries, castings, fabrication"},{city:"Hubballi",state:"Karnataka",sectors:"Engineering, foundries, machinery"},{city:"Hyderabad",state:"Telangana",sectors:"Pharmaceuticals, electronics, engineering"},{city:"Ichalkaranji",state:"Maharashtra",sectors:"Textiles, powerloom products"},{city:"Indore",state:"Madhya Pradesh",sectors:"Pharmaceuticals, engineering, food processing"},{city:"Jabalpur",state:"Madhya Pradesh",sectors:"Defence equipment, engineering"},{city:"Jaipur",state:"Rajasthan",sectors:"Gems, jewellery, engineering, textiles"},{city:"Jalandhar",state:"Punjab",sectors:"Sports goods, rubber products, engineering"},{city:"Jalgaon",state:"Maharashtra",sectors:"Food processing, plastics, engineering"},{city:"Jammu",state:"Jammu & Kashmir",sectors:"Jammu & Kashmir"},{city:"Jamnagar",state:"Gujarat",sectors:"Brass parts, engineering, petrochemicals"},{city:"Jamshedpur",state:"Jharkhand",sectors:"Steel, automobiles, engineering"},{city:"Jharsuguda",state:"Odisha",sectors:"Aluminium, metals, industrial products"},{city:"Jodhpur",state:"Rajasthan",sectors:"Furniture, handicrafts, engineering"},{city:"Junagadh",state:"Gujarat",sectors:"Food processing, agricultural products"},{city:"Kakinada",state:"Andhra Pradesh",sectors:"Food processing, chemicals, paper"},{city:"Kalol",state:"Gujarat",sectors:"Engineering, chemicals"},{city:"Kanpur",state:"Uttar Pradesh",sectors:"Leather, textiles, engineering"},{city:"Karur",state:"Tamil Nadu",sectors:"Home textiles, furnishings"},{city:"Kashipur",state:"Uttarakhand",sectors:"Paper, chemicals, food processing"},{city:"Kochi",state:"Kerala",sectors:"Kerala"},{city:"Kolhapur",state:"Maharashtra",sectors:"Foundries, castings, auto components"},{city:"Kolkata",state:"West Bengal",sectors:"Engineering, electricals, industrial products"},{city:"Kota",state:"Rajasthan",sectors:"Chemicals, engineering, textiles"},{city:"Kurnool",state:"Andhra Pradesh",sectors:"Cement, food processing, engineering"},{city:"Kutch / Mundra",state:"Gujarat",sectors:"Engineering, salt, metals, processing"},{city:"Lucknow",state:"Uttar Pradesh",sectors:"Engineering, defence manufacturing"},{city:"Ludhiana",state:"Punjab",sectors:"Bicycles, auto parts, textiles, machinery"},{city:"Madurai",state:"Tamil Nadu",sectors:"Engineering, textiles, food processing"},{city:"Mandi Gobindgarh",state:"Punjab",sectors:"Steel, rolling mills, metal products"},{city:"Mandideep",state:"Madhya Pradesh",sectors:"Pharmaceuticals, electricals, engineering"},{city:"Manesar",state:"Haryana",sectors:"Automobiles, auto components"},{city:"Mangaluru",state:"Karnataka",sectors:"Chemicals, petrochemicals, food processing"},{city:"Medchal",state:"Telangana",sectors:"Engineering, plastics, pharmaceuticals"},{city:"Meerut",state:"Uttar Pradesh",sectors:"Sports goods, engineering"},{city:"Mehsana",state:"Gujarat",sectors:"Engineering, dairy, auto components"},{city:"Mohali",state:"Punjab",sectors:"Electronics, pharmaceuticals, engineering"},{city:"Moradabad",state:"Uttar Pradesh",sectors:"Metalware, handicrafts"},{city:"Morbi",state:"Gujarat",sectors:"Ceramics, tiles, sanitaryware"},{city:"Mumbai",state:"Maharashtra",sectors:"Pharmaceuticals, chemicals, consumer products"},{city:"Muzaffarpur",state:"Bihar",sectors:"Food processing, textiles, agro-industries"},{city:"Mysuru",state:"Karnataka",sectors:"Engineering, automotive, food processing"},{city:"Nagpur",state:"Maharashtra",sectors:"Engineering, food processing, metals"},{city:"Nashik",state:"Maharashtra",sectors:"Auto components, engineering, electricals"},{city:"Noida",state:"Uttar Pradesh",sectors:"Electronics, electricals, consumer products"},{city:"Pali",state:"Rajasthan",sectors:"Textiles, dyeing, processing"},{city:"Panipat",state:"Haryana",sectors:"Textiles, home furnishings, chemicals"},{city:"Parwanoo",state:"Himachal Pradesh",sectors:"Engineering, electricals, packaging"},{city:"Patancheru",state:"Telangana",sectors:"Chemicals, pharma, industrial products"},{city:"Patna",state:"Bihar",sectors:"Food processing, pharmaceuticals, light manufacturing"},{city:"Peenya",state:"Karnataka",sectors:"Machinery, electricals, industrial components"},{city:"Pimpri-Chinchwad",state:"Maharashtra",sectors:"Automobiles, machinery, industrial components"},{city:"Pithampur",state:"Madhya Pradesh",sectors:"Automobiles, machinery, engineering"},{city:"Pune",state:"Maharashtra",sectors:"Automobiles, engineering, electronics"},{city:"Raigarh",state:"Chhattisgarh",sectors:"Steel, metals, power-related equipment"},{city:"Raipur",state:"Chhattisgarh",sectors:"Steel, fabrication, engineering"},{city:"Rajkot",state:"Gujarat",sectors:"Auto parts, machine tools, foundries"},{city:"Ranchi",state:"Jharkhand",sectors:"Heavy engineering, machinery"},{city:"Rewari",state:"Haryana",sectors:"Automobiles, industrial components"},{city:"Rourkela",state:"Odisha",sectors:"Steel, heavy engineering, fabrication"},{city:"Rudrapur",state:"Uttarakhand",sectors:"Automobiles, electronics, consumer products"},{city:"Salem",state:"Tamil Nadu",sectors:"Steel, textiles, engineering"},{city:"Sanand",state:"Gujarat",sectors:"Automobiles, electronics"},{city:"Sangareddy",state:"Telangana",sectors:"Engineering, electronics, manufacturing"},{city:"Sangli",state:"Maharashtra",sectors:"Food processing, engineering, textiles"},{city:"Satara",state:"Maharashtra",sectors:"Automobiles, engineering, food processing"},{city:"Siliguri",state:"West Bengal",sectors:"Food processing, packaging, light manufacturing"},{city:"Sivakasi",state:"Tamil Nadu",sectors:"Printing, packaging, paper products"},{city:"Solan",state:"Himachal Pradesh",sectors:"Pharmaceuticals, food processing"},{city:"Solapur",state:"Maharashtra",sectors:"Textiles, garments, engineering"},{city:"Sonipat",state:"Haryana",sectors:"Engineering, food processing, packaging"},{city:"Sri City",state:"Andhra Pradesh",sectors:"Electronics, automobiles, consumer goods"},{city:"Sriperumbudur",state:"Tamil Nadu",sectors:"Electronics, automobiles"},{city:"Surat",state:"Gujarat",sectors:"Textiles, diamonds, chemicals"},{city:"Thane",state:"Maharashtra",sectors:"Chemicals, engineering, plastics"},{city:"Thiruvananthapuram",state:"Kerala",sectors:"Kerala"},{city:"Tiruchirappalli",state:"Tamil Nadu",sectors:"Heavy engineering, fabrication"},{city:"Tirunelveli",state:"Tamil Nadu",sectors:"Food processing, engineering"},{city:"Tirupati",state:"Andhra Pradesh",sectors:"Electronics, electricals, manufacturing"},{city:"Tiruppur",state:"Tamil Nadu",sectors:"Garments, textiles"},{city:"Tumakuru",state:"Karnataka",sectors:"Engineering, machinery, food processing"},{city:"Udaipur",state:"Rajasthan",sectors:"Minerals, chemicals, engineering"},{city:"Vadodara",state:"Gujarat",sectors:"Engineering, electricals, chemicals"},{city:"Valsad",state:"Gujarat",sectors:"Chemicals, textiles, pharmaceuticals"},{city:"Vapi",state:"Gujarat",sectors:"Chemicals, paper, packaging"},{city:"Varanasi",state:"Uttar Pradesh",sectors:"Textiles, silk, manufacturing"},{city:"Vellore",state:"Tamil Nadu",sectors:"Leather, footwear, engineering"},{city:"Vijayawada",state:"Andhra Pradesh",sectors:"Engineering, auto components, food processing"},{city:"Visakhapatnam",state:"Andhra Pradesh",sectors:"Steel, pharmaceuticals, shipbuilding"},{city:"Warangal",state:"Telangana",sectors:"Textiles, food processing, engineering"},{city:"Yamunanagar",state:"Haryana",sectors:"Plywood, paper, machinery"},{city:"Zaheerabad",state:"Telangana",sectors:"Automobiles, agricultural machinery"}];function Y(t){return typeof t!="string"?"":t.toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim()}var Pe=new Map(me.map(t=>[Y(t.city),t]));var K=[{group:"Haryana",cities:["Gurugram","Manesar"]},{group:"Delhi NCR",cities:["Delhi","Noida","Greater Noida","Ghaziabad"]}],Te=new Set(K.flatMap(t=>t.cities.map(Y)));var ge=(()=>{let t=K.flatMap(a=>a.cities);return`${t.slice(0,-1).join(", ")} and ${t[t.length-1]}`})(),Me=`We shoot in ${ge} today. Somewhere else? Type your city: we are coming to new cities soon, and the ones we hear from most come first.`;var fe=2,be=20;var q=999,Ne=q*12,ye="Support, hosting & security";var Re=[{label:"Scenes your customers can see",basic:`${fe}\u2013${be}, you choose`,pro:"Unlimited",ultra:"Unlimited"},{label:"360\xB0 tour builder with hotspots",basic:!0,pro:!0,ultra:!0},{label:"Your own branded workspace and logo",basic:!0,pro:!0,ultra:!0},{label:"Presenter dashboard and live Present mode",basic:!0,pro:!0,ultra:!0},{label:"Private share links, passwords, device limits, QR",basic:!0,pro:!0,ultra:!0},{label:"Video, PDF, audio and image hotspots",basic:!0,pro:!0,ultra:!0},{label:"Guided auto-tour, narration, subtitles, languages",basic:!0,pro:!0,ultra:!0},{label:"Viewer analytics and client pipeline",basic:!0,pro:!0,ultra:!0},{label:"Sales team accounts and reports",basic:!0,pro:!0,ultra:!0},{label:"Measure tool, image clean-up, capture shield",basic:!0,pro:!0,ultra:!0},{label:"Add scenes any time",basic:"Buy a top-up",pro:!0,ultra:!0},{label:"Tours saved for offline presenting",basic:!0,pro:!0,ultra:"Unlimited"},{label:"AI meeting review: transcript, score, insights",basic:!1,pro:!1,ultra:!0},{label:ye,basic:`${W(q)}/month, billed yearly + GST`,pro:"Included",ultra:"Included, priority"}];function W(t){let a=Math.round(t),n=String(Math.abs(a)),r;if(n.length<=3)r=n;else{let o=n.slice(-3);r=`${n.slice(0,-3).replace(/\B(?=(\d{2})+(?!\d))/g,",")},${o}`}return`${a<0?"-":""}\u20B9${r}`}function g(t){let a=Math.round(t),n=r=>r.toFixed(2).replace(/\.?0+$/,"");return a>=1e7?`\u20B9${n(a/1e7)} crore`:a>=1e5?`\u20B9${n(a/1e5)} lakh`:W(a)}var Ve={ncr:{label:"Delhi NCR",amountInr:L.amountInr},outside:{label:"Outside Delhi NCR (coming soon)",amountInr:L.amountInr}};var Q="vpv_no_analytics";var ve="vpv.attr.v1",$="vpv.sid.v1";function J(){try{return window.localStorage}catch{return null}}function we(){try{return document.cookie.includes(`${Q}=1`)}catch{return!1}}function ke(){try{let t=J()?.getItem(ve);return t?JSON.parse(t):null}catch{return null}}function Se(){try{let t=J();if(!t)return null;let a=t.getItem($),n=Date.now();if(a){let{id:o,at:p}=JSON.parse(a);if(o&&n-p<1800*1e3)return t.setItem($,JSON.stringify({id:o,at:n})),o}let r=crypto.randomUUID();return t.setItem($,JSON.stringify({id:r,at:n})),r}catch{return null}}function Ie(t,a){try{let n=window.gtag;typeof n=="function"&&t!=="page_view"&&n("event",t,a??{})}catch{}}function X(t,a,n={}){if(typeof window>"u"||we())return;let r=ke(),o=JSON.stringify({name:t,path:n.path??window.location.pathname+window.location.search,referrer:document.referrer||null,sessionId:Se(),utmSource:r?.source??null,utmMedium:r?.medium??null,utmCampaign:r?.campaign??null,code:r?.code??null,meta:a??null});Ie(t,a);try{if(n.beacon&&typeof navigator.sendBeacon=="function"){navigator.sendBeacon("/api/track",new Blob([o],{type:"application/json"}));return}fetch("/api/track",{method:"POST",headers:{"Content-Type":"application/json"},body:o,keepalive:!0}).catch(()=>{})}catch{}}var Z=`.hs{--ink:#0b2a5b;--brand:#0b5cff;--muted:#475569;--loss:#e5484d;position:relative;height:calc(var(--hs-parts,6) * 100vh);background:linear-gradient(180deg,#f2f7ff 0%,#fff 55%,#f4f8fd 100%);color:var(--ink);font-family:"Plus Jakarta Sans",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.hs *{box-sizing:border-box}
.hs-pin{position:sticky;top:var(--hs-top,64px);height:calc(100vh - var(--hs-top,64px));height:calc(100svh - var(--hs-top,64px));overflow:hidden}
.hs-glow{position:absolute;right:-8%;top:8%;width:62vw;height:62vw;max-width:880px;max-height:880px;border-radius:50%;filter:blur(80px);opacity:.55;background:radial-gradient(closest-side,rgba(11,92,255,.28),transparent);transition:background 1s ease;pointer-events:none}
.hs[data-part=conversion] .hs-glow{background:radial-gradient(closest-side,rgba(229,72,77,.24),transparent)}
.hs[data-part=international] .hs-glow{background:radial-gradient(closest-side,rgba(25,184,242,.3),transparent)}
.hs[data-part=privacy] .hs-glow{background:radial-gradient(closest-side,rgba(16,163,106,.22),transparent)}
.hs-grid{position:relative;height:100%;max-width:72rem;margin:0 auto;padding:0 24px;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:28px 56px;align-items:center}
/* rail */
.hs-rail{display:flex;flex-direction:column;gap:18px;align-self:center}
.hs-rail button{all:unset;cursor:pointer;position:relative;width:24px;height:24px;display:grid;place-items:center}
.hs-rail i{width:8px;height:8px;border-radius:999px;background:rgba(11,42,91,.2);transition:transform .3s,background .3s,box-shadow .3s}
.hs-rail button.done i{background:rgba(11,92,255,.45)}
.hs-rail button.on i{background:var(--brand);transform:scale(1.5);box-shadow:0 0 0 5px rgba(11,92,255,.14)}
.hs-rail span{position:absolute;left:30px;white-space:nowrap;font-size:12px;font-weight:700;color:var(--ink);background:#fff;padding:4px 10px;border-radius:999px;box-shadow:0 8px 20px -10px rgba(11,42,91,.45);opacity:0;translate:-4px 0;transition:opacity .2s,translate .2s;pointer-events:none}
.hs-rail button:hover span,.hs-rail button:focus-visible span{opacity:1;translate:0 0}
.hs-rail button:focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:999px}
/* stage + parts */
.hs-stage{position:relative;height:100%}
.hs-part{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;opacity:0;visibility:hidden;transform:translateY(34px);transition:opacity .55s cubic-bezier(.22,1,.36,1),transform .65s cubic-bezier(.22,1,.36,1),visibility 0s .65s}
.hs[data-dir=up] .hs-part:not(.is-active){transform:translateY(34px)}
.hs-part.is-past{transform:translateY(-34px)}
.hs-part.is-active{opacity:1;visibility:visible;transform:none;transition-delay:.12s,.12s,0s}
.hs-eyebrow{margin:0;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--brand)}
.hs-h1{margin:14px 0 0;font-size:clamp(36px,4.5vw,64px);line-height:1.03;font-weight:800;letter-spacing:-.035em}
.hs-h2{margin:10px 0 0;font-size:clamp(30px,3.6vw,50px);line-height:1.06;font-weight:800;letter-spacing:-.03em}
.hs-w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.08em;margin-bottom:-.08em}
.hs-w>span{display:inline-block;transform:translateY(105%);transition:transform .7s cubic-bezier(.22,1,.36,1);transition-delay:calc(.15s + var(--i) * 45ms)}
.is-active .hs-w>span{transform:none}
.hs-in{opacity:0;transform:translateY(16px);transition:opacity .6s cubic-bezier(.22,1,.36,1),transform .6s cubic-bezier(.22,1,.36,1);transition-delay:calc(var(--d,0) * 60ms + .1s)}
.is-active .hs-in{opacity:1;transform:none}
.hs-lede{margin:22px 0 0;max-width:34rem;font-size:clamp(17px,1.4vw,21px);line-height:1.55;color:var(--muted)}
.hs-body{margin:16px 0 0;max-width:34rem;font-size:16.5px;line-height:1.6;color:var(--muted)}
.hs-ctas{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-top:30px}
.hs-btn{display:inline-flex;align-items:center;gap:10px;min-height:56px;padding:0 28px;border-radius:999px;background:var(--brand);color:#fff;font-weight:700;font-size:17px;text-decoration:none;box-shadow:0 14px 30px -12px rgba(11,92,255,.6);transition:transform .2s ease,box-shadow .2s ease,background .2s ease}
.hs-btn:hover{background:#0a4fe0;transform:translateY(-2px);box-shadow:0 18px 36px -12px rgba(11,92,255,.65)}
.hs-pill{display:inline-flex;align-items:center;gap:12px;min-height:56px;padding:6px 20px 6px 8px;border-radius:999px;border:2px solid rgba(11,92,255,.22);background:#fff;text-decoration:none;color:var(--ink);transition:border-color .2s,transform .2s}
.hs-pill:hover{border-color:var(--brand);transform:translateY(-2px)}
.hs-pill b{display:block;font-size:15px;font-weight:800}
.hs-pill small{display:block;font-size:13px;font-weight:600;color:var(--brand)}
.hs-play{position:relative;width:40px;height:40px;border-radius:999px;background:var(--brand);flex:none;box-shadow:0 0 0 6px rgba(11,92,255,.12)}
.hs-play::after{content:"";position:absolute;left:16px;top:12px;border-style:solid;border-width:8px 0 8px 12px;border-color:transparent transparent transparent #fff}
.hs-link{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:15px;color:var(--brand);text-decoration:none}
.hs-link:hover{text-decoration:underline}
.hs-btn:focus-visible,.hs-pill:focus-visible,.hs-link:focus-visible,.hs-chips button:focus-visible,.hs-guard:focus-visible{outline:3px solid var(--brand);outline-offset:3px}
.hs-cue{display:flex;align-items:center;gap:10px;margin:40px 0 0;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#64748b}
.hs-cue span{width:22px;height:34px;border-radius:12px;border:2px solid #94a3b8;position:relative}
.hs-cue span::after{content:"";position:absolute;left:50%;top:6px;width:4px;height:7px;margin-left:-2px;border-radius:2px;background:var(--brand);animation:hs-wheel 1.6s ease-in-out infinite}
@keyframes hs-wheel{0%{opacity:0;transform:translateY(0)}30%{opacity:1}100%{opacity:0;transform:translateY(10px)}}
/* calculator */
.hs-calc{margin-top:22px;max-width:28rem;padding:20px 22px;border-radius:22px;background:#fff;box-shadow:0 1px 2px rgba(11,42,91,.06),0 24px 50px -28px rgba(11,42,91,.4);border:1px solid #e6edf7}
.hs-row{display:flex;justify-content:space-between;align-items:baseline;margin:0;font-size:14px;font-weight:600;color:#334155}
.hs-row b{font-size:20px;font-weight:800;color:var(--ink);font-variant-numeric:tabular-nums}
.hs-row--chips{margin-top:16px}
.hs-range{-webkit-appearance:none;appearance:none;width:100%;height:8px;margin:12px 0 0;border-radius:999px;outline:none;cursor:pointer;background:linear-gradient(90deg,var(--brand) var(--p,11%),#e3eaf5 var(--p,11%))}
.hs-range::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;border-radius:999px;background:#fff;border:3px solid var(--brand);box-shadow:0 4px 12px rgba(11,92,255,.35)}
.hs-range::-moz-range-thumb{width:20px;height:20px;border-radius:999px;background:#fff;border:3px solid var(--brand)}
.hs-range:focus-visible{box-shadow:0 0 0 4px rgba(11,92,255,.2)}
.hs-chips{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.hs-chips button{all:unset;cursor:pointer;height:36px;padding:0 14px;border-radius:999px;background:#f1f5f9;font-size:14px;font-weight:700;color:#334155;transition:background .2s,color .2s,box-shadow .2s}
.hs-chips button[aria-pressed=true]{background:var(--brand);color:#fff;box-shadow:0 6px 16px -6px rgba(11,92,255,.6)}
.hs-loss{margin-top:18px;padding:16px 18px;border-radius:16px;background:linear-gradient(150deg,#fff1f0,#ffe4e1);border:1px solid #fbcfc9}
.hs-loss-label{margin:0;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#c93a3f}
.hs-loss-num{margin:6px 0 0;font-size:clamp(30px,3vw,40px);line-height:1;font-weight:800;letter-spacing:-.03em;color:#b4282e;font-variant-numeric:tabular-nums}
.hs-loss-sub{margin:8px 0 0;font-size:13.5px;color:#7f1d1d}
.hs-loss-sub b{color:#5b0f12}
@keyframes hs-hit{0%{transform:scale(1)}30%{transform:scale(1.03)}100%{transform:scale(1)}}
@keyframes hs-flash{0%{box-shadow:0 0 0 0 rgba(229,72,77,.45)}100%{box-shadow:0 0 0 16px rgba(229,72,77,0)}}
.hs-hit{animation:hs-hit .5s cubic-bezier(.22,1,.36,1),hs-flash .8s ease-out}
/* map */
.hs-map{margin-top:22px;max-width:30rem}
.hs-map svg{display:block;width:100%;height:auto;overflow:visible}
.hs-arc{fill:none;stroke:#19b8f2;stroke-width:2;stroke-linecap:round;stroke-dasharray:4 6;opacity:.9}
.hs-home{fill:var(--brand);stroke:#fff;stroke-width:3;filter:drop-shadow(0 4px 8px rgba(11,92,255,.5))}
.hs-city{fill:#fff;stroke:#19b8f2;stroke-width:3}
.hs-tl{font-size:12px;font-weight:700;fill:var(--ink);text-anchor:middle}
.hs-tl--home{fill:var(--brand)}
/* locks */
.hs-locks{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:10px;max-width:30rem}
.hs-lock,.hs-ans{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:16px;background:#fff;border:1px solid #e6edf7;box-shadow:0 12px 28px -22px rgba(11,42,91,.5)}
.hs-lock b,.hs-ans b{display:block;font-size:15px;font-weight:800;color:var(--ink)}
.hs-lock small,.hs-ans small{display:block;margin-top:2px;font-size:13.5px;line-height:1.45;color:var(--muted)}
.hs-lock>span:nth-child(2){flex:1}
.hs-ic{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:#eaf2fe;color:var(--brand)}
.hs-ic--grad{background:linear-gradient(135deg,#0b2a5b,#0b5cff);color:#fff;box-shadow:0 0 0 5px rgba(11,92,255,.1)}
.hs-switch{flex:none;position:relative;width:40px;height:24px;border-radius:999px;background:#cbd5e1;transition:background .3s;transition-delay:calc(.7s + var(--k) * .18s)}
.hs-switch::after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:999px;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.2);transition:transform .3s cubic-bezier(.22,1,.36,1);transition-delay:calc(.7s + var(--k) * .18s)}
.is-active .hs-switch{background:#10a36a}
.is-active .hs-switch::after{transform:translateX(16px)}
/* answers */
.hs-answers{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:12px;max-width:32rem}
.hs-ans{align-items:flex-start;padding:16px}
/* demo */
.hs-demo{position:relative;align-self:center}
.hs-frame{position:relative;aspect-ratio:4/4.3;max-height:calc(100vh - var(--hs-top,64px) - 64px);margin-left:auto;border-radius:28px;overflow:hidden;background:#0b1424;box-shadow:0 40px 80px -36px rgba(11,42,91,.55),0 0 0 1px rgba(11,42,91,.08);transition:transform .8s cubic-bezier(.22,1,.36,1),box-shadow .8s}
.hs[data-part=conversion] .hs-frame{box-shadow:0 40px 80px -36px rgba(180,40,46,.5),0 0 0 2px rgba(229,72,77,.35)}
.hs[data-part=privacy] .hs-frame{box-shadow:0 40px 80px -36px rgba(16,120,80,.45),0 0 0 2px rgba(16,163,106,.35)}
.hs-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}
.hs-guard{all:unset;position:absolute;inset:0;cursor:pointer;display:flex;align-items:flex-end;justify-content:center;padding-bottom:84px}
.hs-guard span{padding:9px 16px;border-radius:999px;background:rgba(11,20,36,.78);color:#fff;font-size:14px;font-weight:700;opacity:0;transform:translateY(6px);transition:opacity .2s,transform .2s}
.hs-guard:hover span,.hs-guard:focus-visible span{opacity:1;transform:none}
.hs-frame.is-open .hs-guard{pointer-events:none;visibility:hidden}
.hs-toast{position:absolute;left:16px;top:72px;display:flex;align-items:center;gap:8px;margin:0;padding:9px 14px;border-radius:999px;background:rgba(255,255,255,.94);color:var(--ink);font-size:13.5px;font-weight:700;box-shadow:0 14px 30px -12px rgba(0,0,0,.45);opacity:0;transform:translateY(-8px) scale(.96);transition:opacity .35s,transform .45s cubic-bezier(.22,1,.36,1);pointer-events:none;max-width:calc(100% - 32px)}
.hs-toast.show{opacity:1;transform:none;transition-delay:.35s}
.hs-toast svg{color:var(--brand);flex:none}
.hs-dot{width:9px;height:9px;border-radius:999px;flex:none}
.hs-dot--loss{background:var(--loss);box-shadow:0 0 0 4px rgba(229,72,77,.18)}
.hs-dot--live{background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.2)}
.hs-steps{display:none}
/* motion-only extras */
@media (prefers-reduced-motion:no-preference){
  .hs-arc{stroke-dasharray:4 6;animation:hs-flow 1.2s linear infinite}
  .hs-part:not(.is-active) .hs-arc{animation:none}
  .hs-city{transform-box:fill-box;transform-origin:center;transform:scale(0);transition:transform .45s cubic-bezier(.34,1.56,.64,1);transition-delay:calc(.6s + var(--k) * .15s)}
  .is-active .hs-city{transform:scale(1)}
  .hs-tl:not(.hs-tl--home){opacity:0;transition:opacity .4s;transition-delay:calc(.75s + var(--k) * .15s)}
  .is-active .hs-tl{opacity:1}
}
@keyframes hs-flow{to{stroke-dashoffset:-20}}
@media (prefers-reduced-motion:reduce){
  .hs-part,.hs-w>span,.hs-in,.hs-switch,.hs-switch::after,.hs-toast,.hs-frame,.hs-glow{transition:none!important}
  .hs-cue span::after{animation:none}
}
/* phones and small tablets: demo pinned on top, the story underneath */
@media (max-width:1023px){
  .hs-grid{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);align-items:stretch;gap:12px;padding:12px 16px 0}
  .hs-rail{display:none}
  .hs-demo{grid-row:1}
  .hs-frame{aspect-ratio:auto;height:38svh;max-height:none;border-radius:20px;margin:0}
  .hs-guard{padding-bottom:16px}
  .hs-guard span{opacity:1;transform:none;font-size:12.5px;padding:7px 12px}
  .hs-toast{top:12px;left:12px;font-size:12px;padding:7px 11px}
  .hs-stage{grid-row:2}
  .hs-part{justify-content:flex-start;padding-top:14px}
  .hs-eyebrow{font-size:11px}
  .hs-h1{font-size:clamp(28px,7.6vw,40px);margin-top:8px}
  .hs-h2{font-size:clamp(25px,6.6vw,36px);margin-top:4px}
  .hs-lede{font-size:15.5px;margin-top:12px}
  .hs-body{font-size:14.5px;margin-top:10px}
  .hs-ctas{margin-top:16px;gap:10px}
  .hs-btn{min-height:50px;padding:0 22px;font-size:15.5px}
  .hs-pill{min-height:50px}
  .hs-pill b{font-size:13.5px}.hs-pill small{font-size:12px}
  .hs-play{width:34px;height:34px}.hs-play::after{left:13px;top:10px;border-width:7px 0 7px 10px}
  .hs-cue{display:none}
  .hs-calc{margin-top:12px;padding:14px 16px}
  .hs-row--chips{margin-top:10px}
  .hs-chips button{height:32px;padding:0 12px;font-size:13px}
  .hs-loss{margin-top:12px;padding:12px 14px}
  .hs-loss-num{font-size:28px}
  .hs-loss-sub{font-size:12.5px}
  .hs-map{margin-top:10px}
  .hs-locks{margin-top:10px;gap:7px}
  .hs-lock{padding:9px 12px;gap:10px}
  .hs-lock small{display:none}
  .hs-ic{width:34px;height:34px}
  .hs-answers{margin-top:12px;gap:8px}
  .hs-ans{padding:10px 12px}
  .hs-ans small{display:none}
  .hs-ans{align-items:center}
  .hs-link{display:none}
  .hs-steps{position:absolute;left:16px;right:16px;bottom:10px;display:flex;gap:6px}
  .hs-steps i{flex:1;height:3px;border-radius:3px;background:rgba(11,42,91,.14);transition:background .3s}
  .hs-steps i.on{background:var(--brand)}
}

/* short laptop screens: keep every part inside the pinned area */
@media (min-width:1024px) and (max-height:820px){
  .hs-h1{font-size:clamp(32px,3.7vw,50px)}
  .hs-h2{font-size:clamp(28px,3vw,40px)}
  .hs-lede{margin-top:14px;font-size:17px}
  .hs-body{margin-top:10px;font-size:15.5px}
  .hs-ctas{margin-top:20px}
  .hs-cue{margin-top:22px}
  .hs-calc{margin-top:14px;padding:14px 18px}
  .hs-row--chips{margin-top:10px}
  .hs-loss{margin-top:12px;padding:12px 16px}
  .hs-loss-num{font-size:32px}
  .hs-map{margin-top:12px;max-width:26rem}
  .hs-locks{margin-top:12px;gap:8px}
  .hs-lock{padding:9px 12px}
  .hs-lock small{display:none}
  .hs-answers{margin-top:12px;gap:8px}
  .hs-ans{padding:11px 14px}
  .hs-ans small{font-size:13px}
}
@media (min-width:1024px) and (max-height:680px){
  .hs-ans small{display:none}
  .hs-ans{align-items:center}
}
`;var O=3,_e=[1,5,10,25],C='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';var l={link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',device:'<rect x="2" y="4" width="14" height="10" rx="1.5"/><path d="M6 18h6"/><rect x="17" y="8" width="5" height="12" rx="1"/>',key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',globe:'<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>'},N=(t,a=20)=>`<svg viewBox="0 0 24 24" width="${a}" height="${a}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t}</svg>`,f=t=>t.split(" ").map((a,n)=>`<span class="hs-w"><span style="--i:${n}">${a}</span></span>`).join(" "),b=[{id:"exhibitions",label:"Exhibitions",weight:1.1},{id:"conversion",label:"Conversion",weight:1.5},{id:"international",label:"International buyers",weight:1.1},{id:"privacy",label:"Privacy",weight:1.1},{id:"helps",label:"How VPV helps",weight:1.5}],ee=["",`<i class="hs-dot hs-dot--loss"></i><span>At ${O}%, 97 of every 100 buyers buy elsewhere</span>`,`${N(l.globe,16)}<span>One link. Any buyer, any country.</span>`,"",'<i class="hs-dot hs-dot--live"></i><span>Live \xB7 your whole sales team</span>'],te=!1;function We(t){if(!te){let e=document.createElement("style");e.id="hs-style",e.textContent=Z,document.head.appendChild(e),te=!0}let a=matchMedia("(prefers-reduced-motion: reduce)").matches,n=document.createElement("section");n.className="hs",n.setAttribute("data-testid","home-story"),n.style.setProperty("--hs-parts",String(b.reduce((e,s)=>e+s.weight,0))),n.innerHTML=`
  <div class="hs-pin">
    <div class="hs-glow" aria-hidden="true"></div>
    <div class="hs-grid">
      <div class="hs-stage">
        <article class="hs-part" data-i="0" data-testid="home-section-hero">
          <p class="hs-eyebrow">Real Factories. Real Confidence.</p>
          <h1 class="hs-h1" data-testid="landing-heading">${f("You are already investing in exhibitions and meeting buyers.")}</h1>
          <p class="hs-lede hs-in" style="--d:5">Give those buyers a better way to understand your factory and build confidence in your capabilities.</p>
          <div class="hs-ctas hs-in" style="--d:7">
            <a class="hs-btn" href="/why-vpv" data-testid="hero-why-vpv">Why VPV? ${C}</a>
            <a class="hs-pill" href="/case-studies" data-testid="hero-case-study"><span class="hs-play" aria-hidden="true"></span><span><b>80%+ conversion with VPV</b><small>Anuj Anand's story \xB7 See here</small></span></a>
          </div>
          <p class="hs-cue hs-in" style="--d:9" aria-hidden="true"><span></span>Scroll</p>
        </article>

        <article class="hs-part" data-i="1">
          <h2 class="hs-h2">${f(`Converting only ${O}% of your leads?`)}</h2>
          <div class="hs-calc hs-in" style="--d:4">
            <label class="hs-row"><span>Qualified leads a year</span><b class="hs-leads-out">120</b></label>
            <input class="hs-range" type="range" min="10" max="1000" step="10" value="120" aria-label="Qualified leads a year">
            <p class="hs-row hs-row--chips"><span>Business per lead, a year</span></p>
            <div class="hs-chips" role="group" aria-label="Business per lead, a year">${_e.map(e=>`<button type="button" data-v="${e}" aria-pressed="${e===10}">\u20B9${e}L</button>`).join("")}</div>
            <div class="hs-loss" aria-live="polite">
              <p class="hs-loss-label">Going to your competitors, every year</p>
              <p class="hs-loss-num">\u20B90</p>
              <p class="hs-loss-sub">You win <b class="hs-won">\u20B90</b> of it. That is <b class="hs-day">\u20B90</b> lost every day.</p>
            </div>
          </div>
        </article>

        <article class="hs-part" data-i="2">
          <h2 class="hs-h2">${f("Want to show your factory to international clients?")}</h2>
          <p class="hs-body hs-in" style="--d:5">Walk an international buyer through your plant on Zoom, with no travel on either side. Send your VPV with your company profile, so they understand your capability before deciding on a physical audit.</p>
          <div class="hs-map hs-in" style="--d:7" aria-hidden="true">
            <svg viewBox="0 0 440 150">
              <path class="hs-arc" style="--k:0" d="M300 104 Q255 40 190 58"/>
              <path class="hs-arc" style="--k:1" d="M300 104 Q230 20 120 44"/>
              <path class="hs-arc" style="--k:2" d="M300 104 Q190 10 64 66"/>
              <path class="hs-arc" style="--k:3" d="M300 104 Q360 50 392 92"/>
              <circle class="hs-home" cx="300" cy="104" r="7"/>
              <circle class="hs-city" style="--k:0" cx="190" cy="58" r="5"/><circle class="hs-city" style="--k:1" cx="120" cy="44" r="5"/>
              <circle class="hs-city" style="--k:2" cx="64" cy="66" r="5"/><circle class="hs-city" style="--k:3" cx="392" cy="92" r="5"/>
              <text class="hs-tl hs-tl--home" x="300" y="130">Your factory</text>
              <text class="hs-tl" style="--k:0" x="196" y="80">Dubai</text><text class="hs-tl" style="--k:1" x="120" y="30">Frankfurt</text>
              <text class="hs-tl" style="--k:2" x="64" y="52">Paris</text><text class="hs-tl" style="--k:3" x="392" y="78">Singapore</text>
            </svg>
          </div>
        </article>

        <article class="hs-part" data-i="3">
          <h2 class="hs-h2">${f("Don't want to share your factory with your competition?")}</h2>
          <p class="hs-body hs-in" style="--d:5">Decide exactly who gets in. Protect each link you send:</p>
          <ul class="hs-locks">
            ${[[l.link,"One-time links","A link opens once, for the buyer you sent it to."],[l.timer,"Links that expire","Give a link 24 hours, or a week."],[l.device,"Device limits","Decide how many devices a link works on."],[l.key,"Password protection","Only the buyer you gave it to can get in."]].map(([e,s,c],i)=>`<li class="hs-lock hs-in" style="--d:${6+i}"><span class="hs-ic">${N(e,18)}</span><span><b>${s}</b><small>${c}</small></span><i class="hs-switch" style="--k:${i}"></i></li>`).join("")}
          </ul>
        </article>

        <article class="hs-part" data-i="4">
          <p class="hs-eyebrow">How VPV helps</p>
          <h2 class="hs-h2">${f("Buyers trust what they can see.")}</h2>
          <ol class="hs-answers">
            ${[[l.eye,"More of your leads convert","They see the machines, not slides. Every line, machine and quality check, in 360\xB0, at the buyer's own pace."],[l.globe,"Close international deals on a call","Walk an international buyer through your plant on Zoom, with no travel on either side."],[l.shield,"Only the buyers you choose get in","One-time links, expiry, device limits and passwords keep your factory away from competitors."]].map(([e,s,c],i)=>`<li class="hs-ans hs-in" style="--d:${4+i*2}"><span class="hs-ic hs-ic--grad">${N(e,20)}</span><span><b>${s}</b><small>${c}</small></span></li>`).join("")}
          </ol>
          <div class="hs-ctas hs-in" style="--d:11">
            <a class="hs-btn" href="/assessment" data-testid="home-story-cta">Find the Right VPV for Your Factory ${C}</a>
            <a class="hs-link" href="/why-vpv">See everything VPV does ${C}</a>
          </div>
        </article>
      </div>

      <div class="hs-demo" data-testid="hero-experience">
        <div class="hs-frame">
          <iframe src="/experience" title="Live VPV: walk through a real factory in 360\xB0" allow="fullscreen; xr-spatial-tracking; gyroscope; accelerometer; autoplay" allowfullscreen></iframe>
          <button type="button" class="hs-guard" aria-label="Explore the live factory tour"><span>Click to explore the live tour</span></button>
          <p class="hs-toast" aria-hidden="true"></p>
        </div>
      </div>
    </div>
    <div class="hs-steps" aria-hidden="true">${b.map(()=>"<i></i>").join("")}</div>
  </div>`,t.appendChild(n);let r=e=>n.querySelector(e),o=Array.from(n.querySelectorAll(".hs-part")),p=Array.from(n.querySelectorAll(".hs-steps i")),d=r(".hs-toast"),ne=r(".hs-pin"),k=r(".hs-range"),ae=r(".hs-leads-out"),R=r(".hs-loss-num"),S=r(".hs-loss"),re=r(".hs-won"),se=r(".hs-day"),V=Array.from(n.querySelectorAll(".hs-chips button")),u={leads:120,valueLakh:10,conv:O,lift:5},h=0,y=0,I=0,x=0,A=!1,oe=e=>{if(cancelAnimationFrame(y),a){h=e,R.textContent=g(e);return}let s=h,c=performance.now(),i=de=>{let z=Math.min(1,(de-c)/700),he=1-Math.pow(1-z,3);h=s+(e-s)*he,R.textContent=g(h),z<1&&(y=requestAnimationFrame(i))};y=requestAnimationFrame(i)},_=()=>{let e=M(u);ae.textContent=u.leads.toLocaleString("en-IN"),k.style.setProperty("--p",`${(u.leads-10)/990*100}%`),re.textContent=g(e.won),se.textContent=g(e.lost/365),oe(e.lost),e.lost>I+1&&I>0&&!a&&(S.classList.remove("hs-hit"),S.offsetWidth,S.classList.add("hs-hit")),I=e.lost,V.forEach(s=>s.setAttribute("aria-pressed",String(Number(s.dataset.v)===u.valueLakh)))},H=(e=!1)=>{clearTimeout(x),A&&(A=!1,X("calculator_used",U(u,{field:"leads"}),{beacon:e,path:"/"}))},F=()=>{A=!0,clearTimeout(x),x=window.setTimeout(()=>H(),1500),_()};k.addEventListener("input",()=>{u.leads=Number(k.value),F()}),V.forEach(e=>e.addEventListener("click",()=>{u.valueLakh=Number(e.dataset.v),F()}));let E=()=>H(!0);addEventListener("pagehide",E);let v=r(".hs-frame"),ie=r(".hs-guard"),ce=()=>v.classList.add("is-open"),D=()=>v.classList.remove("is-open");ie.addEventListener("click",ce),v.addEventListener("mouseleave",D);let B=e=>{v.contains(e.target)||D()};document.addEventListener("touchstart",B,{passive:!0});let le=b.reduce((e,s)=>e+s.weight,0),P=[];b.reduce((e,s)=>(P.push(e/le),e+s.weight),0);let T=()=>{let e=document.getElementById("vpv-site-header");return e?e.getBoundingClientRect().height:0},ue=()=>{let e=n.getBoundingClientRect(),s=n.offsetHeight-(innerHeight-T());return Math.min(1,Math.max(0,(T()-e.top)/Math.max(1,s)))},w=-1,pe=e=>{if(e===w)return;let s=e>w?"down":"up";o.forEach((c,i)=>{c.classList.toggle("is-active",i===e),c.classList.toggle("is-past",i<e),c.setAttribute("aria-hidden",String(i!==e)),c.inert=i!==e}),n.dataset.dir=s,n.dataset.part=b[e].id,p.forEach((c,i)=>c.classList.toggle("on",i<=e)),d.classList.remove("show"),ee[e]&&(d.innerHTML=ee[e],d.offsetWidth,d.classList.add("show")),e===1&&w!==1&&(h=0,_()),w=e},m=()=>{ne.style.setProperty("--hs-top",T()+"px");let e=ue(),s=0;for(;s<P.length-1&&e>=P[s+1]-1e-4;)s++;pe(s)};addEventListener("scroll",m,{passive:!0}),addEventListener("resize",m),_(),m();let G=new MutationObserver(()=>{t.isConnected||j()});G.observe(document.body,{childList:!0,subtree:!0});function j(){E(),G.disconnect(),cancelAnimationFrame(y),clearTimeout(x),removeEventListener("scroll",m),removeEventListener("resize",m),removeEventListener("pagehide",E),document.removeEventListener("touchstart",B)}return j}export{We as mount};
