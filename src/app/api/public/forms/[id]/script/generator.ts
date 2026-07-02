// =============================================
// Popup runtime script generator
//
// Builds the JavaScript string served by GET /api/public/forms/[id]/script.
// Extracted from the route handler so the generated script can be unit
// tested without touching Supabase (see __tests__/script-gen.test.ts).
//
// The exported helper functions below are PURE and are inlined into the
// emitted script via Function.prototype.toString() — they run both on the
// server (tests) and in the merchant's storefront (runtime). They MUST stay
// fully self-contained (no references to other module-scope bindings), and
// written in browser-safe ES2017.
// =============================================

/** HTML-escape a merchant-provided string for text/attribute interpolation. */
export function escHtml(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Style-value sanitizer (R7): strips characters that could break out of an
 * inline style attribute or declaration (; " ' < > { } \) and caps length.
 * Falls back to `d` when the prop is missing or sanitizes to nothing.
 */
export function sv(x: unknown, d?: unknown): string {
  var fallback = d == null ? '' : String(d)
  if (x == null || x === '') return fallback
  var s = String(x).replace(/[;"'<>{}\\]/g, '').slice(0, 120)
  return s === '' ? fallback : s
}

/** URL whitelist for navigation targets: http(s) absolute or site-relative. */
export function safeUrl(u: unknown): string {
  var s = String(u == null ? '' : u).trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  if (s.charAt(0) === '/' && s.charAt(1) !== '/') return s
  return ''
}

/** URL whitelist for images: http(s), protocol-relative, root-relative, data:image. */
export function safeImgUrl(u: unknown): string {
  var s = String(u == null ? '' : u).trim()
  if (!s) return ''
  if (/^(https?:\/\/|\/\/|data:image\/)/i.test(s)) return s
  if (s.charAt(0) === '/') return s
  return ''
}

/**
 * legal-consent sanitizer (R7): escape EVERYTHING, then re-emit only <a>
 * tags whose href passes the scheme whitelist (http/https/mailto). Anchor
 * inner text is escaped; all other markup is neutralized.
 */
export function legalConsentHtml(raw: unknown, linkColor: unknown): string {
  var esc = function (s: unknown) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }
  var color =
    String(linkColor == null || linkColor === '' ? '#F97316' : linkColor)
      .replace(/[;"'<>{}\\]/g, '')
      .slice(0, 120) || '#F97316'
  var text = String(raw == null ? '' : raw)
  var re = /<a\s+([^>]*)>([\s\S]*?)<\/a>/gi
  var out = ''
  var last = 0
  var m
  while ((m = re.exec(text))) {
    out += esc(text.slice(last, m.index))
    var attrs = m[1] || ''
    var inner = m[2] || ''
    var hrefM = attrs.match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
    var href = (hrefM ? hrefM[1] || hrefM[2] || hrefM[3] || '' : '').trim()
    if (/^(https?:|mailto:)/i.test(href)) {
      out +=
        '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer" style="color:' +
        color + ';text-decoration:underline">' + esc(inner) + '</a>'
    } else {
      out += esc(inner)
    }
    last = re.lastIndex
  }
  out += esc(text.slice(last))
  return out
}

/**
 * R4: tracker.js writes _worder_vid as a JSON envelope {"v":"<uuid>","e":ts};
 * _worder_canonical may be raw or an envelope. Parse either shape.
 */
export function parseVisitorEnvelope(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  var s = String(raw).trim()
  if (s.charAt(0) === '{') {
    try {
      var j = JSON.parse(s)
      if (j && j.v) return String(j.v)
    } catch (e) { /* fall through */ }
    return null
  }
  return s
}

/**
 * Contract: phone is sent as the FULL value with country code prepended
 * (e.g. "+5531999999999"). Values already carrying "+" are kept as-is.
 */
export function normalizePhoneValue(v: unknown, cc: unknown): string {
  var raw = String(v == null ? '' : v).trim()
  if (!raw) return raw
  var digits = raw.replace(/[^0-9+]/g, '')
  if (digits.charAt(0) === '+') return digits
  var code = String(cc == null ? '' : cc).replace(/[^0-9]/g, '')
  if (!code) return digits
  return '+' + code + digits.replace(/^0+/, '')
}

export interface PopupFormRecord {
  id: string
  name?: string | null
  success_message?: string | null
  design_json?: any
  behavior?: any
}

export function buildPopupScript(form: PopupFormRecord, baseUrl: string): string {
  const design = form.design_json || {}
  const beh = form.behavior || design.behavior || {}

  // Inline the pure helpers. Bound via `var <name>=(<fn>)` so internal
  // (possibly minified) function names never matter.
  const helpers = [
    'var esc=' + escHtml.toString() + ';',
    'var sv=' + sv.toString() + ';',
    'var safeUrl=' + safeUrl.toString() + ';',
    'var safeImg=' + safeImgUrl.toString() + ';',
    'var legalHtml=' + legalConsentHtml.toString() + ';',
    'var parseVEnv=' + parseVisitorEnvelope.toString() + ';',
    'var normPhone=' + normalizePhoneValue.toString() + ';',
  ].join('\n')

  return `(function(){
"use strict";
var FID=${JSON.stringify(String(form.id))},BU=${JSON.stringify(baseUrl)},D=${JSON.stringify(design)},B=${JSON.stringify(beh)};
// Guard against double injection (Theme App Embed + ScriptTag loader).
if(window["__wf_ran_"+FID])return;
window["__wf_ran_"+FID]=true;
var shown=false,ck="_wf_"+FID;
var submitted=false;// R3: suppression cookie must not be clobbered by close() after subscribe
var dismissSent=false;// R6: at most one dismissal beacon per pageview
var _cleanupSize=null;
var DBG=(function(){try{
  var u=new URL(location.href);
  var on=u.searchParams.get("wf_debug")==="1"||sessionStorage.getItem("__wf_debug")==="1";
  if(u.searchParams.get("wf_debug")==="1")sessionStorage.setItem("__wf_debug","1");
  if(u.searchParams.get("wf_debug")==="0")sessionStorage.removeItem("__wf_debug");
  return on;
}catch(e){return false}})();
function dlog(){if(!DBG)return;try{
  var args=["[WorderPopup]","["+FID.slice(0,8)+"]"].concat(Array.prototype.slice.call(arguments));
  console.log.apply(console,args);
}catch(e){}}
function blockedBy(reason){dlog("BLOCKED:",reason);}
dlog("script start",{ design: !!D, behavior: B });
function gc(n){var m=document.cookie.match("(^|;)\\\\s*"+n+"=([^;]*)");return m?m[2]:null}
function sc(n,v,d){var e=new Date();e.setDate(e.getDate()+d);document.cookie=n+"="+v+";path=/;expires="+e.toUTCString()+";SameSite=Lax"}
// Safari ITP mirror (S7): cookies set via document.cookie are capped at 7
// days by ITP. Mirror gate cookies in localStorage with an explicit expiry
// timestamp; reads accept whichever store still has the flag.
function lsSet(n,v,d){try{localStorage.setItem("_wfls_"+n,JSON.stringify({v:v,e:Date.now()+d*86400000}))}catch(e){}}
function lsGet(n){try{var r=localStorage.getItem("_wfls_"+n);if(!r)return null;var j=JSON.parse(r);if(j&&j.e&&Date.now()<j.e)return j.v;localStorage.removeItem("_wfls_"+n);return null}catch(e){return null}}
function gcx(n){return gc(n)||lsGet(n)}
function scx(n,v,d){sc(n,v,d);lsSet(n,v,d)}
${helpers}
function nv(x,d){var n=parseFloat(x);return isFinite(n)?n:d}
function bid(x){return String(x==null?"":x).replace(/[^a-zA-Z0-9_-]/g,"")}
function looksUuid(s){return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(s||""))}
// R4: robust visitor identity — tracker.js JSON envelope, canonical id,
// theme-embed cookie. (The Shopify pixel's storage is sandboxed/unreachable.)
function getVisitorId(){
  try{
    var c=parseVEnv(localStorage.getItem("_worder_canonical"));
    if(c)return c;
    var r=localStorage.getItem("_worder_vid");
    if(r){
      if(r.charAt(0)==="{"){var p=parseVEnv(r);if(p)return p}
      else if(looksUuid(r))return r;
    }
  }catch(e){}
  var k=gc("__worder_id");
  if(k){try{return decodeURIComponent(k)}catch(e){return k}}
  return null;
}
function getSessionId(){try{return sessionStorage.getItem("_worder_sid")||sessionStorage.getItem("__worder_sid")||null}catch(e){return null}}
function cornerPx(c,r){return c==="none"?0:c==="small"?4:c==="medium"?8:c==="large"?16:c==="custom"?nv(r,0):8}
function inputStyleStr(p){
  var r=cornerPx(p.corners||"medium",p.cornerRadius||8);
  var und=p.inputStyle==="underline";
  var bw=nv(p.borderWidth,1);
  var bs=sv(p.borderStyle,"solid");
  var bc=sv(p.borderColor,"#E5E7EB");
  var bg=und?"transparent":sv(p.backgroundColor,"#FFFFFF");
  var fam=p.fontFamily&&p.fontFamily!=="inherit"?sv(p.fontFamily,"inherit"):"inherit";
  var s="width:100%;box-sizing:border-box;outline:none;";
  s+="padding:"+nv(p.inputPadTop,12)+"px "+nv(p.inputPadRight,16)+"px "+nv(p.inputPadBottom,12)+"px "+nv(p.inputPadLeft,16)+"px;";
  s+="background:"+bg+";color:"+sv(p.textColor,"#111827")+";";
  s+="font-family:"+fam+";font-size:"+nv(p.fontSize,14)+"px;";
  s+="font-weight:"+(p.bold?"700":nv(p.inputFontWeight,400))+";font-style:"+(p.italic?"italic":"normal")+";text-decoration:"+(p.underline?"underline":"none")+";";
  s+="text-align:"+sv(p.textAlign,"left")+";";
  if(und){s+="border:none;border-bottom:"+bw+"px "+bs+" "+bc+";border-radius:0;"}
  else{s+="border:"+bw+"px "+bs+" "+bc+";border-radius:"+r+"px;"}
  return s;
}
// Generic per-block Layout-tab wrapper (R10): Fill/Stroke/Effects/Layout
// props the editor previews (page.tsx BlockPreview blockStyle) now render
// in the storefront too.
function blockStyleStr(p,noBorder,noShadow){
  var s="margin:"+nv(p.marginTop,0)+"px 0 "+nv(p.marginBottom,8)+"px;";
  if(p.blockPadding!=null&&nv(p.blockPadding,0)>0)s+="padding:"+nv(p.blockPadding,0)+"px;";
  if(p.blockBg)s+="background:"+sv(p.blockBg,"")+";";
  if(p.blockRadius!=null&&nv(p.blockRadius,0)>0)s+="border-radius:"+nv(p.blockRadius,0)+"px;";
  if(!noBorder&&p.borderWidth&&nv(p.borderWidth,0)>0)s+="border:"+nv(p.borderWidth,1)+"px "+sv(p.borderStyle,"solid")+" "+sv(p.borderColor,"#E5E7EB")+";";
  if(!noShadow&&p.shadow)s+="box-shadow:"+sv(p.shadow,"")+";";
  if(p.opacity!=null&&nv(p.opacity,100)<100)s+="opacity:"+(nv(p.opacity,100)/100)+";";
  return s;
}
function wrapStyleStr(p){
  var a=p.align||"full";
  var jc=a==="center"?"center":(a==="right"?"flex-end":"flex-start");
  var s="display:flex;justify-content:"+jc+";width:100%;";
  s+="padding:"+nv(p.paddingTop,0)+"px "+nv(p.paddingRight,0)+"px "+nv(p.paddingBottom,8)+"px "+nv(p.paddingLeft,0)+"px;";
  s+="margin:"+nv(p.marginTop,0)+"px 0 "+nv(p.marginBottom,0)+"px;";
  if(p.blockBg)s+="background:"+sv(p.blockBg,"")+";";
  if(p.blockRadius!=null&&nv(p.blockRadius,0)>0)s+="border-radius:"+nv(p.blockRadius,0)+"px;";
  if(p.shadow)s+="box-shadow:"+sv(p.shadow,"")+";";
  if(p.opacity!=null&&nv(p.opacity,100)<100)s+="opacity:"+(nv(p.opacity,100)/100)+";";
  return s;
}
function innerWrapStyleStr(p){
  var a=p.align||"full";
  return "width:"+(a==="full"?"100%":"auto")+";max-width:"+(a==="full"?"100%":"80%")+";";
}
function labelStyleStr(p){
  return "display:block;font-size:13px;font-weight:500;color:"+sv(p.labelColor,"#374151")+";margin-bottom:4px;text-align:"+sv(p.textAlign,"left")+";";
}
// Per-block validation-message attributes (R9): requiredMsg/errorMsg/errorColor
// travel on the element so the shared validator can surface them.
function vaStr(p){
  var s="";
  if(p.requiredMsg)s+=' data-wfreqmsg="'+esc(p.requiredMsg)+'"';
  if(p.errorMsg)s+=' data-wferrmsg="'+esc(p.errorMsg)+'"';
  if(p.errorColor)s+=' data-wferrcolor="'+esc(p.errorColor)+'"';
  return s;
}
var freq=B.frequency||{};
// R3: single source of truth for the suppression window (gate log, submit
// and close previously used 30 / 30-365 / 1 respectively).
var SHOW_AFTER_DAYS=nv(freq.showAfterDays,30)||30;
var vis=B.visibility||{};
// R10: device class evaluated at CALL time, not script-load time.
function mob(){return window.innerWidth<768}
// Device gate
if(vis.devices==="desktop"&&mob()){blockedBy("device:desktop-only on mobile");return}
if(vis.devices==="mobile"&&!mob()){blockedBy("device:mobile-only on desktop");return}
// Fast subscriber gate — _wf_sub is set on any submit in this browser.
if(!DBG&&vis.hideFromSubscribers&&gcx("_wf_sub")){blockedBy("hideFromSubscribers + _wf_sub flag present");return}
// Visitor type gate (R8): read the PRE-EXISTING value once per pageview and
// share it across all form scripts via window.__wf_seen_prev, so the first
// script's cookie write doesn't turn the visitor "returning" for the second.
var firstSeenCk="_wf_seen";
if(window.__wf_seen_prev===undefined)window.__wf_seen_prev=gcx(firstSeenCk)||"";
var isReturning=!!window.__wf_seen_prev;
scx(firstSeenCk,"1",365);
if(vis.visitorType==="new"&&isReturning){blockedBy("visitorType=new but visitor is returning");return}
if(vis.visitorType==="returning"&&!isReturning){blockedBy("visitorType=returning but visitor is new");return}
var useCustomTrigger=!!B.customTrigger;
var formType=D.formType||"popup";
var isEmbed=formType==="embed";
// Frequency gate (skipped for custom trigger and for embeds — S10: embedded
// forms are page content, never frequency-suppressed).
if(!DBG&&!isEmbed&&gcx(ck)&&!useCustomTrigger){blockedBy("frequency flag "+ck+" present — wait "+SHOW_AFTER_DAYS+" days or open ?wf_debug=1");return}
// URL include/exclude (wildcard: *)
function matchUrl(pattern,url){
  if(!pattern)return false;
  var re=new RegExp("^"+pattern.replace(/[-\\/\\\\^$+?.()|[\\]{}]/g,"\\\\$&").replace(/\\*/g,".*")+"$");
  return re.test(url);
}
var pagePath=location.pathname;
var urls=B.urls||{};
if(urls.includeEnabled&&urls.includeUrls&&urls.includeUrls.length>0){
  if(!urls.includeUrls.some(function(p){return matchUrl(p,pagePath)||pagePath.indexOf(p)>=0})){blockedBy("url include filter — current path "+pagePath+" not in "+JSON.stringify(urls.includeUrls));return}
}
if(urls.excludeEnabled&&urls.excludeUrls&&urls.excludeUrls.length>0){
  if(urls.excludeUrls.some(function(p){return matchUrl(p,pagePath)||pagePath.indexOf(p)>=0})){blockedBy("url exclude filter — current path "+pagePath+" matched");return}
}
// Legacy targeting.pageUrls still supported for old popups
var tgt=B.targeting||{};
if(tgt.pages==="specific"&&tgt.pageUrls&&tgt.pageUrls.length>0){
  if(!tgt.pageUrls.some(function(p){return pagePath.indexOf(p)>=0}))return;
}
// Location gate (async best-effort via ipapi — fails open)
var locCfg=B.location||{};
function runLocationGate(cb){
  var needs=(locCfg.includeEnabled&&locCfg.includeCountries&&locCfg.includeCountries.length>0)||
            (locCfg.excludeEnabled&&locCfg.excludeCountries&&locCfg.excludeCountries.length>0);
  if(!needs){cb(true);return}
  var cached=localStorage.getItem("_wf_country");
  function check(cc){
    cc=(cc||"").toUpperCase();
    if(locCfg.includeEnabled&&locCfg.includeCountries.length>0&&locCfg.includeCountries.indexOf(cc)<0){cb(false);return}
    if(locCfg.excludeEnabled&&locCfg.excludeCountries.length>0&&locCfg.excludeCountries.indexOf(cc)>=0){cb(false);return}
    cb(true);
  }
  if(cached){check(cached);return}
  fetch("https://ipapi.co/json/").then(function(r){return r.json()}).then(function(j){
    var cc=j&&j.country_code||"";
    if(cc)localStorage.setItem("_wf_country",cc);
    check(cc);
  }).catch(function(){cb(true)});
}
// UTM parameter gate
var utmCfg=B.utm||{};
function getUtms(){
  var qs=new URLSearchParams(location.search);
  var out={};
  ["utm_source","utm_medium","utm_campaign","utm_term","utm_content"].forEach(function(k){
    var v=qs.get(k);
    if(v){out[k]=v;localStorage.setItem("_wf_"+k,v)}
    else{var stored=localStorage.getItem("_wf_"+k);if(stored)out[k]=stored}
  });
  return out;
}
var currentUtms=getUtms();
if(utmCfg.filterEnabled&&utmCfg.filters&&utmCfg.filters.length>0){
  var utmOk=utmCfg.filters.every(function(f){
    if(!f.param||!f.value)return true;
    return(currentUtms[f.param]||"").toLowerCase().indexOf(f.value.toLowerCase())>=0;
  });
  if(!utmOk)return;
}
// Page view count (R8): bump ONCE per pageview globally — N popups on the
// page used to inflate the counter by N.
function incPv(){
  var n=parseInt(sessionStorage.getItem("_wf_pv")||"0",10);
  if(!window.__wf_pv_bumped){
    window.__wf_pv_bumped=true;
    n=n+1;
    try{sessionStorage.setItem("_wf_pv",String(n))}catch(e){}
  }
  return n;
}
var pvCount=incPv();
// Scheduling window
var sched=B.scheduling||{};
if(sched.enabled){
  var now=Date.now();
  if(sched.startDate&&now<new Date(sched.startDate).getTime())return;
  if(sched.endDate&&now>new Date(sched.endDate).getTime())return;
}
var st=D.styles||{};
var steps=D.steps||[];
var successStep=D.successStep||{blocks:[{id:"s1",type:"text",props:{content:"Obrigado!",fontSize:24,color:"#111827",fontWeight:"bold",align:"center",tag:"h2"}},{id:"s2",type:"text",props:{content:"Sua inscrição foi confirmada.",fontSize:15,color:"#6B7280",align:"center",tag:"p"}}]};
var hasSuccessBlocks=!!(D.successStep&&D.successStep.blocks&&D.successStep.blocks.length);
var successMsg=D.successMessage||${JSON.stringify(String(form.success_message || ''))};
var postSubmit=D.postSubmit||{action:"show-success",redirectUrl:"",closeDelay:4};
var curStep=0;
var allData={};
// Progressive profiling — known-fields contract is now per-field BOOLEANS
// ({fields:{email:true,...}}) used only for HIDING already-known fields.
// Prefill-by-email is discontinued.
var _knownFields={};
var _ppEnabled=!!(B.progressiveProfiling&&B.progressiveProfiling.enabled);
var _ppHide=_ppEnabled&&B.progressiveProfiling.hideKnownFields!==false;
function loadKnownFields(cb){
  if(!_ppEnabled){cb();return}
  var em=gc("__worder_id_email")||"";
  var vid=getVisitorId()||"";
  if(!em&&!vid){cb();return}
  var u=BU+"/api/public/forms/"+FID+"/known-fields?";
  if(em){var dem=em;try{dem=decodeURIComponent(em)}catch(e){}u+="email="+encodeURIComponent(dem)}
  if(vid)u+=(em?"&":"")+"visitor_id="+encodeURIComponent(vid);
  fetch(u).then(function(r){return r.json()}).then(function(j){
    _knownFields=(j&&j.fields)||{};
    dlog("Progressive profiling: known fields",_knownFields);
    cb();
  }).catch(function(){cb()});
}
function isInputBlock(t){return t==="email"||t==="phone"||t==="name-input"||t==="text-input"||t==="date-input"||t==="dropdown"}
function visibleBlocks(bs){
  var m=mob();
  return (bs||[]).filter(function(b){
    var pp=b.props||{};
    if(m&&pp.hideOnMobile){dlog("hide block "+b.type+"#"+b.id+" (hideOnMobile)");return false;}
    if(!m&&pp.hideOnDesktop){dlog("hide block "+b.type+"#"+b.id+" (hideOnDesktop)");return false;}
    if(_ppHide&&isInputBlock(b.type)){
      var mapTo=pp.mapTo||(b.type==="email"?"email":b.type==="phone"?"phone":b.type==="name-input"?"first_name":"");
      if(mapTo&&_knownFields[mapTo]){
        dlog("progressive: hiding "+b.type+" ("+mapTo+" already known)");
        return false;
      }
    }
    return true;
  });
}
function renderBlock(b){
  var p=b.props||{},h="";
  switch(b.type){
    case"text":{
      var tag=({h1:1,h2:1,h3:1,h4:1,h5:1,h6:1,p:1,div:1,span:1})[p.tag]?p.tag:"p";
      var ts=blockStyleStr(p);
      ts+="font-size:"+nv(p.fontSize,16)+"px;color:"+sv(p.color,"#111827")+";font-weight:"+sv(p.fontWeight,"normal")+";font-style:"+sv(p.fontStyle,"normal")+";text-decoration:"+sv(p.textDecoration,"none")+";text-align:"+sv(p.align,"left")+";line-height:"+nv(p.lineHeight,1.4)+";font-family:"+sv(p.fontFamily,"inherit")+";";
      if(p.letterSpacing!=null)ts+="letter-spacing:"+nv(p.letterSpacing,0)+"px;";
      if(p.blockPadTop!=null||p.blockPadRight!=null||p.blockPadBottom!=null||p.blockPadLeft!=null)ts+="padding:"+nv(p.blockPadTop,0)+"px "+nv(p.blockPadRight,0)+"px "+nv(p.blockPadBottom,0)+"px "+nv(p.blockPadLeft,0)+"px;";
      h='<'+tag+' style="'+ts+'">'+esc(p.content||"")+'</'+tag+'>';
      break;
    }
    case"image":{
      var src=safeImg(p.src);
      if(!src){h="";break}
      var ist="width:"+(p.imgWidth?nv(p.imgWidth,100)+"%":sv(p.width,"100%"))+";max-height:"+nv(p.maxHeight,300)+"px;object-fit:"+sv(p.objectFit,"contain")+";border-radius:"+nv(p.borderRadius,0)+"px;display:inline-block;";
      if(p.shadow)ist+="box-shadow:"+sv(p.shadow,"")+";";
      var imgTag='<img src="'+esc(src)+'" alt="'+esc(p.alt||"")+'" style="'+ist+'" />';
      var hu=safeUrl(p.href);
      if(hu)imgTag='<a href="'+esc(hu)+'" target="_blank" rel="noopener noreferrer" style="display:inline-block">'+imgTag+'</a>';
      h='<div style="'+blockStyleStr(p,false,true)+'text-align:'+sv(p.align,"center")+';padding:'+nv(p.padding,0)+'px">'+imgTag+'</div>';
      break;
    }
    case"email":case"phone":case"name-input":case"text-input":case"date-input":{
      var nm=p.mapTo==="custom"?("custom:"+(p.mapToCustom||p.label||"field")):(p.mapTo||(b.type==="email"?"email":b.type==="phone"?"phone":b.type==="name-input"?"first_name":"field"));
      var itype=b.type==="email"?"email":b.type==="phone"?"tel":b.type==="date-input"?"date":"text";
      var req=(p.required||b.type==="email")?' required':'';
      var phc=sv(p.placeholderColor,"#9CA3AF");
      var iid="wi_"+bid(b.id);
      var lbl=(p.showLabel&&p.label)?'<label for="'+iid+'" style="'+labelStyleStr(p)+'">'+esc(p.label)+'</label>':'';
      var ccAttr=(b.type==="phone"&&p.countryCode)?' data-cc="'+esc(p.countryCode)+'"':'';
      var inputHtml='<input id="'+iid+'" name="'+esc(nm)+'" type="'+itype+'" placeholder="'+esc(p.placeholder||"")+'"'+req+vaStr(p)+ccAttr+' style="'+inputStyleStr(p)+'" />';
      var customCss='<style>#'+iid+'::placeholder{color:'+phc+';opacity:1}</style>';
      if(b.type==="phone"&&p.countryCode){
        var cc=esc(p.countryCode||"+55");
        var ccStyle="display:flex;align-items:center;padding:0 12px;border:"+nv(p.borderWidth,1)+"px "+sv(p.borderStyle,"solid")+" "+sv(p.borderColor,"#E5E7EB")+";border-radius:"+cornerPx(p.corners||"medium",p.cornerRadius||8)+"px;font-size:"+nv(p.fontSize,14)+"px;color:"+sv(p.textColor,"#111827")+";background:"+sv(p.backgroundColor,"#F9FAFB")+";white-space:nowrap;font-family:"+sv(p.fontFamily,"inherit")+";";
        inputHtml='<div style="display:flex;gap:8px;width:100%;"><span style="'+ccStyle+'">'+cc+'</span>'+inputHtml+'</div>';
      }
      h=customCss+'<div style="'+wrapStyleStr(p)+'"><div style="'+innerWrapStyleStr(p)+'">'+lbl+inputHtml+'</div></div>';
      break;
    }
    case"dropdown":{
      var ddName=p.mapTo==="custom"?("custom:"+(p.mapToCustom||p.label||"select")):(p.mapTo||p.label||"select");
      var ff=sv(st.fontFamily,"inherit");
      var opts=(p.options||[]).map(function(o){return'<option value="'+esc(o)+'">'+esc(o)+'</option>'}).join("");
      var ddLabel=(p.showLabel!==false&&p.label)?'<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:4px;font-family:'+ff+'">'+esc(p.label)+'</label>':"";
      // R9: no hardcoded PT placeholder — empty option label when absent.
      h='<div style="'+blockStyleStr(p,true)+'">'+ddLabel+'<select name="'+esc(ddName)+'"'+(p.required?' required':'')+vaStr(p)+' style="width:100%;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;background:#fff;box-sizing:border-box;font-family:'+ff+'"><option value="">'+esc(p.placeholder||"")+'</option>'+opts+'</select></div>';
      break;
    }
    case"radio":{
      var rName=p.mapTo==="custom"?("custom:"+(p.mapToCustom||p.label||"radio")):(p.mapTo||p.label||"radio");
      var rff=sv(st.fontFamily,"inherit");
      var rLabel=(p.showLabel!==false&&p.label)?'<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;font-family:'+rff+'">'+esc(p.label)+'</label>':"";
      var ri=(p.options||[]).map(function(o){return'<label style="display:'+(p.layout==="horizontal"?"inline-flex":"flex")+';align-items:center;gap:8px;margin:0 12px 8px 0;font-size:14px;cursor:pointer;font-family:'+rff+'"><input type="radio" name="'+esc(rName)+'" value="'+esc(o)+'"'+(p.required?" required":"")+' style="margin:0;accent-color:#F97316" />'+esc(o)+'</label>'}).join("");
      // R9: required radio group — container marker consumed by validateStep.
      h='<div style="'+blockStyleStr(p,true)+'">'+rLabel+'<div'+(p.required?' data-wfreq="1"'+vaStr(p):'')+'>'+ri+'</div></div>';
      break;
    }
    case"checkbox":{
      var cbName=p.mapTo==="custom"?("custom:"+(p.mapToCustom||p.label||"check")):(p.mapTo||p.label||"check");
      var cbff=sv(st.fontFamily,"inherit");
      var cbLabel=(p.showLabel!==false&&p.label)?'<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;font-family:'+cbff+'">'+esc(p.label)+'</label>':"";
      var ci=(p.options||[]).map(function(o){return'<label style="display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:14px;cursor:pointer;font-family:'+cbff+'"><input type="checkbox" name="'+esc(cbName)+'" value="'+esc(o)+'" style="margin:0;accent-color:#F97316" />'+esc(o)+'</label>'}).join("");
      // R9: required checkbox group = at least one checked of that name.
      h='<div style="'+blockStyleStr(p,true)+'">'+cbLabel+'<div'+(p.required?' data-wfreq="1"'+vaStr(p):'')+'>'+ci+'</div></div>';
      break;
    }
    case"legal-consent":{
      // R7: escape everything, re-allow only whitelisted-scheme anchors.
      h='<div style="'+blockStyleStr(p,true)+'"><label style="display:flex;align-items:flex-start;gap:8px;font-size:'+nv(p.fontSize,12)+'px;color:'+sv(p.color,"#6B7280")+';cursor:pointer;line-height:'+nv(p.lineHeight,1.4)+'"><input type="checkbox" name="consent"'+(p.required?" required":"")+vaStr(p)+' style="margin-top:2px;flex-shrink:0" /><span>'+legalHtml(p.text||"",p.linkColor)+'</span></label></div>';
      break;
    }
    case"button":{
      var act=p.action||"submit";
      var btnBorder=p.btnBorderWidth?"border:"+nv(p.btnBorderWidth,1)+"px "+sv(p.btnBorderStyle,"solid")+" "+sv(p.btnBorderColor,"#E5E7EB"):"border:none";
      var btnId="wb_"+bid(b.id);
      var hoverCss=p.hoverColor?'<style>#'+btnId+':hover{background:'+sv(p.hoverColor,"")+'!important}</style>':"";
      var btnFam=sv(p.fontFamily||st.fontFamily,"inherit");
      var btnLs=p.btnLetterSpacing!=null?(nv(p.btnLetterSpacing,0)+"px"):"normal";
      var btnFw=sv(p.btnFontWeight,"700");
      // R7: data-url only when the URL passes the scheme whitelist.
      var bu2=act==="url"?safeUrl(p.url):"";
      var btn='<button id="'+btnId+'" type="'+(act==="submit"?"submit":"button")+'" data-action="'+esc(act)+'"'+(bu2?' data-url="'+esc(bu2)+'"':"")+' style="box-sizing:border-box!important;width:'+(p.fullWidth?"100%":"auto")+'!important;padding:'+nv(p.paddingV,14)+'px '+nv(p.paddingH,28)+'px!important;background:'+sv(p.bgColor,"#F97316")+'!important;color:'+sv(p.textColor,"#fff")+'!important;font-size:'+nv(p.fontSize,15)+'px!important;font-weight:'+btnFw+'!important;font-family:'+btnFam+'!important;letter-spacing:'+btnLs+'!important;line-height:1.2!important;text-align:center!important;text-transform:none!important;border-radius:'+nv(p.borderRadius,8)+'px!important;'+btnBorder+'!important;cursor:pointer!important;margin:0!important;display:'+(p.fullWidth?"block":"inline-block")+'!important;transition:background 0.2s">'+esc(p.text||"OK")+'</button>';
      // R10: honor p.align via wrapper when not fullWidth (editor default center).
      h='<div style="'+blockStyleStr(p)+(p.fullWidth?"":"text-align:"+sv(p.align,"center")+";")+'">'+hoverCss+btn+'</div>';
      break;
    }
    case"spacer":h='<div style="'+blockStyleStr(p)+'height:'+nv(p.height,24)+'px"></div>';break;
    case"line":h='<div style="'+blockStyleStr(p)+'"><hr style="border:none;border-top:'+nv(p.thickness,1)+'px '+sv(p.style,"solid")+' '+sv(p.color,"#E5E7EB")+';margin:0 auto;width:'+Math.min(Math.max(nv(p.width!=null?p.width:p.widthPct,100),1),100)+'%" /></div>';break;
    case"coupon":{
      var couponCode=p.code||"CODIGO";
      if(p.mode==="dynamic"&&window.__wfDynCoupon&&window.__wfDynCoupon[FID]){
        couponCode=window.__wfDynCoupon[FID];
      }
      h='<div style="'+blockStyleStr(p,true)+'padding:12px 16px;border:2px '+sv(p.borderStyle,"dashed")+' '+sv(p.borderColor,"#F97316")+';border-radius:'+nv(p.borderRadius,8)+'px;text-align:center;background:'+sv(p.bgColor,"#FFF7ED")+'"><p style="font-size:11px;color:#6B7280;margin:0 0 4px">'+esc(p.description||"")+'</p><p style="font-size:'+nv(p.fontSize,20)+'px;font-weight:bold;color:'+sv(p.codeColor,"#F97316")+';letter-spacing:2px;margin:0;cursor:pointer" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.textContent)">'+esc(couponCode)+'</p></div>';
      break;
    }
    case"countdown":{
      var cdId="wcd_"+bid(b.id);
      var lbls=p.labels||{days:"DIAS",hours:"HORAS",minutes:"MIN",seconds:"SEG"};
      var fs=nv(p.fontSize,28);
      var nc=sv(p.numberColor,"#FFFFFF");
      var lc=sv(p.labelColor,"#9CA3AF");
      var bc2=sv(p.boxColor,"#1F2937");
      function cdCell(id,lbl){return'<span style="display:flex;flex-direction:column;align-items:center"><span id="'+id+'" style="font-size:'+fs+'px;font-weight:800;color:'+nc+';line-height:1">00</span><span style="font-size:9px;color:'+lc+';margin-top:4px;letter-spacing:1px">'+esc(lbl)+'</span></span>'}
      var sep='<span style="color:'+lc+';font-size:20px;font-weight:700;padding:0 4px">:</span>';
      h='<div style="'+blockStyleStr(p,true)+'text-align:center;padding:16px;background:'+bc2+';border-radius:8px"><div style="display:inline-flex;align-items:center;gap:4px">'+cdCell(cdId+"_d",lbls.days)+sep+cdCell(cdId+"_h",lbls.hours)+sep+cdCell(cdId+"_m",lbls.minutes)+sep+cdCell(cdId+"_s",lbls.seconds)+'</div></div>';
      var endDate=p.endDate;
      if(endDate){
        setTimeout(function(){
          var end=new Date(endDate).getTime();
          function tick(){
            var now=Date.now();var diff=Math.max(0,end-now);
            var d=Math.floor(diff/86400000);var hh=Math.floor((diff%86400000)/3600000);var mm=Math.floor((diff%3600000)/60000);var ss=Math.floor((diff%60000)/1000);
            var ed=document.getElementById(cdId+"_d");if(ed)ed.textContent=String(d).padStart(2,"0");
            var eh=document.getElementById(cdId+"_h");if(eh)eh.textContent=String(hh).padStart(2,"0");
            var em=document.getElementById(cdId+"_m");if(em)em.textContent=String(mm).padStart(2,"0");
            var es=document.getElementById(cdId+"_s");if(es)es.textContent=String(ss).padStart(2,"0");
            if(diff>0)setTimeout(tick,1000);
          }
          tick();
        },100);
      }
      break;
    }
  }
  return h;
}
function renderStep(stepIdx){
  var step=stepIdx<0?successStep:(steps[stepIdx]||{blocks:[]});
  // R10: success fallback — short design.successMessage when the merchant
  // configured no success-step blocks.
  if(stepIdx<0&&!hasSuccessBlocks&&successMsg){
    return '<p style="font-size:16px;color:#111827;text-align:center;margin:0">'+esc(successMsg)+'</p>';
  }
  return visibleBlocks(step.blocks||[]).map(renderBlock).join("");
}
// R6: dismissal beacon — impressions KEEP flowing through submit
// {_track:'impression'}; this only reports user-initiated dismissals.
function sendDismiss(){
  if(dismissSent)return;
  dismissSent=true;
  var body={type:"dismissed"};
  var vid=getVisitorId();
  if(vid)body.visitor_id=vid;
  var payload=JSON.stringify(body);
  var url=BU+"/api/public/forms/"+FID+"/events";
  try{
    if(navigator.sendBeacon&&navigator.sendBeacon(url,new Blob([payload],{type:"application/json"})))return;
  }catch(e){}
  try{
    fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:payload,keepalive:true}).catch(function(){});
  }catch(e){}
}
// R1: merchant-configurable error copy → server 400 error string → neutral
// English fallback (never PT-BR to international visitors).
function submitErrorText(status,res){
  var m=D.errorMessage||B.errorMessage||"";
  if(m)return String(m);
  if(status===400&&res&&typeof res.error==="string"&&res.error)return res.error;
  return "Something went wrong. Please try again.";
}
function show(){
  if(shown){dlog("show() ignored — already shown this pageview");return}
  // R11: one-popup-at-a-time mutex (embed exempt — it's page content).
  if(!isEmbed){
    if(window.__wfOpenPopup&&window.__wfOpenPopup!==FID){dlog("another popup ("+window.__wfOpenPopup+") is open — skipping this pageview");return}
    window.__wfOpenPopup=FID;
  }
  shown=true;
  dlog("show() — popup rendering now");
  try{
    if(perVisitorCfg.enabled){
      var perVisitorCk2="_wf_vt_"+FID;
      var prev=localStorage.getItem(perVisitorCk2);
      var d2=prev?JSON.parse(prev):{shows:[]};
      d2.shows=(d2.shows||[]).concat([Date.now()]).slice(-10);
      localStorage.setItem(perVisitorCk2,JSON.stringify(d2));
    }
  }catch(e){}
  var ov=document.createElement("div");ov.id="wf-ov-"+FID;
  var ovBg=st.overlay||{};
  var ovOn=ovBg.enabled!==false;
  var ovColor=sv(ovBg.color,"#000000");
  function hexRgba(hex,a){hex=hex.replace("#","");if(hex.length===3)hex=hex.split("").map(function(c){return c+c}).join("");var r=parseInt(hex.substr(0,2),16),g=parseInt(hex.substr(2,2),16),b=parseInt(hex.substr(4,2),16);return"rgba("+r+","+g+","+b+","+a+")"}
  var ovBgStr=ovOn?hexRgba(ovColor,(ovBg.opacity!=null?ovBg.opacity/100:0.5)):"transparent";
  var ovStyle="position:fixed;z-index:999999;"+(st.animation==="none"?"":"animation:wfFade .3s ease;");
  if(formType==="flyout"){
    ovStyle+="right:16px;bottom:16px;top:auto;left:auto;display:block;background:transparent;";
  } else if(formType==="banner"){
    ovStyle+="top:0;left:0;right:0;bottom:auto;display:flex;justify-content:center;background:transparent;";
  } else if(formType==="fullpage"){
    ovStyle+="inset:0;display:flex;align-items:center;justify-content:center;background:"+(ovOn?ovBgStr:sv(st.backgroundColor,"#fff"))+";";
  } else {
    ovStyle+="inset:0;display:flex;align-items:center;justify-content:center;background:"+ovBgStr+";";
  }
  ov.style.cssText=ovStyle;
  var cox=B.clickOutsideClose||{desktop:true,mobile:true};
  var coxEnabled=mob()?cox.mobile!==false:cox.desktop!==false;
  if(coxEnabled&&(formType==="popup"||formType==="fullpage"))ov.addEventListener("click",function(e){if(e.target===ov)close(true)});
  var si=st.sideImage||{};
  var rawSideUrl=si.src?safeImg(String(si.src).trim()):"";
  var sideUrlOk=!!rawSideUrl;
  var sidePct=Math.min(Math.max(nv(si.width,50),20),80);
  // R10: side image collapses on mobile; banner/flyout never host one.
  function hasSideAt(m){return sideUrlOk&&!!si.enabled&&!m&&formType!=="banner"&&formType!=="flyout"}
  var embedHost=isEmbed?document.querySelector('[data-worder-form="'+FID+'"]'):null;
  var pop=document.createElement("div");pop.id="wf-pop-"+FID;
  var padT=st.paddingTop!=null?nv(st.paddingTop,32):(typeof st.padding==="number"?st.padding:32);
  var padR=st.paddingRight!=null?nv(st.paddingRight,32):(typeof st.padding==="number"?st.padding:32);
  var padB=st.paddingBottom!=null?nv(st.paddingBottom,32):(typeof st.padding==="number"?st.padding:32);
  var padL=st.paddingLeft!=null?nv(st.paddingLeft,32):(typeof st.padding==="number"?st.padding:32);
  var fontFam=sv(st.fontFamily,"Inter, sans-serif");
  // R10: width/min-height derived at SHOW time from the CURRENT viewport,
  // re-derived on resize/orientationchange while open.
  function popCss(m){
    var hs=hasSideAt(m);
    var w=m?Math.min(nv(st.width,480),window.innerWidth-32):nv(st.width,480);
    var minH=hs?Math.max(nv(st.minHeight,500),400):nv(st.minHeight,0);
    if(minH>0)minH=Math.min(minH,Math.floor(window.innerHeight*0.92));
    var anim=(st.animation==="none"||isEmbed)?"":"animation:"+(st.animation==="slide-up"?"wfSlide":"wfFade")+" .3s ease;";
    var s="box-sizing:border-box!important;position:relative!important;display:flex!important;flex-direction:row!important;overflow:hidden!important;background:"+sv(st.backgroundColor,"#fff")+"!important;"+anim;
    if(formType==="banner"){
      s+="width:100%!important;max-width:100%!important;border-radius:0;box-shadow:0 2px 8px rgba(0,0,0,0.08);";
    } else if(formType==="flyout"){
      s+="width:"+(m?"calc(100vw - 32px)":Math.min(w,400)+"px")+"!important;max-width:calc(100vw - 32px)!important;border-radius:"+nv(st.borderRadius,16)+"px;box-shadow:0 20px 40px -10px rgba(0,0,0,0.3);";
    } else if(formType==="fullpage"){
      s+="width:100vw!important;height:100vh!important;max-width:100vw!important;max-height:100vh!important;border-radius:0;box-shadow:none;";
    } else if(isEmbed&&embedHost){
      s+="width:100%!important;max-width:100%!important;border-radius:"+nv(st.borderRadius,16)+"px;box-shadow:none;";
    } else {
      s+="width:"+w+"px!important;max-width:calc(100vw - 32px)!important;border-radius:"+nv(st.borderRadius,16)+"px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);";
    }
    if(minH>0&&formType!=="fullpage")s+="min-height:"+minH+"px!important;";
    return s;
  }
  function contentCss(m){
    var hs=hasSideAt(m);
    var basis=hs?(100-sidePct)+"%":"100%";
    var maxH=formType==="banner"?"none":(formType==="flyout"?"80vh":(formType==="fullpage"?"100vh":"90vh"));
    // display:flex column + margin:auto on the child = editor's vertical
    // centering parity, safe under overflow (auto margins collapse to 0).
    return "box-sizing:border-box!important;flex:1 1 "+basis+"!important;min-width:0!important;max-width:"+basis+"!important;background:"+sv(st.backgroundColor,"#fff")+";padding:"+padT+"px "+padR+"px "+padB+"px "+padL+"px;overflow-y:auto;max-height:"+maxH+";font-family:"+fontFam+";display:flex;flex-direction:column;";
  }
  var content=document.createElement("div");
  var sideEl=null;
  function applySize(){
    var m=mob();
    pop.style.cssText=popCss(m);
    content.style.cssText=contentCss(m);
    if(sideEl)sideEl.style.display=hasSideAt(m)?"block":"none";
  }
  applySize();
  window.addEventListener("resize",applySize);
  window.addEventListener("orientationchange",applySize);
  _cleanupSize=function(){window.removeEventListener("resize",applySize);window.removeEventListener("orientationchange",applySize)};
  if(st.closeButton&&st.closeButton.show!==false){
    var cbs=Math.min(Math.max(nv(st.closeButton.size,32),20),56);
    var cb=document.createElement("button");cb.innerHTML="&times;";
    cb.onclick=function(ev){if(ev&&ev.preventDefault)ev.preventDefault();close(true)};
    cb.style.cssText="position:absolute;top:12px;right:12px;z-index:2;width:"+cbs+"px;height:"+cbs+"px;border-radius:50%;background:rgba(0,0,0,0.06);border:none;font-size:"+Math.round(cbs*0.625)+"px;color:"+sv(st.closeButton.color,"#6B7280")+";cursor:pointer;display:flex;align-items:center;justify-content:center";
    pop.appendChild(cb);
  }
  pop.appendChild(content);
  if(sideUrlOk&&si.enabled&&formType!=="banner"&&formType!=="flyout"){
    sideEl=document.createElement("div");
    sideEl.style.cssText="box-sizing:border-box!important;flex:0 0 "+sidePct+"%!important;width:"+sidePct+"%!important;max-width:"+sidePct+"%!important;align-self:stretch!important;background-color:#F4F4F5;overflow:hidden;position:relative;";
    var sideImg=document.createElement("img");
    sideImg.src=rawSideUrl;
    sideImg.alt="";
    sideImg.style.cssText="display:block;width:100%;height:100%;object-fit:cover;object-position:center;";
    sideImg.onerror=function(){this.style.display="none"};
    sideEl.appendChild(sideImg);
    if(si.position==="left")pop.insertBefore(sideEl,content);else pop.appendChild(sideEl);
    sideEl.style.display=hasSideAt(mob())?"block":"none";
  }
  if(isEmbed&&embedHost){
    embedHost.innerHTML="";
    embedHost.appendChild(pop);
  } else if(isEmbed){
    ov.style.cssText="position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:"+ovBgStr+";animation:wfFade .3s ease";
    ov.appendChild(pop);
    document.body.appendChild(ov);
  } else {
    ov.appendChild(pop);
    document.body.appendChild(ov);
  }
  // Track impression (unchanged contract — submit {_track:'impression'}).
  fetch(BU+"/api/public/forms/"+FID+"/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({_track:"impression"})}).catch(function(){});
  // novalidate: our validator replaces browser-native bubbles (R9), so
  // visitors never see the browser's locale-specific messages.
  function renderForm(html){
    content.innerHTML='<form id="wf-form-'+FID+'" novalidate style="margin:auto 0;width:100%">'+html+'</form>';
    bindForm();
  }
  // R9: shared validator for submit AND next-step. Paints borders with the
  // block's errorColor and shows the block's requiredMsg/errorMsg when
  // provided; otherwise just the border — no hardcoded PT text.
  function clearErrors(f){
    f.querySelectorAll(".wf-fe").forEach(function(el){if(el.parentNode)el.parentNode.removeChild(el)});
    f.querySelectorAll("input,select,textarea").forEach(function(el){el.style.borderColor="";el.style.outline=""});
    f.querySelectorAll("[data-wfreq]").forEach(function(el){el.style.outline="";el.style.outlineOffset=""});
    var ea=document.getElementById("wf-err-"+FID);
    if(ea)ea.style.display="none";
  }
  function fieldErr(afterEl,msg,color){
    if(!msg)return;
    var d=document.createElement("div");
    d.className="wf-fe";
    d.style.cssText="font-size:12px;margin:4px 0 8px;color:"+sv(color,"#EF4444")+";";
    d.textContent=msg;
    if(afterEl.parentNode)afterEl.parentNode.insertBefore(d,afterEl.nextSibling);
  }
  function validateStep(f){
    clearErrors(f);
    var ok=true,focusEl=null;
    function fail(el,msg,ec){ok=false;el.style.borderColor=ec;fieldErr(el,msg,ec);if(!focusEl)focusEl=el}
    f.querySelectorAll("input,select,textarea").forEach(function(inp){
      var t=(inp.type||"").toLowerCase();
      if(t==="radio")return;
      var ec=inp.getAttribute("data-wferrcolor")||"#EF4444";
      var req=inp.hasAttribute("required");
      if(t==="checkbox"){
        if(req&&!inp.checked){
          ok=false;
          inp.style.outline="2px solid "+ec;
          fieldErr(inp.closest("label")||inp,inp.getAttribute("data-wfreqmsg")||"",ec);
          if(!focusEl)focusEl=inp;
        }
        return;
      }
      var v=inp.value?String(inp.value).trim():"";
      if(req&&!v){fail(inp,inp.getAttribute("data-wfreqmsg")||"",ec);dlog("required input empty",inp.name);return}
      if(t==="email"&&v&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v)){fail(inp,inp.getAttribute("data-wferrmsg")||"",ec);dlog("invalid email",v)}
    });
    // Required radio/checkbox groups: at least one checked per group.
    f.querySelectorAll("[data-wfreq]").forEach(function(g){
      var any=false;
      g.querySelectorAll("input").forEach(function(i){if(i.checked)any=true});
      if(!any){
        ok=false;
        var ec=g.getAttribute("data-wferrcolor")||"#EF4444";
        g.style.outline="1px solid "+ec;
        g.style.outlineOffset="2px";
        fieldErr(g,g.getAttribute("data-wfreqmsg")||"",ec);
        if(!focusEl)focusEl=g.querySelector("input");
      }
    });
    if(focusEl&&focusEl.focus){try{focusEl.focus()}catch(e){}}
    return ok;
  }
  // R2: keyed merge — LAST harvest of a name wins (re-submits/step re-visits
  // replace instead of appending "João,João"); same-name values within ONE
  // pass (checkbox groups) aggregate comma-separated.
  function harvest(f){
    var fd=new FormData(f);
    var seen={};
    fd.forEach(function(v,k){
      if(seen[k]){allData[k]=allData[k]+","+v}
      else{allData[k]=v;seen[k]=true}
    });
    // Contract: phone sent as FULL value with country code prepended.
    f.querySelectorAll('input[type="tel"]').forEach(function(inp){
      var k=inp.getAttribute("name");
      if(k&&allData[k])allData[k]=normPhone(allData[k],inp.getAttribute("data-cc")||"");
    });
  }
  var submitting=false;
  content.addEventListener("click",function(e){
    var btn=e.target.closest("[data-action]");
    if(!btn)return;
    var act=btn.getAttribute("data-action");
    dlog("button click action="+act);
    if(act==="next-step"){
      e.preventDefault();
      var frm=btn.closest("form")||document.getElementById("wf-form-"+FID);
      // R2: validate the CURRENT step before advancing, then harvest it.
      if(frm&&!validateStep(frm)){dlog("next-step blocked by validation");return}
      if(frm)harvest(frm);
      if(curStep<steps.length-1){curStep++;renderForm(renderStep(curStep))}
    }
    if(act==="close"){e.preventDefault();close(true)}
    if(act==="url"&&btn.dataset.url){e.preventDefault();var uu=safeUrl(btn.dataset.url);if(uu)window.open(uu,"_blank","noopener")}
    if(act==="submit"){
      e.preventDefault();
      var fEl=btn.closest("form")||document.getElementById("wf-form-"+FID);
      if(fEl){
        if(typeof fEl.requestSubmit==="function"){fEl.requestSubmit();}
        else{
          var ev=new Event("submit",{bubbles:true,cancelable:true});
          fEl.dispatchEvent(ev);
        }
      }
    }
  });
  function bindForm(){
    var f=document.getElementById("wf-form-"+FID);
    if(!f)return;
    f.addEventListener("submit",function(e){
      e.preventDefault();
      dlog("submit event fired");
      // R5: hard re-entrancy guard against double submit.
      if(submitting){dlog("submit ignored — already in flight");return}
      if(!validateStep(f)){dlog("validation failed, abort submit");return}
      harvest(f);
      var sbtn=f.querySelector('button[type="submit"],button[data-action="submit"]');
      var sbtnTxt=sbtn?sbtn.textContent:"";
      function setLoading(on){
        if(!sbtn)return;
        sbtn.disabled=on;
        sbtn.style.opacity=on?"0.6":"";
        sbtn.textContent=on?(sbtnTxt+"…"):sbtnTxt;
      }
      // R1: inline error area INSIDE the form — no step navigation on failure.
      function showFormError(txt){
        var ea=document.getElementById("wf-err-"+FID);
        if(!ea){
          ea=document.createElement("div");
          ea.id="wf-err-"+FID;
          ea.style.cssText="margin:8px 0 0;padding:10px 12px;border-radius:8px;background:#FEF2F2;border:1px solid #FECACA;color:#B91C1C;font-size:13px;line-height:1.4;text-align:center;";
          f.appendChild(ea);
        }
        ea.style.display="block";
        ea.textContent=txt;
      }
      submitting=true;
      setLoading(true);
      dlog("submit posting to backend...");
      var payload={answers:allData};
      if(currentUtms.utm_source)payload.utm_source=currentUtms.utm_source;
      if(currentUtms.utm_medium)payload.utm_medium=currentUtms.utm_medium;
      if(currentUtms.utm_campaign)payload.utm_campaign=currentUtms.utm_campaign;
      if(currentUtms.utm_term)payload.utm_term=currentUtms.utm_term;
      if(currentUtms.utm_content)payload.utm_content=currentUtms.utm_content;
      // R4: identity signals so the server stitches this submission into the
      // visitor_identities row tracking this browser anonymously.
      var vid=getVisitorId();
      if(vid)payload.visitor_id=vid;
      var sid=getSessionId();
      if(sid)payload.session_id=sid;
      fetch(BU+"/api/public/forms/"+FID+"/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
      .then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{ok:r.ok,status:r.status,body:j}})})
      .then(function(out){
        var res=out.body||{};
        // R1: only run the success path on 2xx + success!==false. On failure:
        // inline error, re-enable button, NO cookies, NO pixels.
        if(!out.ok||res.success===false){
          submitting=false;
          setLoading(false);
          showFormError(submitErrorText(out.status,res));
          dlog("submit failed",out.status,res);
          return;
        }
        onSuccess(res);
      })
      .catch(function(err){
        submitting=false;
        setLoading(false);
        showFormError(submitErrorText(0,null));
        dlog("submit network error",err);
      });
    });
  }
  function onSuccess(res){
    submitted=true;
    // R3: single write with the unified window (365d when stopAfterSubmission).
    scx(ck,"1",freq.stopAfterSubmission?365:SHOW_AFTER_DAYS);
    scx("_wf_sub","1",365);
    try{
      var idData={};
      var fullNameVal=allData.full_name||"";
      var fn=allData.first_name||(fullNameVal?String(fullNameVal).trim().split(/\\s+/)[0]:"");
      var ln=allData.last_name||(fullNameVal?String(fullNameVal).trim().split(/\\s+/).slice(1).join(" "):"");
      if(allData.email)idData.email=allData.email;
      if(allData.phone)idData.phone=allData.phone;
      if(fn)idData.firstName=fn;
      if(ln)idData.lastName=ln;
      idData.source="popup_form";
      idData.properties={form_id:FID,form_name:${JSON.stringify(String(form.name || ''))}};
      if(idData.email||idData.phone){
        if(window.worder&&typeof window.worder.identify==="function"){
          window.worder.identify(idData);
        } else {
          var trackEp=(window.__worder&&window.__worder.config&&window.__worder.config.endpoint)||(BU+"/api/track");
          fetch(trackEp+"/identify",{method:"POST",headers:{"Content-Type":"application/json"},keepalive:true,body:JSON.stringify({
            storeDomain:(window.__worder&&window.__worder.config&&window.__worder.config.shopDomain)||location.hostname,
            email:idData.email||null,phone:idData.phone||null,
            firstName:idData.firstName||null,lastName:idData.lastName||null,
            source:"popup_form",properties:idData.properties,
            timestamp:new Date().toISOString()
          })}).catch(function(){});
        }
        if(idData.email){
          var ed=new Date();ed.setTime(ed.getTime()+730*24*60*60*1000);
          document.cookie="__worder_id_email="+encodeURIComponent(idData.email)+";expires="+ed.toUTCString()+";path=/;SameSite=Lax";
          fetch("/cart/update.js",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
            attributes:{"_worder_email":idData.email,"_worder_fn":idData.firstName||"","_worder_ln":idData.lastName||"","_worder_phone":idData.phone||""}
          })}).catch(function(){});
          try{
            if(window.Shopify&&window.Shopify.analytics&&typeof window.Shopify.analytics.publish==="function"){
              window.Shopify.analytics.publish("worder_identified",{
                email:idData.email||"",
                phone:idData.phone||"",
                firstName:idData.firstName||"",
                lastName:idData.lastName||""
              });
            }
          }catch(e){}
        }
      }
    }catch(err){}
    try{
      var tr=res&&res.tracking||{};
      var evts=tr.events||[];
      if(tr.facebook_pixel_id&&typeof window.fbq==="function"){
        evts.forEach(function(ev){
          if(ev.platforms&&ev.platforms.facebook){
            var fbData={};
            if(ev.value)fbData.value=parseFloat(ev.value)||0;
            if(ev.currency)fbData.currency=ev.currency;
            window.fbq("trackCustom",ev.name||"Lead",fbData);
          }
        });
        if(evts.length===0)window.fbq("track","Lead");
      }
      if((tr.google_analytics_id||tr.google_ads_id)&&typeof window.gtag==="function"){
        evts.forEach(function(ev){
          if(ev.platforms&&ev.platforms.google){
            var gaData={};
            if(ev.value)gaData.value=parseFloat(ev.value)||0;
            if(ev.currency)gaData.currency=ev.currency;
            window.gtag("event",ev.name||"generate_lead",gaData);
          }
        });
        if(evts.length===0)window.gtag("event","generate_lead",{});
      }
    }catch(err){}
    var act=postSubmit.action||"show-success";
    // R7: redirect target must pass the scheme whitelist, else the action drops.
    var redirectUrl=safeUrl((res&&res.redirect_url)||postSubmit.redirectUrl||"");
    if(act==="redirect"&&redirectUrl){
      window.location.href=redirectUrl;
      return;
    }
    if(act==="close"){
      close(false);
      return;
    }
    if(res&&res.coupon&&res.coupon.code){
      window.__wfDynCoupon=window.__wfDynCoupon||{};
      window.__wfDynCoupon[FID]=res.coupon.code;
    }
    // R10: success content carries the same vertical-centering wrapper.
    content.innerHTML='<div id="wf-succ-'+FID+'" style="margin:auto 0;width:100%">'+renderStep(-1)+'</div>';
    if(res&&res.double_optin_sent){
      // S9: attach the DOI notice to the success container (the old lookup
      // targeted a form id that no longer exists after the success render).
      var doi=document.createElement("div");
      doi.style.cssText="margin:0 0 12px;padding:12px 14px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;font-size:13px;color:#9A3412;line-height:1.45;text-align:center;";
      var doiMsg=D.doiMessage||B.doiMessage||"";
      if(doiMsg){doi.textContent=String(doiMsg)}
      else{doi.innerHTML="<strong>Quase l\\u00e1!</strong> Enviamos um email para voc\\u00ea confirmar sua inscri\\u00e7\\u00e3o. Verifique sua caixa de entrada."}
      var sw=document.getElementById("wf-succ-"+FID);
      if(sw&&sw.firstChild)sw.insertBefore(doi,sw.firstChild);
      else if(sw)sw.appendChild(doi);
      else content.insertBefore(doi,content.firstChild);
    }
    var delay=postSubmit.closeDelay!=null?nv(postSubmit.closeDelay,4):4;
    if(delay>0)setTimeout(function(){close(false)},delay*1000);
  }
  // Progressive profiling loads known fields before first render.
  loadKnownFields(function(){renderForm(renderStep(0))});
}
// R3/R6/S10: close(byUser). User-initiated closes fire the dismissal beacon
// (once, never after subscribe). The suppression cookie is only (re)written
// when the visitor did NOT subscribe, and never for embeds.
function close(byUser){
  var o=document.getElementById("wf-ov-"+FID);
  if(o){o.remove()}
  else{
    var pp=document.getElementById("wf-pop-"+FID);
    if(pp&&pp.parentNode)pp.parentNode.removeChild(pp);
  }
  if(window.__wfOpenPopup===FID)window.__wfOpenPopup=null;
  if(_cleanupSize){_cleanupSize();_cleanupSize=null}
  if(byUser&&!submitted)sendDismiss();
  if(isEmbed)return;
  if(!submitted)scx(ck,"1",SHOW_AFTER_DAYS);
}
// Expose custom trigger API (always available)
window._worderOnsite=window._worderOnsite||[];
var _origPush=window._worderOnsite.push;
function processCmd(cmd){
  if(Array.isArray(cmd)&&cmd[0]==="openForm"&&cmd[1]===FID){show()}
}
for(var _i=0;_i<window._worderOnsite.length;_i++){processCmd(window._worderOnsite[_i])}
window._worderOnsite.push=function(cmd){_origPush.call(window._worderOnsite,cmd);processCmd(cmd);return window._worderOnsite.length};

// Triggers (Klaviyo-style multi-condition with AND/OR). S4: when the boolean
// flags are absent, fall back to the legacy disp.trigger value — mirrors the
// editor's reads (timeEnabled ?? trigger==='time_delay', etc).
var disp=B.display||{};
var useExit=disp.exitEnabled===undefined?disp.trigger==="exit_intent":disp.exitEnabled===true;
var useTime=disp.timeEnabled===undefined?disp.trigger==="time_delay":disp.timeEnabled===true;
var useScroll=disp.scrollEnabled===undefined?disp.trigger==="scroll":disp.scrollEnabled===true;
var usePageView=disp.pageViewEnabled===true;
var matchAll=disp.matchAll===true;
var anyEnabled=useExit||useTime||useScroll||usePageView;
var delaySec=disp.delay!=null?disp.delay:(disp.delaySeconds!=null?disp.delaySeconds:5);

// Cart-value gate — async, fails open.
var cartCfg=B.cart||{};
function runCartGate(cb){
  var minP=Number(cartCfg.minTotal||0);
  var maxP=Number(cartCfg.maxTotal||0);
  var minI=Number(cartCfg.minItems||0);
  if(!cartCfg.enabled||(minP<=0&&maxP<=0&&minI<=0)){cb(true);return}
  try{
    fetch("/cart.js",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(c){
      var total=Number(c.total_price||0)/100;
      var items=Number(c.item_count||0);
      if(minP>0&&total<minP){cb(false);return}
      if(maxP>0&&total>maxP){cb(false);return}
      if(minI>0&&items<minI){cb(false);return}
      cb(true);
    }).catch(function(){cb(true)});
  }catch(e){cb(true)}
}
var perVisitorCfg=freq.perVisitor||{};
function perVisitorBlocked(){
  if(!perVisitorCfg.enabled)return false;
  var vid=gc("__worder_id");
  if(!vid)return false;
  var perVisitorCk="_wf_vt_"+FID;
  var raw=localStorage.getItem(perVisitorCk);
  if(!raw)return false;
  try{
    var d=JSON.parse(raw);
    var windowMs=Number(perVisitorCfg.windowDays||7)*86400000;
    var since=Date.now()-windowMs;
    var recent=(d.shows||[]).filter(function(t){return t>since});
    return recent.length>=Number(perVisitorCfg.maxShows||1);
  }catch(e){return false}
}
if(perVisitorBlocked()&&!useCustomTrigger&&!isEmbed)return;

// Async subscriber gate — server check, 10-minute cache, fails open.
function runSubscriberGate(cb){
  if(DBG){dlog("subscriber gate bypassed (debug mode)");cb(true);return}
  if(!vis.hideFromSubscribers){cb(true);return}
  var vid=gc("__worder_id");
  if(!vid){cb(true);return}
  var ckCache="_wf_paw_"+FID;
  try{
    var raw=localStorage.getItem(ckCache);
    if(raw){
      var c=JSON.parse(raw);
      if(c&&c.t&&Date.now()-c.t<600000){
        if(c.a===false)blockedBy("subscriber gate (cached)");
        cb(c.a!==false);return;
      }
    }
  }catch(e){}
  var url=BU+"/api/public/forms/"+FID+"/preview-allowed?vid="+encodeURIComponent(vid)+
    "&domain="+encodeURIComponent((window.__worder&&window.__worder.config&&window.__worder.config.shopDomain)||location.hostname);
  fetch(url).then(function(r){return r.json()}).then(function(j){
    var allowed=j&&j.allowed!==false;
    try{localStorage.setItem(ckCache,JSON.stringify({t:Date.now(),a:allowed}))}catch(e){}
    if(!allowed)blockedBy("subscriber gate — server says "+(j&&j.reason||"not allowed"));
    cb(allowed);
  }).catch(function(){cb(true)});
}

runSubscriberGate(function(subOk){
  if(!subOk)return;
runLocationGate(function(locOk){
  if(!locOk){blockedBy("location gate");return}
runCartGate(function(cartOk){
  if(!cartOk){blockedBy("cart gate");return}
  dlog("all gates passed",{ useExit:useExit, useTime:useTime, useScroll:useScroll, usePageView:usePageView, useCustomTrigger:useCustomTrigger, matchAll:matchAll, delay:delaySec });
  // S10: embedded forms render immediately — no triggers, no frequency.
  if(isEmbed){dlog("embed form type — rendering immediately");show();return}
  if(!anyEnabled&&!useCustomTrigger){
    dlog("no triggers configured, default 5s delay");
    setTimeout(function(){dlog("default 5s elapsed, showing");show();},5000);
    return;
  }
  if(!anyEnabled&&useCustomTrigger){
    dlog("custom trigger only — waiting for openForm");
    return;
  }

  var satisfied={exit:false,time:false,scroll:false,pv:false};
  function tryShow(which){
    dlog("tryShow:",which,"satisfied=",JSON.stringify(satisfied),"matchAll=",matchAll);
    satisfied[which]=true;
    if(matchAll){
      if((!useExit||satisfied.exit)&&(!useTime||satisfied.time)&&(!useScroll||satisfied.scroll)&&(!usePageView||satisfied.pv))show();
    } else {
      show();
    }
  }

  if(useTime){
    var td=nv(delaySec,5)*1000;
    dlog("time trigger armed: "+td+"ms");
    setTimeout(function(){dlog("time trigger fired");tryShow("time")},td);
  }

  if(useScroll){
    var sp=nv(disp.scrollPercent,30)||30;
    dlog("scroll trigger armed: "+sp+"%");
    var onScroll=function(){
      var max=document.body.scrollHeight-window.innerHeight;
      if(max<=0)return;
      var pct=(window.scrollY/max)*100;
      if(pct>=sp){window.removeEventListener("scroll",onScroll);dlog("scroll trigger fired at "+Math.round(pct)+"%");tryShow("scroll")}
    };
    window.addEventListener("scroll",onScroll,{passive:true});
  }

  if(useExit){
    dlog("exit-intent armed");
    // S13: require the cursor to actually LEAVE the document (relatedTarget /
    // toElement null), not just pass through the top 10px band.
    function onLeave(e){
      if(e.clientY<10&&!e.relatedTarget&&!e.toElement){
        dlog("exit-intent fired (desktop mouseout)");cleanupExit();tryShow("exit");
      }
    }
    document.addEventListener("mouseout",onLeave);
    var lastY=window.scrollY,lastT=Date.now();
    function onMobScroll(){
      if(window.innerWidth>=768)return;
      var y=window.scrollY,t=Date.now();
      var dy=lastY-y,dt=t-lastT;
      if(dy>=250&&dt<400&&y<window.innerHeight){dlog("exit-intent fired (mobile rapid scroll up)");cleanupExit();tryShow("exit");return}
      lastY=y;lastT=t;
    }
    window.addEventListener("scroll",onMobScroll,{passive:true});
    function onHide(){if(document.visibilityState==="hidden"){dlog("exit-intent fired (visibility hidden)");cleanupExit();tryShow("exit")}}
    document.addEventListener("visibilitychange",onHide);
    window.addEventListener("pagehide",onHide,{once:true});
    function cleanupExit(){
      document.removeEventListener("mouseout",onLeave);
      window.removeEventListener("scroll",onMobScroll);
      document.removeEventListener("visibilitychange",onHide);
    }
  }

  if(usePageView){
    var need=disp.pageViewCount||3;
    if(pvCount>=need)tryShow("pv");
  }
  });
});
});
var s=document.createElement("style");s.textContent="@keyframes wfFade{from{opacity:0}to{opacity:1}}@keyframes wfSlide{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}";document.head.appendChild(s);
if(!document.getElementById("wf-fonts-link")){
  var fl=document.createElement("link");
  fl.id="wf-fonts-link";
  fl.rel="stylesheet";
  fl.href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700;800&family=Roboto:wght@400;500;700&family=Open+Sans:wght@400;500;600;700&display=swap";
  document.head.appendChild(fl);
}
})();`
}
