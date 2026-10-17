/**
 * The payment bridge injected into the marketing site's shell.
 *
 * The marketing site (the single-page app in /public/static) ships its
 * own "Proceed to Pay" button. That button is already correct about two
 * things and we must NOT lose them:
 *
 *   • it is DISABLED until every required field is valid — company,
 *     contact, a 10-digit mobile, a valid e-mail and the city/state are
 *     all present, with GSTIN optional and format-checked; and
 *   • it stays disabled until the Terms & Conditions / Refund Policy box
 *     is ticked.
 *
 * What the site's own button CANNOT do is take money: its build has no
 * back end, so its click runs a fake "test mode" handler and shows a
 * "coming soon" notice. This script leaves the button — and therefore
 * all of that validation — exactly where it is, and instead intercepts
 * its click to run the REAL Razorpay flow against our server.
 *
 * It is a faithful, dependency-free port of components/billing/
 * useRazorpayPayment.ts, hitting the same two endpoints that the 328
 * billing tests cover:
 *
 *     POST /api/billing/order     → opens the order, returns the key +
 *                                   razorpay order id + amount. The price
 *                                   is the SERVER's; the browser only
 *                                   names a plan.
 *     POST /api/billing/confirm   → verifies the signature and builds the
 *                                   workspace. GET /api/billing/status is
 *                                   polled while that finishes.
 *
 * Nothing here decides an amount, so a tampered page can change what it
 * shows itself, never what it is charged. The worst a client bug can do
 * is a clumsy message; the money guarantees are all server-side.
 *
 * The interception is a single capture-phase listener on `document`,
 * keyed to the button's own `data-testid`. Capture at the document is
 * the earliest point in event dispatch, so it pre-empts the site's React
 * handler (stopImmediatePropagation), and listening on `document` rather
 * than the node itself means a React re-render of the button cannot drop
 * it. If the button is missing or disabled the listener simply never
 * fires, and the site behaves as it did before.
 */

/** Canonical Indian states — mirrors lib/indianStates.ts. The server
 *  needs an exact state to split the GST, and the site only collects a
 *  free-text "city, state" line, so we parse one out of it here. */
const STATES_JSON = JSON.stringify([
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand",
  "Karnataka", "Kerala", "Ladakh", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Lakshadweep", "Other / outside India",
]);

export const PAY_BRIDGE_SCRIPT = String.raw`(function(){
  var KEY="myvpv:phase1:v1";
  var RZP="https://checkout.razorpay.com/v1/checkout.js";
  var STATES=` + STATES_JSON + String.raw`;
  var busy=false, paid=false;

  function store(){try{return JSON.parse(localStorage.getItem(KEY)||"null")||{}}catch(e){return{}}}
  function val(id){var el=document.getElementById("checkout-"+id)||document.querySelector('[data-testid="checkout-'+id+'-input"]')||document.getElementById(id);return el&&typeof el.value==="string"?el.value.trim():"";}
  function agreedNow(){var cb=document.querySelector('[data-testid="terms-checkbox"]');if(cb)return!!cb.checked;var s=store();return!!(s.checkout&&s.checkout.agreed===true);}
  function emailOk(e){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e||"");}
  function phoneOk(m){var d=(m||"").replace(/\D/g,"");if(d.length===12&&d.indexOf("91")===0)d=d.slice(2);if(d.length===11&&d.charAt(0)==="0")d=d.slice(1);return d.length===10;}
  function canonState(text){if(!text)return null;var t=String(text).trim(),i;
    for(i=0;i<STATES.length;i++)if(STATES[i].toLowerCase()===t.toLowerCase())return STATES[i];
    var parts=t.split(",");for(var j=0;j<parts.length;j++){var p=parts[j].trim();for(i=0;i<STATES.length;i++)if(STATES[i].toLowerCase()===p.toLowerCase())return STATES[i];}
    return null;}

  function jpost(url,body,cb){fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify(body)}).then(function(r){r.json().then(function(d){cb(r.status,d||{})}).catch(function(){cb(r.status,{})})}).catch(function(){cb(0,{})});}
  function jget(url,cb){fetch(url,{method:"GET",cache:"no-store"}).then(function(r){r.json().then(function(d){cb(r.status,d||{})}).catch(function(){cb(r.status,{})})}).catch(function(){cb(0,{})});}

  /* ── overlay ── */
  function card(){var o=document.getElementById("vpv-pay-ovl");if(o)return o;
    o=document.createElement("div");o.id="vpv-pay-ovl";
    o.setAttribute("style","position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;background:rgba(10,16,30,.55);padding:20px;font-family:inherit");
    o.innerHTML='<div id="vpv-pay-card" style="max-width:440px;width:100%;background:#fff;border-radius:18px;padding:30px 26px;box-shadow:0 30px 80px -20px rgba(0,0,0,.5);text-align:center;color:#0c1017"></div><style>@keyframes vpvspin{to{transform:rotate(360deg)}}</style>';
    o.addEventListener("click",function(e){if(e.target===o&&!busy)o.style.display="none"});
    document.body.appendChild(o);return o;}
  function show(h){var o=card();o.style.display="flex";document.getElementById("vpv-pay-card").innerHTML=h;}
  function hide(){var o=document.getElementById("vpv-pay-ovl");if(o)o.style.display="none";}
  function spin(msg){show('<div style="margin:0 auto 16px;width:36px;height:36px;border:3px solid #dbe4f3;border-top-color:#0b5cff;border-radius:50%;animation:vpvspin .9s linear infinite"></div><p style="font-size:15px;margin:0;color:#334155">'+msg+'</p>');}
  function closeBtn(){return '<button type="button" onclick="var o=document.getElementById(\'vpv-pay-ovl\');if(o)o.style.display=\'none\'" style="border:0;border-radius:9999px;background:#0b5cff;color:#fff;font-weight:600;font-size:14px;padding:10px 24px;cursor:pointer;margin-top:4px">Close</button>';}
  function errCard(msg){busy=false;show('<p style="font-size:17px;font-weight:600;margin:0 0 8px">We could not continue</p><p style="font-size:14px;color:#475569;margin:0 0 18px;line-height:1.55">'+msg+'</p>'+closeBtn());}
  function waitCard(){busy=false;show('<div style="margin:0 auto 14px;width:52px;height:52px;border-radius:50%;background:#fef3c7;display:flex;align-items:center;justify-content:center;font-size:24px">⏱</div><p style="font-size:18px;font-weight:600;margin:0 0 8px">Payment received</p><p style="font-size:14px;color:#475569;margin:0 0 18px;line-height:1.55">Your payment is safe and we are finishing your set-up. We will e-mail your sign-in details shortly. <strong>Please do not pay again.</strong></p>'+closeBtn());}
  function okCard(slug,inv){busy=false;var link=slug?("https://"+slug+".myvpv.com"):null;
    show('<div style="margin:0 auto 14px;width:54px;height:54px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;font-size:26px;color:#16a34a">✓</div><p style="font-size:20px;font-weight:600;margin:0 0 8px">Your workspace is ready</p><p style="font-size:14px;color:#475569;margin:0 0 20px;line-height:1.55">We have e-mailed your sign-in details'+(inv?(" and invoice "+inv):"")+'. Check your spam folder if it is not there in a few minutes.</p>'+(link?('<a href="'+link+'" style="display:inline-block;border-radius:9999px;background:#0b5cff;color:#fff;font-weight:600;font-size:14px;padding:12px 26px;text-decoration:none">Open '+slug+'.myvpv.com</a>'):closeBtn()));}

  function loadRzp(cb){if(window.Razorpay)return cb(true);
    var ex=document.querySelector('script[src="'+RZP+'"]');
    if(ex){ex.addEventListener("load",function(){cb(!!window.Razorpay)},{once:true});ex.addEventListener("error",function(){cb(false)},{once:true});setTimeout(function(){cb(!!window.Razorpay)},4000);return;}
    var s=document.createElement("script");s.src=RZP;s.async=true;s.onload=function(){cb(!!window.Razorpay)};s.onerror=function(){cb(false)};document.body.appendChild(s);}

  /* ── wait for the server to finish building the workspace ── */
  function poll(orderId,n){if(n>50){waitCard();return;}
    jget("/api/billing/status?orderId="+encodeURIComponent(orderId),function(st,d){
      if(d&&d.ok){var s=d.status;
        if(s==="ready"){okCard(d.slug,d.invoiceNo);return;}
        if(s==="review"){waitCard();return;}
        if(s==="refunded"){errCard("This payment was refunded. The money is on its way back to your original payment method.");return;}
        if(s==="failed"||s==="unknown"){errCard("The payment did not complete. If your bank shows a debit it is refunded automatically — you never pay for something you do not get.");return;}
      }
      setTimeout(function(){poll(orderId,n+1)},Math.min(5000,1800+n*250));
    });}

  function confirmPay(orderId,resp){spin("Confirming your payment… please keep this page open and do not pay again.");
    jpost("/api/billing/confirm",{orderId:orderId,razorpay_order_id:resp.razorpay_order_id,razorpay_payment_id:resp.razorpay_payment_id,razorpay_signature:resp.razorpay_signature},function(st,d){
      if(st===200&&d&&d.ok&&d.status==="ready"){okCard(d.slug,d.invoiceNo);return;}
      poll(orderId,0);
    });}

  function msgFor(st,d){
    if(d&&d.message)return d.message;
    if(d&&d.error==="state_required")return "Please include your state in the City / State field, for example “Gurgaon, Haryana”. It decides the GST on your invoice.";
    if(d&&d.error==="account_exists")return "An account with this e-mail already exists. Please sign in to buy, add scenes or renew.";
    if(d&&(d.error==="prices_not_final"||d.error==="payments_unavailable"))return "Online payment is not switched on yet. Please write to billing@myvpv.com and we will take your order directly.";
    if(d&&d.error==="bad_gstin")return "That GSTIN does not look right. Please check it, or leave it blank if you do not have one.";
    if(st===429)return "Too many attempts. Please wait a few minutes and try again.";
    if(st>=500)return "We could not start the payment just now. No money has been taken — please try again in a moment.";
    return "We could not start the payment. Please check your details and try again.";
  }

  function pay(){
    if(busy)return;
    var s=store(),a=s.assessment||{};
    var plan=a.selectedPlanId,travel=a.travel;
    if(!plan||!travel){errCard("Please choose a plan and tell us where your factory is before paying.");return;}

    var company=val("companyName"),name=val("contactName"),mobile=val("mobile"),email=val("email"),cityState=val("cityState"),gstin=val("gstin").toUpperCase();
    var miss=[];
    if(!company)miss.push("company name");
    if(!name)miss.push("contact name");
    if(!phoneOk(mobile))miss.push("a valid 10-digit mobile number");
    if(!emailOk(email))miss.push("a valid e-mail");
    if(!cityState)miss.push("city and state");
    if(miss.length){errCard("Please fill in "+miss.join(", ")+". Only GSTIN is optional.");return;}
    if(!agreedNow()){errCard("Please tick the box to accept the Terms & Conditions and the Refund Policy before paying.");return;}

    var state=canonState(cityState);
    if(!state&&!gstin){errCard("Please include your state in the City / State field, for example “Gurgaon, Haryana”. It decides the GST on your invoice.");return;}

    busy=true;paid=false;spin("Opening secure payment…");
    var buyer={name:name,email:email,phone:mobile,company:company,gstin:gstin,address:cityState,state:state||""};
    jpost("/api/billing/order",{purpose:"site_plan",sitePlanId:plan,travel:travel,buyer:buyer},function(st,d){
      if(st!==200||!d||!d.ok){
        if(d&&d.error==="already_paid"&&d.orderId){spin("This order is already paid — finishing your set-up…");poll(d.orderId,0);return;}
        if(d&&d.error==="payment_in_progress"){waitCard();return;}
        errCard(msgFor(st,d));return;
      }
      loadRzp(function(ok){
        if(!ok||!window.Razorpay){errCard("The payment window could not load. Disable any ad-blocker for this page, or write to billing@myvpv.com and we will send a payment link.");return;}
        var rzp=new window.Razorpay({
          key:d.keyId, order_id:d.razorpayOrderId, amount:d.amountPaise, currency:"INR",
          name:"VPV — Virtual Plant Visit", description:d.description,
          prefill:{name:name,email:email,contact:mobile}, theme:{color:"#0b5cff"},
          timeout:900, retry:{enabled:true,max_count:3},
          modal:{confirm_close:true, ondismiss:function(){
            if(paid)return;
            jget("/api/billing/status?orderId="+encodeURIComponent(d.orderId),function(stt,sd){
              if(sd&&sd.ok&&(sd.status==="processing"||sd.status==="ready")){paid=true;spin("Finishing your set-up…");poll(d.orderId,0);}
              else{hide();busy=false;}
            });
          }},
          handler:function(resp){paid=true;confirmPay(d.orderId,resp);}
        });
        rzp.on("payment.failed",function(){/* window stays open so they can try another method */});
        hide(); /* let Razorpay's own modal take the screen */
        rzp.open();
      });
    });
  }

  /* The "coming soon" / test-mode notice is no longer true: hide it. */
  function hideNotice(){try{var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null),n;
    while(n=w.nextNode()){if((n.nodeValue||"").trim().indexOf("TEST MODE")===0&&n.parentElement){var e=n.parentElement;e.style.display="none";for(var i=0;i<2;i++){var p=e.parentElement;if(!p||p===document.body)break;if((p.innerText||"").trim()!=="")break;p.style.display="none";e=p}return}}}catch(e){}}

  /* Intercept the site's own, validated Pay button. Capture phase on the
     document pre-empts the site's React handler and survives re-renders. */
  document.addEventListener("click",function(e){
    var t=e.target;var b=t&&t.closest?t.closest('[data-testid="pay-btn"]'):null;
    if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();
    pay();
  },true);

  if(document.readyState!=="loading")hideNotice();else document.addEventListener("DOMContentLoaded",hideNotice);
  try{var mo=new MutationObserver(function(){hideNotice()});mo.observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
})();`;
