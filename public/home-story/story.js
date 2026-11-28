function Ft(s){let r=s.leads*s.valueLakh*1e5,i=r*s.conv/100,a=r-i,h=Math.min(s.lift,100-s.conv),T=s.conv+h,pe=r*h/100;return{opportunity:r,won:i,lost:a,liftApplied:h,newConv:T,recovered:pe}}function lt(s,r={}){let i=Ft(s),a={leads:s.leads,valueLakh:s.valueLakh,conv:s.conv,lift:s.lift,opportunity:Math.round(i.opportunity),recovered:Math.round(i.recovered)};return r.field&&(a.field=r.field),typeof r.saves=="number"&&(a.saves=r.saves),a}var pt="vpv_no_analytics";var qt="vpv.attr.v1",Te="vpv.sid.v1";function ct(){try{return window.localStorage}catch{return null}}function Bt(){try{return document.cookie.includes(`${pt}=1`)}catch{return!1}}function Dt(){try{let s=ct()?.getItem(qt);return s?JSON.parse(s):null}catch{return null}}function Ut(){try{let s=ct();if(!s)return null;let r=s.getItem(Te),i=Date.now();if(r){let{id:h,at:T}=JSON.parse(r);if(h&&i-T<1800*1e3)return s.setItem(Te,JSON.stringify({id:h,at:i})),h}let a=crypto.randomUUID();return s.setItem(Te,JSON.stringify({id:a,at:i})),a}catch{return null}}function jt(s,r){try{let i=window.gtag;typeof i=="function"&&s!=="page_view"&&i("event",s,r??{})}catch{}}function D(s,r,i={}){if(typeof window>"u"||Bt())return;let a=Dt(),h=JSON.stringify({name:s,path:i.path??window.location.pathname+window.location.search,referrer:document.referrer||null,sessionId:Ut(),utmSource:a?.source??null,utmMedium:a?.medium??null,utmCampaign:a?.campaign??null,code:a?.code??null,meta:r??null});jt(s,r);try{if(i.beacon&&typeof navigator.sendBeacon=="function"){navigator.sendBeacon("/api/track",new Blob([h],{type:"application/json"}));return}fetch("/api/track",{method:"POST",headers:{"Content-Type":"application/json"},body:h,keepalive:!0}).catch(()=>{})}catch{}}var dt=`.hs{--ink:#0b2a5b;--brand:#0b5cff;--muted:#475569;--loss:#e5484d;position:relative;height:calc(var(--hs-parts,7) * 100vh);background:linear-gradient(180deg,#f2f7ff 0%,#fff 55%,#f4f8fd 100%);color:var(--ink);font-family:"Plus Jakarta Sans",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.hs *{box-sizing:border-box}
.hs-pin{position:sticky;top:var(--hs-top,64px);height:calc(100vh - var(--hs-top,64px));height:calc(100svh - var(--hs-top,64px));overflow:hidden}
/* the coloured glow behind the story: four ready-made layers that cross-fade
   (opacity only, which the graphics chip does for free). */
.hs-glow{position:absolute;right:-8%;top:8%;width:62vw;height:62vw;max-width:880px;max-height:880px;border-radius:50%;opacity:0;transition:opacity .5s ease;pointer-events:none;will-change:opacity}
.hs-glow--base{background:radial-gradient(closest-side,rgba(11,92,255,.2),rgba(11,92,255,.08) 55%,transparent)}
.hs-glow--loss{background:radial-gradient(closest-side,rgba(229,72,77,.17),rgba(229,72,77,.06) 55%,transparent)}
.hs-glow--sky{background:radial-gradient(closest-side,rgba(25,184,242,.22),rgba(25,184,242,.08) 55%,transparent)}
.hs-glow--safe{background:radial-gradient(closest-side,rgba(16,163,106,.16),rgba(16,163,106,.06) 55%,transparent)}
.hs:not([data-part]) .hs-glow--base,.hs[data-part=problem] .hs-glow--base,.hs[data-part=trust] .hs-glow--base,.hs[data-part=order] .hs-glow--base,.hs[data-part=cost] .hs-glow--loss,.hs[data-part=proof] .hs-glow--sky,.hs[data-part=how] .hs-glow--sky,.hs[data-part=solution] .hs-glow--safe{opacity:1}
.hs-grid{position:relative;height:100%;max-width:72rem;margin:0 auto;padding:0 24px;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:28px 56px;align-items:center}
/* stage + parts */
.hs-stage{position:relative;height:100%}
.hs-part{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;opacity:0;visibility:hidden;transform:translateY(22px);transition:opacity .28s cubic-bezier(.22,1,.36,1),transform .42s cubic-bezier(.22,1,.36,1),visibility 0s .42s}
.hs[data-dir=up] .hs-part:not(.is-active){transform:translateY(22px)}
.hs-part.is-past{transform:translateY(-22px)}
.hs-part.is-active{opacity:1;visibility:visible;transform:none;transition-delay:0s,0s,0s}
.hs-eyebrow{margin:0;font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--brand)}
.hs-h1{margin:14px 0 0;font-size:clamp(36px,4.5vw,64px);line-height:1.03;font-weight:800;letter-spacing:-.035em}
.hs-h2{margin:10px 0 0;font-size:clamp(30px,3.6vw,50px);line-height:1.06;font-weight:800;letter-spacing:-.03em}
.hs-h2--calc{font-size:clamp(24px,2.5vw,34px);line-height:1.12;letter-spacing:-.025em;max-width:34rem}
.hs-w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.08em;margin-bottom:-.08em}
.hs-w>span{display:inline-block;transform:translateY(105%);transition:transform .5s cubic-bezier(.22,1,.36,1);transition-delay:calc(min(var(--i) * 14ms, .22s))}
.is-active .hs-w>span{transform:none}
.hs-in{opacity:0;transform:translateY(12px);transition:opacity .4s cubic-bezier(.22,1,.36,1),transform .45s cubic-bezier(.22,1,.36,1);transition-delay:calc(min(var(--d,0) * 18ms, .32s))}
.is-active .hs-in{opacity:1;transform:none}
.hs-lede{margin:22px 0 0;max-width:34rem;font-size:clamp(17px,1.4vw,21px);line-height:1.55;color:var(--muted)}
.hs-lede strong{font-weight:800}
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
.hs-calc{margin-top:20px;max-width:37rem;padding:6px 24px 4px;border-radius:22px;background:#fff;box-shadow:0 1px 2px rgba(11,42,91,.06),0 24px 50px -28px rgba(11,42,91,.4);border:1px solid #e6edf7}
.hs-cq{padding:16px 0;border-bottom:1px solid #e8eef6}
.hs-cq-head{display:flex;align-items:center;justify-content:space-between;gap:16px}
.hs-cq-t{display:block;margin:0;font-size:17px;font-weight:700;line-height:1.3;color:var(--ink);letter-spacing:-.01em}
.hs-cq-t small{display:block;margin-top:3px;font-size:13.5px;font-weight:500;color:#64748b;letter-spacing:0}
.hs-val{flex:none;min-width:84px;padding:8px 14px;border-radius:14px;background:#eef4ff;color:var(--brand);font-size:26px;font-weight:800;line-height:1.1;text-align:center;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.hs-leads-in{width:112px;border:2px solid #d3e1f8;font-family:inherit;outline:none;cursor:text;transition:border-color .2s,box-shadow .2s,background .2s}
.hs-leads-in:hover{border-color:#9db9ea}
.hs-leads-in:focus{border-color:var(--brand);background:#fff;box-shadow:0 0 0 4px rgba(11,92,255,.15)}
.hs-ends{display:flex;justify-content:space-between;margin:6px 0 0;font-size:13px;font-weight:600;color:#64748b;font-variant-numeric:tabular-nums}
.hs-conv-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;margin-top:12px;font-size:14px;font-weight:700;color:#334155;font-variant-numeric:tabular-nums}
.hs-conv-row .hs-range{margin:0}
.hs-range{-webkit-appearance:none;appearance:none;width:100%;height:8px;margin:14px 0 0;border-radius:999px;outline:none;cursor:pointer;background:linear-gradient(90deg,var(--brand) var(--p,11%),#e3eaf5 var(--p,11%))}
.hs-range::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;border-radius:999px;background:#fff;border:3px solid var(--brand);box-shadow:0 4px 12px rgba(11,92,255,.35)}
.hs-range::-moz-range-thumb{width:20px;height:20px;border-radius:999px;background:#fff;border:3px solid var(--brand)}
.hs-range:focus-visible{box-shadow:0 0 0 4px rgba(11,92,255,.2)}
.hs-chips{display:flex;gap:7px;margin-top:12px;flex-wrap:wrap}
.hs-chips button{all:unset;cursor:pointer;height:38px;padding:0 11px;border-radius:999px;background:#f1f5f9;font-size:15px;font-weight:700;color:#334155;transition:background .2s,color .2s,box-shadow .2s}
.hs-custom{display:flex;gap:8px;margin-top:10px}
.hs-custom[hidden]{display:none}
.hs-custom-field{flex:1;display:flex;align-items:center;gap:6px;height:44px;padding:0 14px;border-radius:12px;border:1.5px solid #cfdcf0;background:#fff;font-size:17px;font-weight:700;color:var(--ink);transition:border-color .2s,box-shadow .2s}
.hs-custom-field:focus-within{border-color:var(--brand);box-shadow:0 0 0 4px rgba(11,92,255,.15)}
.hs-custom-field input{all:unset;flex:1;min-width:0;font-size:17px;font-weight:700;color:var(--ink)}
.hs-custom-field input::placeholder{color:#94a3b8;font-weight:500}
.hs-custom-unit{height:44px;padding:0 12px;border-radius:12px;border:1.5px solid #cfdcf0;background:#f8fafc;font:inherit;font-size:15px;font-weight:700;color:#334155;cursor:pointer}
.hs-custom-unit:focus-visible{outline:none;border-color:var(--brand);box-shadow:0 0 0 4px rgba(11,92,255,.15)}
.hs-chips button[aria-pressed=true]{background:var(--brand);color:#fff;box-shadow:0 6px 16px -6px rgba(11,92,255,.6)}
.hs-res{padding:4px 0}
.hs-res-row{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);align-items:center;padding:12px 0}
.hs-res-row+.hs-res-row{border-top:1px solid #e8eef6}
.hs-res-row p{margin:0;padding-right:16px;border-right:1px solid #e2e8f0;font-size:15px;font-weight:700;line-height:1.3;color:var(--ink)}
.hs-res-row small{display:block;margin-top:3px;font-size:13px;font-weight:500;color:#64748b}
.hs-res-row b{padding-left:20px;font-size:calc(clamp(22px,2.1vw,30px) * var(--fit,1));font-weight:800;line-height:1.1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap}
.hs-won{color:#1e9e50}
.hs-loss-num{color:#d92d2d}
.hs-loss{transform-origin:left center}
@keyframes hs-hit{0%{transform:scale(1)}30%{transform:scale(1.03)}100%{transform:scale(1)}}
@keyframes hs-flash{0%{box-shadow:0 0 0 0 rgba(229,72,77,.45)}100%{box-shadow:0 0 0 16px rgba(229,72,77,0)}}
.hs-hit{animation:hs-hit .5s cubic-bezier(.22,1,.36,1),hs-flash .8s ease-out}
/* locks */
.hs-locks{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:10px;max-width:30rem}
.hs-lock,.hs-ans{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:16px;background:#fff;border:1px solid #e6edf7;box-shadow:0 12px 28px -22px rgba(11,42,91,.5)}
.hs-lock b,.hs-ans b{display:block;font-size:15px;font-weight:800;color:var(--ink)}
.hs-lock small,.hs-ans small{display:block;margin-top:2px;font-size:13.5px;line-height:1.45;color:var(--muted)}
.hs-lock>span:nth-child(2){flex:1}
.hs-ic{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:#eaf2fe;color:var(--brand)}
.hs-ic--grad{background:linear-gradient(135deg,#0b2a5b,#0b5cff);color:#fff;box-shadow:0 0 0 5px rgba(11,92,255,.1)}
.hs-switch{flex:none;position:relative;width:40px;height:24px;border-radius:999px;background:#cbd5e1;transition:background .3s;transition-delay:calc(.3s + var(--k) * .08s)}
.hs-switch::after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:999px;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.2);transition:transform .3s cubic-bezier(.22,1,.36,1);transition-delay:calc(.3s + var(--k) * .08s)}
.is-active .hs-switch{background:#10a36a}
.is-active .hs-switch::after{transform:translateX(16px)}
/* the right-hand side: one picture, animation, table or video per part */
.hs-visual{position:relative;align-self:center;width:100%;height:min(640px,calc(100vh - var(--hs-top,64px) - 64px));height:min(640px,calc(100svh - var(--hs-top,64px) - 64px))}
.hs-vis{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;visibility:hidden;transform:translateY(18px) scale(.985);transition:opacity .3s cubic-bezier(.22,1,.36,1),transform .45s cubic-bezier(.22,1,.36,1),visibility 0s .45s}
.hs-vis.is-past{transform:translateY(-18px) scale(.985)}
.hs-vis.is-active{opacity:1;visibility:visible;transform:none;transition-delay:0s,0s,0s}
.hs-card{width:100%;max-width:33rem;padding:22px 24px;border-radius:24px;background:#fff;border:1px solid #e6edf7;box-shadow:0 1px 2px rgba(11,42,91,.06),0 30px 60px -32px rgba(11,42,91,.45)}
.hs-card-t{margin:0;font-size:19px;font-weight:800;letter-spacing:-.015em;color:var(--ink)}
.hs-card-s{margin:5px 0 0;font-size:13.5px;line-height:1.45;color:#64748b}
.hs-card-n{margin:12px 0 0;font-size:12.5px;line-height:1.45;color:#64748b}
.hs-chip{position:absolute;z-index:2;display:inline-flex;align-items:center;gap:8px;padding:9px 15px 9px 12px;border-radius:999px;font-size:14px;font-weight:800;white-space:nowrap;background:#fff;border:1px solid #e6edf7;box-shadow:0 14px 30px -14px rgba(11,42,91,.55)}
.hs-chip--blue{color:var(--brand)}
.hs-chip--green{color:#0f8a57}
.hs-chip--red{color:#c62828;background:#fff5f5;border-color:#fecaca}
/* 0: the exhibition photo */
.hs-photo{position:relative;margin:0;width:100%;max-width:34rem}
.hs-photo img{display:block;width:100%;height:auto;aspect-ratio:4/3.15;object-fit:cover;border-radius:26px;box-shadow:0 40px 80px -36px rgba(11,42,91,.55),0 0 0 1px rgba(11,42,91,.08)}
.hs-chip--a{left:-14px;top:9%}
.hs-chip--b{right:-14px;top:46%}
.hs-chip--c{left:7%;bottom:-16px}
/* 1: trust meters */
.hs-meters{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:16px}
.hs-meter-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px}
.hs-meter-main b{display:block;margin-bottom:9px;font-size:15.5px;font-weight:800;color:var(--ink)}
.hs-meter{position:relative;display:block;height:10px;border-radius:999px;background:#e8eef6}
.hs-meter u{position:absolute;inset:0 auto 0 0;width:100%;border-radius:999px;background:linear-gradient(90deg,#f5a524,#e5484d);transform:scaleX(var(--f,.3));transform-origin:left;text-decoration:none}
.hs-meter::after{content:"";position:absolute;right:0;top:-7px;bottom:-7px;border-right:2px dashed #64748b}
.hs-meter-row em{font-style:normal;padding:4px 10px;border-radius:999px;background:#fff1f1;color:#c62828;font-size:12.5px;font-weight:800;white-space:nowrap}
.hs-legend{display:flex;align-items:center;gap:10px;margin:20px 0 0;font-size:13px;font-weight:600;color:#475569}
.hs-dash{flex:none;width:0;height:16px;border-left:2px dashed #64748b}
/* 2: the four factories */
.hs-table{width:100%;margin-top:12px;border-collapse:separate;border-spacing:0 7px}
.hs-table th,.hs-table td{text-align:right;padding:0 10px;vertical-align:middle}
.hs-table thead th{padding-bottom:0;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748b;line-height:1.2}
.hs-table thead th:first-child,.hs-table tbody th{text-align:left}
.hs-table td{white-space:nowrap}
.hs-brief{display:none}
.hs-fr th,.hs-fr td{padding-top:9px;padding-bottom:9px;background:#f8fbff;border-top:1px solid #e6edf7;border-bottom:1px solid #e6edf7;font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--ink);transition:background .25s,border-color .25s}
.hs-fr th:first-child{border-left:1px solid #e6edf7;border-radius:14px 0 0 14px}
.hs-fr td:last-child{border-right:1px solid #e6edf7;border-radius:0 14px 14px 0}
.hs-fr:hover th,.hs-fr:hover td{background:#f0f6ff}
.hs-fr.is-picked th,.hs-fr.is-picked td{background:#eaf2fe;border-color:#a9c8ff}
.hs-fbtn{all:unset;display:block;cursor:pointer;text-align:left}
.hs-fbtn:focus-visible{outline:3px solid var(--brand);outline-offset:4px;border-radius:8px}
.hs-fbtn b{display:block;font-size:15px;font-weight:800;color:var(--ink)}
.hs-fbtn small{display:block;margin-top:1px;font-size:12.5px;font-weight:600;color:#64748b}
.hs-fbtn .hs-fnote{color:var(--brand);font-weight:700}
.hs-won-c{color:#1e9e50!important}
.hs-lost-c{color:#d92d2d!important;font-size:17px!important}
/* 3: the video */
.hs-vid{width:100%;max-width:33rem;display:flex;flex-direction:column;gap:12px}
.hs-vid-tag{align-self:flex-start;display:inline-flex;align-items:center;gap:10px;margin:0;padding:6px 16px 6px 8px;border-radius:999px;background:#fff;border:1px solid #e6edf7;font-size:15px;font-weight:800;color:var(--ink);box-shadow:0 12px 26px -16px rgba(11,42,91,.5)}
.hs-vid-tag .hs-play{width:30px;height:30px;box-shadow:0 0 0 4px rgba(11,92,255,.12)}
.hs-vid-tag .hs-play::after{left:12px;top:8px;border-width:7px 0 7px 10px}
.hs-vid-frame{position:relative;aspect-ratio:16/9;border-radius:22px;overflow:hidden;background:#0b1424;box-shadow:0 40px 80px -36px rgba(11,42,91,.6),0 0 0 1px rgba(11,42,91,.1)}
.hs-vid-frame.is-portrait{aspect-ratio:9/16;width:auto;height:min(520px,60vh);margin:0 auto}
.hs-vid-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}
.hs-vguard{all:unset;position:absolute;inset:0;z-index:1;cursor:pointer}
.hs-vid-frame.is-open .hs-vguard{pointer-events:none;visibility:hidden}
.hs-sound{all:unset;cursor:pointer;position:absolute;z-index:2;left:50%;bottom:16px;translate:-50% 0;display:inline-flex;align-items:center;gap:10px;height:48px;padding:0 22px;border-radius:999px;background:var(--brand);color:#fff;font-size:15px;font-weight:800;box-shadow:0 12px 28px -8px rgba(11,92,255,.85)}
.hs-sound::after{content:"";position:absolute;inset:0;border-radius:999px;border:2px solid rgba(11,92,255,.55);opacity:0;pointer-events:none}
.hs-sound:hover{background:#0a4fe0}
.hs-sound:focus-visible{outline:3px solid #fff;outline-offset:3px}
.hs-vid-frame.is-sound .hs-sound{display:none}
.hs-vid-who{margin:0;display:flex;flex-direction:column;gap:2px}
.hs-vid-who b{font-size:15px;font-weight:800;color:var(--ink)}
.hs-vid-who span{font-size:13.5px;font-weight:600;color:#64748b}
.hs-quote{margin:14px 0 0;max-width:32rem;padding:0 0 0 16px;border-left:4px solid var(--brand)}
.hs-quote p{margin:0;font-size:16.5px;font-weight:600;line-height:1.5;color:var(--ink)}
.hs-quote footer{margin-top:8px;font-size:13.5px;font-weight:700;color:#64748b}
.hs-logos{margin:16px 0 0;max-width:29rem}
.hs-logos img{display:block;width:100%;height:auto;border-radius:16px}
.hs-h2--proof{font-size:clamp(26px,2.8vw,38px);line-height:1.1;max-width:30rem}
.hs-body--em{margin-top:10px;color:var(--ink)}
.hs-h2--how{font-size:clamp(28px,3.1vw,44px);line-height:1.1}
.hs-sent{display:block}
/* 4: the solution */
.hs-sol{position:relative;width:100%;max-width:34rem}
.hs-sol::before{content:"";position:absolute;inset:14% 0 0 6%;border-radius:32px;background:linear-gradient(150deg,#dcebff,#f3f8ff);box-shadow:0 0 0 1px #d3e3fb inset,0 40px 70px -40px rgba(11,42,91,.5)}
.hs-sol img{position:relative;display:block;width:100%;height:auto}
.hs-chip--d{left:0;bottom:8%}
.hs-chip--e{right:0;top:4%}
/* 5: how it works */
.hs-flow{list-style:none;margin:0;padding:0;position:relative;display:grid;gap:16px;width:100%;max-width:32rem}
.hs-flow::before{content:"";position:absolute;left:38px;top:40px;bottom:40px;width:3px;border-radius:3px;background:linear-gradient(#0b5cff,#19b8f2);opacity:.4}
.hs-flow-i{position:relative;display:flex;align-items:flex-start;gap:16px;padding:18px;border-radius:20px;background:#fff;border:1px solid #e6edf7;box-shadow:0 14px 30px -22px rgba(11,42,91,.5)}
.hs-flow-i b{display:block;font-size:17px;font-weight:800;color:var(--ink)}
.hs-flow-i small{display:block;margin-top:4px;font-size:14px;line-height:1.5;color:var(--muted)}
/* 6: the five steps */
.hs-steps5{list-style:none;margin:0;padding:0;display:grid;gap:10px;width:100%;max-width:32rem}
.hs-s5{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px;padding:14px 16px;border-radius:18px;background:#fff;border:1px solid #e6edf7;box-shadow:0 12px 26px -20px rgba(11,42,91,.5)}
.hs-num{display:grid;place-items:center;width:36px;height:36px;border-radius:999px;background:linear-gradient(140deg,#2f7bff,#0b4fe0);color:#fff;font-size:15px;font-weight:800;box-shadow:0 0 0 5px rgba(11,92,255,.12)}
.hs-s5-t b{display:block;font-size:16px;font-weight:800;color:var(--ink)}
.hs-s5-t small{display:block;margin-top:2px;font-size:13.5px;color:#64748b}
.hs-who{font-style:normal;padding:4px 11px;border-radius:999px;font-size:12px;font-weight:800;white-space:nowrap}
.hs-who--you{background:#eaf2fe;color:var(--brand)}
.hs-who--us{background:#e6f7ef;color:#0f8a57}
.hs-steps{display:none}
/* motion-only extras: the default CSS above is the finished picture */
@media (prefers-reduced-motion:no-preference){
  .hs-pop{opacity:0;transform:translateY(14px) scale(.96);transition:opacity .4s cubic-bezier(.22,1,.36,1),transform .55s cubic-bezier(.34,1.3,.64,1);transition-delay:calc(.25s + var(--k,0) * .12s)}
  .hs-vis.is-active .hs-pop{opacity:1;transform:none}
  .hs-fr.hs-pop{transform:none}
  .hs-meter u{transform:scaleX(0);transition:transform 1.1s cubic-bezier(.22,1,.36,1);transition-delay:calc(.35s + var(--k,0) * .16s)}
  .hs-vis.is-active .hs-meter u{transform:scaleX(var(--f,.3))}
  .hs-flow::before{transform:scaleY(0);transform-origin:top;transition:transform 1.2s cubic-bezier(.65,0,.35,1) .3s}
  .hs-vis.is-active .hs-flow::before{transform:none}
  .hs-sound::after{animation:hs-ring 2.2s ease-out infinite}
}
@keyframes hs-ring{0%{opacity:.9;transform:scale(1)}70%,100%{opacity:0;transform:scale(1.28,1.7)}}
@media (prefers-reduced-motion:reduce){
  .hs-part,.hs-w>span,.hs-in,.hs-switch,.hs-switch::after,.hs-vis,.hs-glow,.hs-pop{transition:none!important}
  .hs-cue span::after{animation:none}
}
/* opening line: navy statement, red follow-up, hand-drawn underline */
.hs-h1--hero{font-size:clamp(30px,3.3vw,48px);line-height:1.07}
.hs-red{display:block;margin-top:.12em;color:#d92d2d}
.hs-mark{position:relative;display:inline-block;white-space:nowrap}
.hs-scribble{position:absolute;left:-2%;right:-2%;bottom:-.24em;width:104%;height:.32em;overflow:visible}
.hs-scribble path{fill:none;stroke:#d92d2d;stroke-width:4;stroke-linecap:round;vector-effect:non-scaling-stroke;stroke-dasharray:320;stroke-dashoffset:0}
@media (prefers-reduced-motion:no-preference){
  .hs-scribble path{stroke-dashoffset:320;transition:stroke-dashoffset .6s cubic-bezier(.65,0,.35,1) .35s}
  .is-active .hs-scribble path{stroke-dashoffset:0}
}
/* solid blue tiles */
.hs-ic--grad{background:linear-gradient(140deg,#2f7bff,#0b4fe0);color:#fff;border-radius:14px;box-shadow:0 0 0 5px rgba(11,92,255,.12),0 10px 18px -8px rgba(11,92,255,.6)}
/* short laptop screens: keep every part inside the pinned area */
@media (min-width:1024px) and (max-height:820px){
  .hs-h1--hero{font-size:clamp(28px,2.9vw,40px)}
  .hs-h2{font-size:clamp(28px,3vw,40px)}
  .hs-h2--calc{font-size:clamp(21px,2.1vw,27px)}
  .hs-h2--proof{font-size:clamp(24px,2.4vw,32px)}
  .hs-h2--how{font-size:clamp(26px,2.7vw,36px)}
  .hs-lede{margin-top:14px;font-size:17px}
  .hs-body{margin-top:10px;font-size:15.5px}
  .hs-ctas{margin-top:20px}
  .hs-cue{margin-top:22px}
  .hs-calc{margin-top:12px;padding:2px 20px}
  .hs-cq{padding:10px 0}
  .hs-cq-t{font-size:15.5px}
  .hs-cq-t small{font-size:12.5px}
  .hs-val{font-size:21px;padding:5px 12px}
  .hs-leads-in{width:100px}
  .hs-range{margin-top:10px}
  .hs-conv-row{margin-top:8px}
  .hs-chips{margin-top:8px}
  .hs-chips button{height:33px;padding:0 13px;font-size:14px}
  .hs-res-row{padding:8px 0}
  .hs-res-row b{font-size:calc(25px * var(--fit,1))}
  .hs-locks{margin-top:12px;gap:8px}
  .hs-lock{padding:9px 12px}
  .hs-lock small{display:none}
  .hs-quote{margin-top:10px}
  .hs-quote p{font-size:15.5px}
  .hs-logos{margin-top:12px;max-width:24rem}
  .hs-card{padding:18px 20px}
  .hs-meters{margin-top:14px;gap:12px}
  .hs-flow-i{padding:14px 16px}
  .hs-steps5{gap:8px}
  .hs-s5{padding:11px 14px}
}
@media (min-width:1024px) and (max-height:680px){
  .hs-logos{max-width:20rem}
  .hs-flow-i small,.hs-card-n{display:none}
}

/* phones and small tablets: the picture / table / video on top, the story underneath */
@media (max-width:1023px){
  .hs-grid{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);align-items:stretch;gap:12px;padding:12px 16px 0}
  .hs-visual{grid-row:1;height:calc(38svh - 18px)}
  .hs-vis{align-items:center}
  .hs-stage{grid-row:2}
  .hs-part{justify-content:flex-start;padding-top:14px}
  .hs-eyebrow{font-size:11px}
  .hs-h1{font-size:clamp(28px,7.6vw,40px);margin-top:8px}
  .hs-h1--hero{font-size:clamp(22px,6vw,32px);line-height:1.1}
  .hs-h2{font-size:clamp(25px,6.6vw,36px);margin-top:4px}
  .hs-h2--calc{font-size:clamp(17px,4.6vw,22px);line-height:1.18}
  .hs-h2--proof{font-size:clamp(20px,5.4vw,26px);margin-top:4px}
  .hs-h2--how{font-size:clamp(22px,6vw,30px)}
  .hs-lede{font-size:15px;margin-top:10px}
  .hs-body{font-size:14.5px;margin-top:10px}
  .hs-ctas{margin-top:14px;gap:10px}
  .hs-btn{min-height:50px;padding:0 22px;font-size:15.5px}
  .hs-play{width:34px;height:34px}.hs-play::after{left:13px;top:10px;border-width:7px 0 7px 10px}
  .hs-cue{display:none}
  .hs-link{display:none}
  .hs-link--keep{display:inline-flex}
  .hs-calc{margin-top:10px;padding:0 14px;border-radius:18px}
  .hs-cq{padding:9px 0}
  .hs-cq-t{font-size:14px}
  .hs-cq-t small{font-size:11.5px;margin-top:1px}
  .hs-val{min-width:58px;padding:4px 10px;border-radius:10px;font-size:18px}
  .hs-leads-in{width:84px}
  .hs-range{margin-top:8px}
  .hs-ends{display:none}
  .hs-conv-row{margin-top:6px;gap:10px;font-size:12px}
  .hs-chips{gap:5px;margin-top:7px;flex-wrap:nowrap}
  .hs-chips button{flex:1 1 0;min-width:0;height:30px;padding:0;text-align:center;font-size:12px}
  .hs-chips .hs-chip-custom{flex:1.45 1 0}
  .hs-custom{margin-top:6px;gap:6px}
  .hs-custom-field,.hs-custom-unit{height:34px;border-radius:10px;font-size:14px}
  .hs-custom-field input{font-size:15px}
  .hs-res{padding:0}
  .hs-res-row{padding:7px 0}
  .hs-res-row p{font-size:12.5px;padding-right:10px}
  .hs-res-row small{font-size:11px;margin-top:1px}
  .hs-res-row b{padding-left:12px;font-size:calc(19px * var(--fit,1))}
  .hs-locks{margin-top:10px;gap:7px}
  .hs-lock{padding:9px 12px;gap:10px}
  .hs-lock small{display:none}
  .hs-ic{width:34px;height:34px}
  .hs-quote{margin-top:8px;padding-left:12px}
  .hs-quote p{font-size:14px}
  .hs-quote footer{margin-top:4px;font-size:12px}
  .hs-logos{margin-top:10px;max-width:15rem}
  .hs-steps{position:absolute;left:16px;right:16px;bottom:10px;display:flex;gap:6px}
  .hs-steps i{flex:1;height:3px;border-radius:3px;background:rgba(11,42,91,.14);transition:background .3s}
  .hs-steps i.on{background:var(--brand)}
  /* the picture side, small */
  .hs-photo,.hs-sol{max-width:min(100%,26rem)}
  .hs-photo img{border-radius:18px}
  .hs-chip{padding:6px 11px 6px 9px;font-size:12px;gap:6px}
  .hs-chip svg{width:14px;height:14px}
  .hs-chip--a{left:-6px}.hs-chip--b{right:-6px}.hs-chip--c{bottom:-12px}
  .hs-card{padding:12px 14px;border-radius:18px}
  .hs-card-t{font-size:15px}
  .hs-card-s,.hs-card-n,.hs-fbtn .hs-fnote,.hs-legend{display:none}
  .hs-meters{margin-top:10px;gap:9px}
  .hs-meter-main b{margin-bottom:5px;font-size:13px}
  .hs-meter-row{gap:10px}
  .hs-meter-row .hs-ic{width:30px;height:30px;border-radius:9px}
  .hs-meter-row em{font-size:11px;padding:3px 8px}
  .hs-tab .hs-card-t{display:none}
  .hs-table{margin-top:0;border-spacing:0 5px;table-layout:fixed}
  .hs-table th:nth-child(1){width:44%}.hs-table th:nth-child(2){width:19%}.hs-table th:nth-child(3){width:17%}
  .hs-long{display:none}.hs-brief{display:inline}
  .hs-table th,.hs-table td{padding:0 6px}
  .hs-table thead th{font-size:9.5px}
  .hs-fr th,.hs-fr td{padding-top:6px;padding-bottom:6px;font-size:13px}
  .hs-fbtn b{font-size:13px}.hs-fbtn small{font-size:11px}
  .hs-lost-c{font-size:14px!important}
  .hs-vid{gap:8px}
  .hs-vid-tag{font-size:12.5px;padding:4px 12px 4px 6px}
  .hs-vid-tag .hs-play{width:24px;height:24px}.hs-vid-tag .hs-play::after{left:10px;top:6px;border-width:6px 0 6px 8px}
  .hs-vid-who{display:none}
  .hs-sound{height:40px;padding:0 16px;font-size:13.5px;bottom:10px}
  .hs-chip--d{bottom:2%}.hs-chip--e{top:0}
  .hs-flow{gap:8px}
  .hs-flow::before{left:32px;top:30px;bottom:30px}
  .hs-flow-i{padding:9px 12px;gap:12px;border-radius:16px;align-items:center}
  .hs-flow-i b{font-size:14px}
  .hs-flow-i small{display:none}
  .hs-steps5{gap:6px}
  .hs-s5{padding:7px 12px;gap:10px;border-radius:14px}
  .hs-num{width:28px;height:28px;font-size:13px}
  .hs-s5-t b{font-size:14px}
  .hs-s5-t small{display:none}
  .hs-who{font-size:11px;padding:3px 9px}
}
/* short phones: the calculator keeps only what it needs to fit */
@media (max-width:1023px) and (max-height:780px){
  .hs-calc .hs-cq-t small,.hs-res-row small{display:none}
  .hs-cq{padding:7px 0}
  .hs-res-row{padding:5px 0}
  .hs-res-row b{font-size:calc(17px * var(--fit,1))}
}
/* phones: every part stops above the progress bar; when one still does not
   fit, the picture gives up height (fitPart in story.ts); the WhatsApp button
   steps aside while the calculator shows, so it cannot cover the results. */
@media (max-width:1023px){
  .hs-part{bottom:22px}
  .hs-part[data-i="2"]{padding-top:8px}
  [data-testid=floating-whatsapp]{transition:opacity .2s ease,transform .2s ease}
  html.hs-on:has(.hs[data-part=cost]) [data-testid=floating-whatsapp]{opacity:0;transform:scale(.6);pointer-events:none}
}
`;var ht=[5,10,25,50,100,500],ut={min:100,max:5e3,step:50,start:1e3},mt={min:1,max:50},U=[{id:"small",name:"Small factory",note:"Many leads, low value",leads:3e3,lakh:5,conv:2},{id:"medium",name:"Medium factory",note:"Many leads, modest value",leads:2e3,lakh:10,conv:3},{id:"large",name:"Large factory",note:"Balanced",leads:1e3,lakh:50,conv:5},{id:"mega",name:"Mega factory",note:"Few leads, high value",leads:200,lakh:500,conv:10}],ft=s=>{let r=s.leads*s.lakh*1e5,i=r*s.conv/100;return{opportunity:r,won:i,lost:r-i}},v={id:"62asCfqRRbw",name:"Mr. Anuj Anand",role:"Export Head, Kesaria Rubber Industries Pvt. Ltd.",portrait:!1},gt="See all case studies",xt=[{title:"Find your VPV",who:"You",when:"A few minutes, online"},{title:"Confirm & pay online",who:"You",when:"A few minutes, online"},{title:"Book your shoot",who:"Us",when:"Within 2 working days of payment"},{title:"We shoot your plant",who:"Us",when:"1\u20135 hours on site"},{title:"Your VPV goes live",who:"Us",when:"Typically 1\u20133 weeks after the shoot"}];var j=3,Kt=ht,_e=s=>s>=100?`\u20B9${s/100}CR`:`\u20B9${s}L`,u=ut,bt=100,I=mt,Xt=1500,W=s=>{let r=i=>{let a=i>=1e3?0:2;return i.toLocaleString("en-IN",{minimumFractionDigits:a,maximumFractionDigits:a})};return s>=1e7?`\u20B9${r(s/1e7)} Crore`:`\u20B9${r(s/1e5)} Lakh`},vt=s=>s>=1e7?`\u20B9${(s/1e7).toLocaleString("en-IN",{maximumFractionDigits:1})} Cr`:`\u20B9${(s/1e5).toLocaleString("en-IN",{maximumFractionDigits:1})} L`,le='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',d={link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',device:'<rect x="2" y="4" width="14" height="10" rx="1.5"/><path d="M6 18h6"/><rect x="17" y="8" width="5" height="12" rx="1"/>',key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2c2 .7 3.5 2.6 3.5 5.8"/>',rupee:'<path d="M6 4h12M6 9h12M6 4c5 0 8 1.5 8 5s-3 5-8 5l9 6"/>',down:'<path d="M4 7l6 6 4-4 6 6"/><path d="M14 15h6v-6"/>',film:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3V9Z"/>',brochure:'<path d="M4 5a2 2 0 0 1 2-2h11l3 3v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z"/><path d="M8 9h8M8 13h8M8 17h5"/>',call:'<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>',camera:'<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/>',orbit:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',share:'<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',sound:'<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'},w=(s,r=20)=>`<svg viewBox="0 0 24 24" width="${r}" height="${r}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${s}</svg>`,g=(s,r=0)=>s.split(" ").map((i,a)=>`<span class="hs-w"><span style="--i:${r+a}">${i}</span></span>`).join(" "),O=[{id:"problem",label:"The problem"},{id:"trust",label:"Why"},{id:"cost",label:"The cost"},{id:"proof",label:"Proof"},{id:"solution",label:"VPV"},{id:"how",label:"How it works"},{id:"order",label:"Order now"}],wt=2,yt=3,Gt="Logos of manufacturers that use VPV: Kilitch Drugs, GRKC, Yum-Way, Binayak Hi Tech Engineering, Kesaria Rubber Industries, Nandan GSE, ViR, Saa Vishnu Group, Param, Miicron, JFL, Ecoste, de'Smat, Garima Global, Grace Auto and EASA Elevators",Jt=s=>{let{won:r,lost:i}=ft(s);return`<tr class="hs-fr hs-pop" style="--k:${U.indexOf(s)}" data-f="${s.id}">
    <th scope="row"><button type="button" class="hs-fbtn" data-f="${s.id}" aria-pressed="false" aria-label="${s.name}: load ${s.leads.toLocaleString("en-IN")} leads at ${_e(s.lakh)} each and ${s.conv}% conversion into the calculator"><b>${s.name}</b><small>${s.leads.toLocaleString("en-IN")} leads \xD7 ${_e(s.lakh)}</small><small class="hs-fnote">${s.note}</small></button></th>
    <td>${s.conv}%</td>
    <td class="hs-won-c">${vt(r)}</td>
    <td class="hs-lost-c">${vt(i)}</td>
  </tr>`},kt=!1;function cs(s){if(!kt){let e=document.createElement("style");e.id="hs-style",e.textContent=dt,document.head.appendChild(e),kt=!0}let r=matchMedia("(prefers-reduced-motion: reduce)").matches,i=document.createElement("section");i.className="hs",i.setAttribute("data-testid","home-story"),i.innerHTML=`
  <div class="hs-pin">
    ${["base","loss","sky","safe"].map(e=>`<div class="hs-glow hs-glow--${e}" aria-hidden="true"></div>`).join("")}
    <div class="hs-grid">
      <div class="hs-stage">
        <article class="hs-part" data-i="0" data-testid="home-story-hero">
          <p class="hs-eyebrow">Real Factories. Real Confidence.</p>
          <h1 class="hs-h1 hs-h1--hero" data-testid="landing-heading">${g("You meet hundreds of buyers at exhibitions and generate opportunities worth crores,")} <span class="hs-red">${g("yet",12)} <span class="hs-mark">${g("conversion is low.",13)}<svg class="hs-scribble" viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M3 12 C 60 5, 140 4, 297 9"/></svg></span></span></h1>
          <p class="hs-lede hs-in" style="--d:14">Meeting a buyer is just the beginning. <strong>You need to give them enough proof, confidence and reasons to choose you</strong>, even after the exhibition is over.</p>
          <p class="hs-cue hs-in" style="--d:16" aria-hidden="true"><span></span>Scroll</p>
        </article>

        <article class="hs-part" data-i="1">
          <p class="hs-eyebrow">Why?</p>
          <h2 class="hs-h2">${g("Lack of trust.")}</h2>
          <p class="hs-body hs-in" style="--d:4">Corporate videos, brochures and video calls don't build enough of the trust buyers need.</p>
          <p class="hs-body hs-body--em hs-in" style="--d:6"><strong>Buyers trust what they can see.</strong></p>
        </article>

        <article class="hs-part" data-i="2">
          <h2 class="hs-h2 hs-h2--calc">${g("How much is it costing you?")}</h2>
          <div class="hs-calc hs-in" style="--d:4">
            <div class="hs-cq">
              <div class="hs-cq-head"><label class="hs-cq-t" for="hs-leads">Total Qualified Leads in 5 Years</label><input id="hs-leads-num" class="hs-val hs-leads-in" type="text" inputmode="numeric" autocomplete="off" maxlength="7" value="0" aria-label="Total qualified leads in 5 years: type a number from ${u.min} to ${u.max}"></div>
              <input id="hs-leads" class="hs-range hs-range--leads" type="range" min="${u.min}" max="${u.max}" step="${u.step}" value="${u.start}">
              <p class="hs-ends"><span>${u.min.toLocaleString("en-IN")}</span><span>${u.max.toLocaleString("en-IN")}</span></p>
            </div>
            <div class="hs-cq">
              <p class="hs-cq-t" id="hs-value-t">Average Potential Business Per Lead Year</p>
              <div class="hs-chips" role="group" aria-labelledby="hs-value-t">${Kt.map(e=>`<button type="button" data-v="${e}" aria-pressed="${e===bt}">${_e(e)}</button>`).join("")}<button type="button" class="hs-chip-custom" aria-pressed="false" aria-expanded="false" aria-controls="hs-custom-box">Custom</button></div>
              <div class="hs-custom" id="hs-custom-box" hidden>
                <label class="hs-custom-field"><span aria-hidden="true">\u20B9</span><input id="hs-custom" type="text" inputmode="decimal" autocomplete="off" placeholder="Type an amount" aria-label="Your own business per lead, a year"></label>
                <select class="hs-custom-unit" aria-label="Unit"><option value="1">Lakh</option><option value="100" selected>Crore</option></select>
              </div>
            </div>
            <div class="hs-cq">
              <div class="hs-cq-head"><label class="hs-cq-t" for="hs-conv">Your current conversion ratio?<small>What % of leads turn into business?</small></label><output class="hs-val hs-conv-out" for="hs-conv">${j}%</output></div>
              <div class="hs-conv-row"><span>${I.min}%</span><input id="hs-conv" class="hs-range hs-range--conv" type="range" min="${I.min}" max="${I.max}" step="1" value="${j}"><span>${I.max}%</span></div>
            </div>
            <div class="hs-res" aria-live="polite">
              <div class="hs-res-row"><p>Business you win<small class="hs-won-sub">(at ${j}% conversion)</small></p><b class="hs-won">\u20B90</b></div>
              <div class="hs-res-row hs-loss"><p>Business going to competition<small class="hs-lost-sub">(remaining ${100-j}% leads)</small></p><b class="hs-loss-num">\u20B90</b></div>
            </div>
          </div>
        </article>

        <article class="hs-part" data-i="3">
          <p class="hs-eyebrow">Proof</p>
          <h2 class="hs-h2 hs-h2--proof">${g("These manufacturers have already solved this.")}</h2>
          <blockquote class="hs-quote hs-in" style="--d:5"><p>VPV became the bridge between us and our customers, and it builds our authority with every buyer.</p><footer>${v.name}, Kesaria Rubber Industries</footer></blockquote>
          <figure class="hs-logos hs-in" style="--d:7"><img src="/img/trusted-manufacturers.webp" width="1774" height="887" loading="lazy" decoding="async" alt="${Gt}" data-testid="home-story-logos"></figure>
          <div class="hs-ctas hs-in" style="--d:9">
            <a class="hs-btn" href="/case-studies" data-testid="home-story-case-study">${gt} ${le}</a>
          </div>
        </article>

        <article class="hs-part" data-i="4">
          <p class="hs-eyebrow">VPV \xB7 Virtual Plant Visit</p>
          <h2 class="hs-h2">${g("Show your factory only to buyers. Keep competitors out.")}</h2>
          <p class="hs-body hs-in" style="--d:5">Your virtual factory tour, which your competition will not be able to see.</p>
          <ul class="hs-locks">
            ${[[d.link,"One-time view links"],[d.timer,"Control link expiry time"],[d.device,"Limit device access"],[d.key,"Password protected link"]].map(([e,t],n)=>`<li class="hs-lock hs-in" style="--d:${6+n}"><span class="hs-ic">${w(e,18)}</span><span><b>${t}</b></span><i class="hs-switch" style="--k:${n}"></i></li>`).join("")}
          </ul>
        </article>

        <article class="hs-part" data-i="5">
          <p class="hs-eyebrow">How it works</p>
          <h2 class="hs-h2 hs-h2--how"><span class="hs-sent">${g("We shoot it.")}</span> <span class="hs-sent">${g("You share it.",3)}</span> <span class="hs-sent">${g("Buyers walk through it.",6)}</span></h2>
          <p class="hs-body hs-in" style="--d:5">One link opens your whole factory, on any screen, with no travel on either side.</p>
          <div class="hs-ctas hs-in" style="--d:7">
            <a class="hs-link hs-link--keep" href="/how-it-works" data-testid="home-story-how">See it in detail ${le}</a>
            <a class="hs-link hs-link--keep" href="/demo" data-testid="home-story-demo-link">Try the live demo ${le}</a>
          </div>
        </article>

        <article class="hs-part" data-i="6">
          <p class="hs-eyebrow">Order now</p>
          <h2 class="hs-h2">${g("Order now in just 5 simple steps.")}</h2>
          <p class="hs-body hs-in" style="--d:5">You do the first two, online. We do the rest.</p>
          <div class="hs-ctas hs-in" style="--d:7">
            <a class="hs-btn" href="/plans" data-testid="home-story-cta">Find the Right VPV for Your Factory ${le}</a>
          </div>
        </article>
      </div>

      <div class="hs-visual" data-testid="home-story-visual">
        <div class="hs-vis" data-v="0">
          <figure class="hs-photo">
            <img src="/img/home-expo-tablet.webp" srcset="/img/home-expo-tablet-sm.webp 640w, /img/home-expo-tablet.webp 970w" sizes="(max-width:1023px) 90vw, 520px" width="970" height="578" decoding="async" fetchpriority="high" alt="Two buyers at an exhibition looking at a factory tour on a tablet">
            <span class="hs-chip hs-chip--blue hs-pop hs-chip--a" style="--k:0">${w(d.users,16)}Hundreds of buyers met</span>
            <span class="hs-chip hs-chip--green hs-pop hs-chip--b" style="--k:1">${w(d.rupee,16)}Opportunities worth crores</span>
            <span class="hs-chip hs-chip--red hs-pop hs-chip--c" style="--k:2">${w(d.down,16)}Conversion is low</span>
          </figure>
        </div>

        <div class="hs-vis" data-v="1">
          <div class="hs-card hs-trust">
            <p class="hs-card-t">Trust built with the buyer</p>
            <ul class="hs-meters">
              ${[[d.film,"Corporate video",".3"],[d.brochure,"Brochures",".2"],[d.call,"Video calls",".42"]].map(([e,t,n],o)=>`<li class="hs-meter-row hs-pop" style="--k:${o};--f:${n}"><span class="hs-ic">${w(e,20)}</span><span class="hs-meter-main"><b>${t}</b><i class="hs-meter"><u></u></i></span><em>Not enough</em></li>`).join("")}
            </ul>
            <p class="hs-legend"><span class="hs-dash" aria-hidden="true"></span>Trust a buyer needs before placing an order</p>
          </div>
        </div>

        <div class="hs-vis" data-v="2">
          <div class="hs-card hs-tab">
            <p class="hs-card-t">Four factories, one formula</p>
            <p class="hs-card-s">Illustrative examples, worked out like the calculator. Tap a row to load it.</p>
            <table class="hs-table" aria-label="Four example factories and what they lose to competition over five years">
              <thead><tr><th scope="col">Factory</th><th scope="col">Converts</th><th scope="col">You win</th><th scope="col"><span class="hs-long">Lost to competition</span><span class="hs-brief">Lost</span></th></tr></thead>
              <tbody>${U.map(Jt).join("")}</tbody>
            </table>
            <p class="hs-card-n">Leads are over 5 years. Lost = the leads that did not convert, at the same business per lead.</p>
          </div>
        </div>

        <div class="hs-vis hs-vis--video" data-v="3">
          <div class="hs-vid">
            <p class="hs-vid-tag"><span class="hs-play" aria-hidden="true"></span>80%+ conversion with VPV</p>
            <div class="hs-vid-frame${v.portrait?" is-portrait":""}">
              <iframe title="${v.name}, ${v.role}: his story with VPV" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
              <button type="button" class="hs-vguard" aria-label="Click to use the video controls"></button>
              <button type="button" class="hs-sound" aria-label="Turn on sound">${w(d.sound,20)}<span>Tap for sound</span></button>
            </div>
            <p class="hs-vid-who"><b>${v.name}</b><span>${v.role}</span></p>
          </div>
        </div>

        <div class="hs-vis" data-v="4">
          <div class="hs-sol">
            <img src="/img/home-buyer-tablet.webp" srcset="/img/home-buyer-tablet-sm.webp 640w, /img/home-buyer-tablet.webp 1066w" sizes="(max-width:1023px) 90vw, 540px" width="1066" height="705" loading="lazy" decoding="async" alt="A buyer looking at a VPV factory tour on a tablet, with information icons over the shop floor">
            <span class="hs-chip hs-chip--green hs-pop hs-chip--d" style="--k:0">${w(d.check,16)}Buyer: link opened</span>
            <span class="hs-chip hs-chip--red hs-pop hs-chip--e" style="--k:1">${w(d.lock,16)}Competitor: access blocked</span>
          </div>
        </div>

        <div class="hs-vis" data-v="5">
          <ol class="hs-flow">
            ${[[d.camera,"We shoot your plant in 360\xB0","Our crew comes to you. Production keeps running."],[d.orbit,"We build your VPV","Areas joined, information icons, your videos and your brand. Live at yourcompany.myvpv.com."],[d.share,"You share one link","Buyers walk through your plant on their own screen. You decide who gets in."]].map(([e,t,n],o)=>`<li class="hs-flow-i hs-pop" style="--k:${o}"><span class="hs-ic hs-ic--grad">${w(e,22)}</span><span><b>${t}</b><small>${n}</small></span></li>`).join("")}
          </ol>
        </div>

        <div class="hs-vis" data-v="6">
          <ol class="hs-steps5">
            ${xt.map((e,t)=>`<li class="hs-s5 hs-pop" style="--k:${t}"><span class="hs-num">${t+1}</span><span class="hs-s5-t"><b>${e.title}</b><small>${e.when}</small></span><em class="hs-who hs-who--${e.who==="You"?"you":"us"}">${e.who==="You"?"You":"We do it"}</em></li>`).join("")}
          </ol>
        </div>
      </div>
    </div>
    <div class="hs-steps" aria-hidden="true">${O.map(()=>"<i></i>").join("")}</div>
  </div>`,s.appendChild(i);let a=e=>i.querySelector(e),h=Array.from(i.querySelectorAll(".hs-part")),T=Array.from(i.querySelectorAll(".hs-vis")),pe=Array.from(i.querySelectorAll(".hs-steps i")),Ae=a(".hs-pin"),K=a(".hs-visual"),_=a(".hs-range--leads"),X=a(".hs-range--conv"),f=a(".hs-leads-in"),Et=a(".hs-conv-out"),ce=a(".hs-loss-num"),A=a(".hs-loss"),$e=a(".hs-won"),Lt=a(".hs-won-sub"),St=a(".hs-lost-sub"),Ce=Array.from(i.querySelectorAll(".hs-chips button[data-v]")),de=a(".hs-chip-custom"),Ie=a(".hs-custom"),he=a("#hs-custom"),Oe=a(".hs-custom-unit"),R={},G=document.visibilityState==="visible"?performance.now():0,ue=-1,J=0,me=0,Z=0,fe=0,Mt=0,zt=900,Tt=()=>{let e=i.getBoundingClientRect();return e.bottom>80&&e.top<innerHeight-80},ge=()=>{let e=performance.now();if(ue>=0&&G&&Tt()){let t=O[ue].id;R[t]=Math.min(zt,(R[t]||0)+(e-G)/1e3)}G=document.visibilityState==="visible"?e:0},_t=e=>{ge();let t={},n=0;for(let o of O){let l=Math.round(R[o.id]||0);l>0&&(t[o.id]=l,n+=l)}if(!(!n&&!J&&!Z)){t.deepest=me,t.moves=J,t.touches=Z,t.custom=fe,t.total=n;for(let o of Object.keys(R))delete R[o];J=0,Z=0,fe=0,D("story_dwell",t,{beacon:e,path:"/"})}},p={leads:u.start,valueLakh:bt,conv:j},x=!1,At=()=>({leads:Math.max(1,Math.round(p.leads/5)),valueLakh:Math.min(1e4,Math.max(.1,p.valueLakh)),conv:p.conv,lift:5}),y="leads",H=0,Q=0,xe=0,ee=0,be=!1,$t=e=>{if(cancelAnimationFrame(Q),r){H=e,ce.textContent=W(e);return}let t=H,n=performance.now(),o=l=>{let m=Math.min(1,(l-n)/700),z=1-Math.pow(1-m,3);H=t+(e-t)*z,ce.textContent=W(H),m<1&&(Q=requestAnimationFrame(o))};Q=requestAnimationFrame(o)},Re=(e,t)=>e.style.setProperty("--fit",t.length>15?".7":t.length>13?".85":"1"),He=(e,t,n,o)=>e.style.setProperty("--p",`${(t-n)/(o-n)*100}%`),te=()=>{let e=p.leads*p.valueLakh*1e5,t=e*p.conv/100,n=e-t;document.activeElement!==f&&(f.value=p.leads.toLocaleString("en-IN")),Et.textContent=`${p.conv}%`,He(_,p.leads,u.min,u.max),He(X,p.conv,I.min,I.max),$e.textContent=W(t),Re($e,W(t)),Re(ce,W(n)),Lt.textContent=`(at ${p.conv}% conversion)`,St.textContent=`(remaining ${100-p.conv}% leads)`,$t(n),n>xe+1&&xe>0&&!r&&(A.classList.remove("hs-hit"),A.offsetWidth,A.classList.add("hs-hit")),xe=n,Ce.forEach(o=>o.setAttribute("aria-pressed",String(!x&&Number(o.dataset.v)===p.valueLakh))),de.setAttribute("aria-pressed",String(x)),de.setAttribute("aria-expanded",String(x)),Ie.hidden===x&&(Ie.hidden=!x,N()),Ot()},Pe=(e=!1)=>{clearTimeout(ee),be&&(be=!1,D("calculator_used",lt(At(),{field:y,saves:++Mt}),{beacon:e,path:"/"}))},S=()=>{be=!0,Z++,clearTimeout(ee),ee=window.setTimeout(()=>Pe(),Xt),te()};_.addEventListener("input",()=>{p.leads=Number(_.value),y="leads",S()});let Ct=()=>parseInt(f.value.replace(/\D/g,""),10);f.addEventListener("focus",()=>f.select()),f.addEventListener("input",()=>{let e=f.value.replace(/\D/g,"");e!==f.value&&(f.value=e);let t=parseInt(e,10);t>=u.min&&t<=u.max&&(p.leads=t,_.value=String(t),y="leads",S())});let It=()=>{let e=Ct(),t=Number.isFinite(e)?Math.min(u.max,Math.max(u.min,e)):p.leads;t!==p.leads&&(p.leads=t,_.value=String(t),y="leads",S()),f.value=t.toLocaleString("en-IN")};f.addEventListener("blur",It),f.addEventListener("keydown",e=>{e.key==="Enter"&&(e.preventDefault(),f.blur())}),X.addEventListener("input",()=>{p.conv=Number(X.value),y="conv",S()}),Ce.forEach(e=>e.addEventListener("click",()=>{x=!1,p.valueLakh=Number(e.dataset.v),y="valueLakh",S()}));let ve=()=>{let e=parseFloat(he.value.replace(/[^0-9.]/g,""));e>0&&(p.valueLakh=e*Number(Oe.value),y="valueLakh",S())};de.addEventListener("click",()=>{x=!0,fe++,te(),he.focus(),ve()}),he.addEventListener("input",ve),Oe.addEventListener("change",ve);let se=()=>{Pe(!0),_t(!0)},Ne=()=>{document.visibilityState==="hidden"?se():G=performance.now()};addEventListener("pagehide",se),document.addEventListener("visibilitychange",Ne);let Ye=Array.from(i.querySelectorAll(".hs-fbtn")),Ot=()=>{Ye.forEach(e=>{let t=U.find(o=>o.id===e.dataset.f),n=!x&&t.leads===p.leads&&t.lakh===p.valueLakh&&t.conv===p.conv;e.setAttribute("aria-pressed",String(n)),e.closest("tr")?.classList.toggle("is-picked",n)})};Ye.forEach(e=>e.addEventListener("click",()=>{let t=U.find(n=>n.id===e.dataset.f);x=!1,p.leads=t.leads,p.valueLakh=t.lakh,p.conv=t.conv,_.value=String(t.leads),X.value=String(t.conv),y="leads",S(),r||(A.classList.remove("hs-hit"),A.offsetWidth,A.classList.add("hs-hit"))}));let $=a(".hs-vid-frame"),we=a(".hs-vid-frame iframe"),Rt=a(".hs-sound"),ye=!1,Fe=0,Ve=(e,t=0)=>`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&mute=${e?1:0}&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}${t>0?`&start=${t}`:""}`,ke=e=>{try{we.contentWindow?.postMessage(JSON.stringify({event:"command",func:e,args:""}),"*")}catch{}},Ht=()=>{ye||(ye=!0,Fe=performance.now(),we.src=Ve(!0))};a(".hs-vguard").addEventListener("click",()=>$.classList.add("is-open")),$.addEventListener("mouseleave",()=>$.classList.remove("is-open"));let qe=e=>{$.contains(e.target)||$.classList.remove("is-open")};document.addEventListener("touchstart",qe,{passive:!0}),Rt.addEventListener("click",()=>{$.classList.add("is-sound"),we.src=Ve(!1,Math.max(0,Math.floor((performance.now()-Fe)/1e3))),D("video_play",{id:v.id,sound:!0,label:"home_story_proof",path:"/"})});let b=O.length;i.style.setProperty("--hs-parts",String(b));let P=()=>{let e=document.getElementById("vpv-site-header");return e?e.getBoundingClientRect().height:0},Be=()=>Math.max(1,i.offsetHeight-(innerHeight-P())),De=()=>Math.min(1,Math.max(0,(P()-i.getBoundingClientRect().top)/Be())),ne=e=>Math.round(i.getBoundingClientRect().top+scrollY-P()+e/(b-1)*Be()),oe=()=>{let e=i.getBoundingClientRect();return e.top<=P()+2&&e.bottom>=innerHeight-2},c=-1,Ue=new Set,je=e=>{if(e===c)return;ge(),c>=0&&J++,ue=e,e+1>me&&(me=e+1);let t=e>c?"down":"up",n=o=>o.forEach((l,m)=>{l.classList.toggle("is-active",m===e),l.classList.toggle("is-past",m<e),l.setAttribute("aria-hidden",String(m!==e)),l.inert=m!==e});n(h),n(T),i.dataset.dir=t,i.dataset.part=O[e].id,pe.forEach((o,l)=>o.classList.toggle("on",l<=e)),e===wt&&c!==wt&&(H=0,te()),e===yt?ye?ke("playVideo"):Ht():c===yt&&ke("pauseVideo"),Ue.has(e)||(Ue.add(e),D("section_view",{section:`home-${O[e].id}`,path:"/"})),c=e},We=matchMedia("(max-width: 1023px)"),Ke=e=>{let t=Array.from(e.children).filter(Yt=>getComputedStyle(Yt).display!=="none"),n=t[0],o=t[t.length-1];if(!n||!o)return{need:0,room:1,by:0};let l=getComputedStyle(e),m=getComputedStyle(n),z=getComputedStyle(o),L=o.offsetTop+o.offsetHeight+parseFloat(z.marginBottom)-(n.offsetTop-parseFloat(m.marginTop)),B=e.clientHeight-parseFloat(l.paddingTop)-parseFloat(l.paddingBottom)-6;return{need:L,room:B,by:L-B}},N=()=>{if(!s.isConnected)return;h.forEach(t=>t.style.removeProperty("zoom")),K.style.removeProperty("height");let e=Math.max(...h.map(t=>Ke(t).by));if(e>0&&We.matches){let t=K.offsetHeight,n=Math.round(Ae.clientHeight*.25);t>n&&(K.style.height=`${Math.max(n,t-e-2)}px`)}h.forEach(t=>{let n=Ke(t);n.by>0&&t.style.setProperty("zoom",String(Math.max(.72,Math.floor(n.room/n.need*100)/100)))}),T.forEach(t=>{let n=t.firstElementChild;if(!n||(n.style.removeProperty("zoom"),!We.matches))return;let o=K.clientHeight-6,l=n.offsetHeight;l>o&&o>0&&n.style.setProperty("zoom",String(Math.max(.55,Math.floor(o/l*100)/100)))})},M=!1,ie=0,Ee=0,k=-1,Xe=e=>scrollTo({top:e,behavior:"instant"}),Le=(e,t,n)=>{cancelAnimationFrame(ie);let o=scrollY,l=e-o;if(r||Math.abs(l)<2){Xe(e),M=!1,k=-1;return}M=!0;let m=performance.now(),z=L=>{let B=Math.min(1,(L-m)/t);Xe(o+l*n(B)),B<1?ie=requestAnimationFrame(z):(M=!1,k=-1)};ie=requestAnimationFrame(z)},Pt=e=>1-Math.pow(1-e,3),Ge=e=>1-Math.pow(1-e,4),Se=e=>{e<0||e>=b||(k=e,je(e),Le(ne(e),480,Pt))},Je=0,Ze=-1e9,C=!0,Y=0,F=!1,ae=0,Me=!1,V=1/0,Qe=e=>{if(e.ctrlKey||!oe()||Math.abs(e.deltaY)<Math.abs(e.deltaX))return;let t=e.timeStamp,n=t-Je;Je=t;let o=e.deltaMode===1?e.deltaY*33:e.deltaMode===2?e.deltaY*innerHeight:e.deltaY,l=Math.abs(o);n>160?(C=!0,Y=0,F=!1):C||(Me?l<V?V=l:l>8&&l>V*1.8+2&&t-Ze>200&&(C=!0,Y=0):l>ae?ae=l:l<ae*.6&&(Me=!0,V=l));let m=Math.sign(o);if(!m)return;let L=(k>=0?k:c)+m;if(L<0||L>=b){C&&!M&&Math.abs(scrollY-ne(c))<4&&(F=!0),F||e.preventDefault();return}F||(e.preventDefault(),C&&(Y+=o,Math.abs(Y)>=4&&(C=!1,Ze=t,Y=0,ae=l,Me=!1,V=1/0,Se(L))))},et=0,tt=0,E="",ze=!1,re=!1,st=e=>{ze=!0,E="",re=!1,et=e.touches[0].clientY,tt=e.touches[0].clientX,(!oe()||e.target.closest?.(".hs-calc"))&&(E="native")},nt=e=>{if(E==="native")return;let t=et-e.touches[0].clientY,n=tt-e.touches[0].clientX;if(!E){if(Math.abs(t)<6&&Math.abs(n)<6)return;let o=c+Math.sign(t);E=Math.abs(n)>Math.abs(t)||o<0||o>=b?"native":"story"}E==="story"&&(e.preventDefault(),!re&&Math.abs(t)>28&&(re=!0,Se(c+Math.sign(t))))},ot=()=>{ze=!1,E==="story"&&!re&&!M&&Le(ne(c),260,Ge),E=""},it=e=>{if(!oe()||e.altKey||e.ctrlKey||e.metaKey)return;let t=e.target;if(t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(t.tagName)))return;let n=["ArrowDown","PageDown"].includes(e.key)||e.key===" "&&!e.shiftKey?1:["ArrowUp","PageUp"].includes(e.key)||e.key===" "&&e.shiftKey?-1:0,o=(k>=0?k:c)+n;!n||o<0||o>=b||(e.preventDefault(),Se(o))},Nt=()=>{if(M||ze||F||!oe())return;let e=Math.round(De()*(b-1)),t=ne(e);Math.abs(scrollY-t)>3&&Le(t,320,Ge)},q=()=>{if(ge(),Ae.style.setProperty("--hs-top",P()+"px"),M&&k>=0)return;let e=De()*(b-1),t=c<0?Math.round(e):e>c?e-c>.33?Math.ceil(e-.33):c:c-e>.33?Math.floor(e+.33):c;je(Math.min(b-1,Math.max(0,t))),clearTimeout(Ee),Ee=window.setTimeout(Nt,140)};addEventListener("scroll",q,{passive:!0}),addEventListener("resize",q),addEventListener("resize",N),addEventListener("wheel",Qe,{passive:!1}),addEventListener("touchstart",st,{passive:!0}),addEventListener("touchmove",nt,{passive:!1}),addEventListener("touchend",ot,{passive:!0}),addEventListener("keydown",it),te(),q(),N(),document.fonts?.ready.then(N);let at=new MutationObserver(()=>{s.isConnected||rt()});at.observe(document.body,{childList:!0,subtree:!0});function rt(){se(),at.disconnect(),cancelAnimationFrame(Q),cancelAnimationFrame(ie),clearTimeout(ee),clearTimeout(Ee),removeEventListener("scroll",q),removeEventListener("resize",q),removeEventListener("resize",N),removeEventListener("pagehide",se),removeEventListener("wheel",Qe),removeEventListener("touchstart",st),removeEventListener("touchmove",nt),removeEventListener("touchend",ot),removeEventListener("keydown",it),document.removeEventListener("touchstart",qe),document.removeEventListener("visibilitychange",Ne),ke("pauseVideo")}return rt}export{cs as mount};
