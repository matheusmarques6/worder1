import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { data: form } = await supabaseAdmin
      .from('crm_forms')
      .select('id, name, status, design_json, behavior, form_type, success_message, redirect_url')
      .eq('id', params.id)
      .single()

    if (!form || form.status !== 'published') {
      return new Response('/* Form not published */', { headers: { 'Content-Type': 'application/javascript' } })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app'
    const design = form.design_json || {}
    const beh = form.behavior || design.behavior || {}

    const script = `(function(){
"use strict";
var FID="${params.id}",BU="${baseUrl}",D=${JSON.stringify(design)},B=${JSON.stringify(beh)};
var shown=false,ck="_wf_"+FID;
function gc(n){var m=document.cookie.match("(^|;)\\\\s*"+n+"=([^;]*)");return m?m[2]:null}
function sc(n,v,d){var e=new Date();e.setDate(e.getDate()+d);document.cookie=n+"="+v+";path=/;expires="+e.toUTCString()+";SameSite=Lax"}
function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function cornerPx(c,r){return c==="none"?0:c==="small"?4:c==="medium"?8:c==="large"?16:c==="custom"?(r||0):8}
function inputStyleStr(p){
  var r=cornerPx(p.corners||"medium",p.cornerRadius||8);
  var und=p.inputStyle==="underline";
  var bw=p.borderWidth==null?1:p.borderWidth;
  var bs=p.borderStyle||"solid";
  var bc=p.borderColor||"#E5E7EB";
  var bg=und?"transparent":(p.backgroundColor||"#FFFFFF");
  var fam=p.fontFamily&&p.fontFamily!=="inherit"?p.fontFamily:"inherit";
  var s="width:100%;box-sizing:border-box;outline:none;";
  s+="padding:"+(p.inputPadTop==null?12:p.inputPadTop)+"px "+(p.inputPadRight==null?16:p.inputPadRight)+"px "+(p.inputPadBottom==null?12:p.inputPadBottom)+"px "+(p.inputPadLeft==null?16:p.inputPadLeft)+"px;";
  s+="background:"+bg+";color:"+(p.textColor||"#111827")+";";
  s+="font-family:"+fam+";font-size:"+(p.fontSize||14)+"px;";
  s+="font-weight:"+(p.bold?"700":"400")+";font-style:"+(p.italic?"italic":"normal")+";text-decoration:"+(p.underline?"underline":"none")+";";
  s+="text-align:"+(p.textAlign||"left")+";";
  if(und){s+="border:none;border-bottom:"+bw+"px "+bs+" "+bc+";border-radius:0;"}
  else{s+="border:"+bw+"px "+bs+" "+bc+";border-radius:"+r+"px;"}
  return s;
}
function wrapStyleStr(p){
  var a=p.align||"full";
  var jc=a==="center"?"center":(a==="right"?"flex-end":"flex-start");
  var s="display:flex;justify-content:"+jc+";width:100%;";
  s+="padding:"+(p.paddingTop||0)+"px "+(p.paddingRight||0)+"px "+(p.paddingBottom==null?8:p.paddingBottom)+"px "+(p.paddingLeft||0)+"px;";
  return s;
}
function innerWrapStyleStr(p){
  var a=p.align||"full";
  return "width:"+(a==="full"?"100%":"auto")+";max-width:100%;";
}
function labelStyleStr(p){
  return "display:block;font-size:13px;font-weight:500;color:"+(p.labelColor||"#374151")+";margin-bottom:4px;text-align:"+(p.textAlign||"left")+";";
}
var freq=B.frequency||{};
var vis=B.visibility||{};
var isMob=window.innerWidth<768;
// Device gate
if(vis.devices==="desktop"&&isMob)return;
if(vis.devices==="mobile"&&!isMob)return;
// Subscriber gate
if(vis.hideFromSubscribers&&gc("_wf_sub"))return;
// Visitor type gate (new vs returning based on first-seen cookie)
var firstSeenCk="_wf_seen";
var isReturning=!!gc(firstSeenCk);
if(vis.visitorType==="new"&&isReturning)return;
if(vis.visitorType==="returning"&&!isReturning)return;
sc(firstSeenCk,"1",365);
// Frequency gate: closed form cookie (skip if custom trigger — manual open always works)
var useCustomTrigger=!!B.customTrigger;
if(gc(ck)&&!useCustomTrigger)return;
// URL include/exclude (wildcard: *)
function matchUrl(pattern,url){
  if(!pattern)return false;
  var re=new RegExp("^"+pattern.replace(/[-\\/\\\\^$+?.()|[\\]{}]/g,"\\\\$&").replace(/\\*/g,".*")+"$");
  return re.test(url);
}
var pagePath=location.pathname;
var urls=B.urls||{};
if(urls.includeEnabled&&urls.includeUrls&&urls.includeUrls.length>0){
  if(!urls.includeUrls.some(function(p){return matchUrl(p,pagePath)||pagePath.indexOf(p)>=0}))return;
}
if(urls.excludeEnabled&&urls.excludeUrls&&urls.excludeUrls.length>0){
  if(urls.excludeUrls.some(function(p){return matchUrl(p,pagePath)||pagePath.indexOf(p)>=0}))return;
}
// Legacy targeting.pageUrls still supported for old popups
var tgt=B.targeting||{};
if(tgt.pages==="specific"&&tgt.pageUrls&&tgt.pageUrls.length>0){
  if(!tgt.pageUrls.some(function(p){return pagePath.indexOf(p)>=0}))return;
}
// Location gate (async best-effort via fetch to ipapi — fails open)
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
// Page view count gate
function incPv(){
  var n=parseInt(sessionStorage.getItem("_wf_pv")||"0",10)+1;
  sessionStorage.setItem("_wf_pv",String(n));
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
var formType=D.formType||"popup";
var postSubmit=D.postSubmit||{action:"show-success",redirectUrl:"",closeDelay:4};
var curStep=0;
var allData={};
function visibleBlocks(bs){
  return (bs||[]).filter(function(b){
    var pp=b.props||{};
    if(isMob&&pp.hideOnMobile)return false;
    if(!isMob&&pp.hideOnDesktop)return false;
    return true;
  });
}
function renderBlock(b){
  var p=b.props||{},h="";
  switch(b.type){
    case"text":{
      var tag=p.tag||"p";
      h='<'+tag+' style="font-size:'+(p.fontSize||16)+'px;color:'+(p.color||"#111827")+';font-weight:'+(p.fontWeight||"normal")+';font-style:'+(p.fontStyle||"normal")+';text-decoration:'+(p.textDecoration||"none")+';text-align:'+(p.align||"left")+';margin:0 0 8px;line-height:'+(p.lineHeight||1.4)+';font-family:'+(p.fontFamily||"inherit")+'">'+((p.content||""))+'</'+tag+'>';
      break;
    }
    case"image":{
      if(!p.src){h="";break}
      var imgTag='<img src="'+esc(p.src)+'" alt="'+esc(p.alt||"")+'" style="width:'+(p.imgWidth?p.imgWidth+"%":(p.width||"100%"))+';max-height:'+(p.maxHeight||300)+'px;object-fit:contain;border-radius:'+(p.borderRadius||0)+'px;display:inline-block" />';
      if(p.href)imgTag='<a href="'+esc(p.href)+'" target="_blank" rel="noopener noreferrer" style="display:inline-block">'+imgTag+'</a>';
      h='<div style="text-align:'+(p.align||"center")+';margin:0 0 8px;padding:'+(p.padding||0)+'px">'+imgTag+'</div>';
      break;
    }
    case"email":case"phone":case"name-input":case"text-input":case"date-input":{
      var nm=p.mapTo==="custom"?("custom:"+(p.mapToCustom||p.label||"field")):(p.mapTo||(b.type==="email"?"email":b.type==="phone"?"phone":b.type==="name-input"?"first_name":"field"));
      var itype=b.type==="email"?"email":b.type==="phone"?"tel":b.type==="date-input"?"date":"text";
      var req=p.required||b.type==="email"?' required':'';
      var phc=p.placeholderColor||"#9CA3AF";
      var iid="wi_"+b.id;
      var lbl=(p.showLabel&&p.label)?'<label for="'+iid+'" style="'+labelStyleStr(p)+'">'+esc(p.label)+'</label>':'';
      var inputHtml='<input id="'+iid+'" name="'+esc(nm)+'" type="'+itype+'" placeholder="'+esc(p.placeholder||"")+'"'+req+' style="'+inputStyleStr(p)+'" />';
      var customCss='<style>#'+iid+'::placeholder{color:'+phc+';opacity:1}</style>';
      if(b.type==="phone"&&p.countryCode){
        var cc=esc(p.countryCode||"+55");
        var ccStyle="display:flex;align-items:center;padding:0 12px;border:"+(p.borderWidth==null?1:p.borderWidth)+"px "+(p.borderStyle||"solid")+" "+(p.borderColor||"#E5E7EB")+";border-radius:"+cornerPx(p.corners||"medium",p.cornerRadius||8)+"px;font-size:"+(p.fontSize||14)+"px;color:"+(p.textColor||"#111827")+";background:"+(p.backgroundColor||"#F9FAFB")+";white-space:nowrap;font-family:"+(p.fontFamily||"inherit")+";";
        inputHtml='<div style="display:flex;gap:8px;width:100%;"><span style="'+ccStyle+'">'+cc+'</span>'+inputHtml+'</div>';
      }
      h=customCss+'<div style="'+wrapStyleStr(p)+'"><div style="'+innerWrapStyleStr(p)+'">'+lbl+inputHtml+'</div></div>';
      break;
    }
    case"dropdown":{
      var ddName=p.mapTo==="custom"?("custom:"+(p.mapToCustom||p.label||"select")):(p.mapTo||p.label||"select");
      var ff=st.fontFamily||"inherit";
      var opts=(p.options||[]).map(function(o){return'<option value="'+esc(o)+'">'+esc(o)+'</option>'}).join("");
      var ddLabel=(p.showLabel!==false&&p.label)?'<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:4px;font-family:'+ff+'">'+esc(p.label)+'</label>':"";
      h=ddLabel+'<select name="'+esc(ddName)+'" style="width:100%;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;background:#fff;box-sizing:border-box;margin:0 0 8px;font-family:'+ff+'"><option value="">'+(p.placeholder||"Escolha...")+'</option>'+opts+'</select>';
      break;
    }
    case"radio":{
      var rName=p.mapTo==="custom"?("custom:"+(p.mapToCustom||p.label||"radio")):(p.mapTo||p.label||"radio");
      var rff=st.fontFamily||"inherit";
      var rLabel=(p.showLabel!==false&&p.label)?'<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;font-family:'+rff+'">'+esc(p.label)+'</label>':"";
      var ri=(p.options||[]).map(function(o){return'<label style="display:'+(p.layout==="horizontal"?"inline-flex":"flex")+';align-items:center;gap:8px;margin:0 12px 8px 0;font-size:14px;cursor:pointer;font-family:'+rff+'"><input type="radio" name="'+esc(rName)+'" value="'+esc(o)+'" style="margin:0;accent-color:#F97316" />'+esc(o)+'</label>'}).join("");
      h=rLabel+'<div style="margin:0 0 8px">'+ri+'</div>';
      break;
    }
    case"checkbox":{
      var cbName=p.mapTo==="custom"?("custom:"+(p.mapToCustom||p.label||"check")):(p.mapTo||p.label||"check");
      var cbff=st.fontFamily||"inherit";
      var cbLabel=(p.showLabel!==false&&p.label)?'<label style="display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;font-family:'+cbff+'">'+esc(p.label)+'</label>':"";
      var ci=(p.options||[]).map(function(o){return'<label style="display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:14px;cursor:pointer;font-family:'+cbff+'"><input type="checkbox" name="'+esc(cbName)+'" value="'+esc(o)+'" style="margin:0;accent-color:#F97316" />'+esc(o)+'</label>'}).join("");
      h=cbLabel+'<div style="margin:0 0 8px">'+ci+'</div>';
      break;
    }
    case"legal-consent":{
      var lcText=(p.text||"Concordo com a politica de privacidade").replace(/<a /g,'<a style="color:'+(p.linkColor||"#F97316")+';text-decoration:underline" ');
      h='<label style="display:flex;align-items:flex-start;gap:8px;font-size:'+(p.fontSize||12)+'px;color:'+(p.color||"#6B7280")+';margin:0 0 8px;cursor:pointer;line-height:'+(p.lineHeight||1.4)+'"><input type="checkbox" name="consent" '+(p.required?"required":"")+' style="margin-top:2px;flex-shrink:0" /><span>'+lcText+'</span></label>';
      break;
    }
    case"button":{
      var act=p.action||"submit";
      var btnBorder=p.btnBorderWidth?"border:"+p.btnBorderWidth+"px solid "+(p.btnBorderColor||"#E5E7EB"):"border:none";
      var btnId="wb_"+b.id;
      var hoverCss=p.hoverColor?'<style>#'+btnId+':hover{background:'+(p.hoverColor)+'!important}</style>':"";
      h=hoverCss+'<button id="'+btnId+'" type="'+(act==="submit"?"submit":"button")+'" data-action="'+act+'"'+(p.url?' data-url="'+esc(p.url)+'"':"")+' style="width:'+(p.fullWidth?"100%":"auto")+';padding:'+(p.paddingV||14)+'px '+(p.paddingH||28)+'px;background:'+(p.bgColor||"#F97316")+';color:'+(p.textColor||"#fff")+';font-size:'+(p.fontSize||15)+'px;font-weight:700;border-radius:'+(p.borderRadius||8)+'px;'+btnBorder+';cursor:pointer;margin:0 0 8px;display:block;transition:background 0.2s">'+(p.text||"Enviar")+'</button>';
      break;
    }
    case"spacer":h='<div style="height:'+(p.height||16)+'px"></div>';break;
    case"line":h='<hr style="border:none;border-top:'+(p.thickness||1)+'px solid '+(p.color||"#E5E7EB")+';margin:8px 0" />';break;
    case"coupon":{
      h='<div style="margin:8px 0;padding:12px 16px;border:2px dashed '+(p.borderColor||"#F97316")+';border-radius:'+(p.borderRadius||8)+'px;text-align:center;background:'+(p.bgColor||"#FFF7ED")+'"><p style="font-size:11px;color:#6B7280;margin:0 0 4px">'+esc(p.description||"Seu cupom:")+'</p><p style="font-size:'+(p.fontSize||20)+'px;font-weight:bold;color:'+(p.codeColor||"#F97316")+';letter-spacing:2px;margin:0;cursor:pointer" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.textContent)">'+esc(p.code||"CODIGO")+'</p></div>';
      break;
    }
    case"countdown":{
      var cdId="wcd_"+b.id;
      var lbls=p.labels||{days:"DIAS",hours:"HORAS",minutes:"MIN",seconds:"SEG"};
      var fs=p.fontSize||28;
      var nc=p.numberColor||"#FFFFFF";
      var lc=p.labelColor||"#9CA3AF";
      var bc=p.boxColor||"#1F2937";
      function cdCell(id,lbl){return'<span style="display:flex;flex-direction:column;align-items:center"><span id="'+id+'" style="font-size:'+fs+'px;font-weight:800;color:'+nc+';line-height:1">00</span><span style="font-size:9px;color:'+lc+';margin-top:4px;letter-spacing:1px">'+esc(lbl)+'</span></span>'}
      var sep='<span style="color:'+lc+';font-size:20px;font-weight:700;padding:0 4px">:</span>';
      h='<div style="text-align:center;padding:16px;background:'+bc+';border-radius:8px;margin:0 0 8px"><div style="display:inline-flex;align-items:center;gap:4px">'+cdCell(cdId+"_d",lbls.days)+sep+cdCell(cdId+"_h",lbls.hours)+sep+cdCell(cdId+"_m",lbls.minutes)+sep+cdCell(cdId+"_s",lbls.seconds)+'</div></div>';
      // Register live timer (executed after DOM insert via setTimeout)
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
  return visibleBlocks(step.blocks||[]).map(renderBlock).join("");
}
function show(){
  if(shown)return;shown=true;
  var ov=document.createElement("div");ov.id="wf-ov-"+FID;
  var ovBg=st.overlay||{};
  var ovOn=ovBg.enabled!==false;
  var ovColor=ovBg.color||"#000000";
  function hexRgba(hex,a){hex=hex.replace("#","");if(hex.length===3)hex=hex.split("").map(function(c){return c+c}).join("");var r=parseInt(hex.substr(0,2),16),g=parseInt(hex.substr(2,2),16),b=parseInt(hex.substr(4,2),16);return"rgba("+r+","+g+","+b+","+a+")"}
  var ovBgStr=ovOn?hexRgba(ovColor,(ovBg.opacity!=null?ovBg.opacity/100:0.5)):"transparent";

  // Container (overlay) style depends on form type
  var ovStyle="position:fixed;z-index:999999;animation:wfFade .3s ease;";
  if(formType==="flyout"){
    // Flyout = bottom-right corner, no overlay backdrop by default
    ovStyle+="right:16px;bottom:16px;top:auto;left:auto;display:block;background:transparent;";
  } else if(formType==="banner"){
    // Banner = full-width strip at top
    ovStyle+="top:0;left:0;right:0;bottom:auto;display:flex;justify-content:center;background:transparent;";
  } else if(formType==="fullpage"){
    // Fullpage = cover entire viewport
    ovStyle+="inset:0;display:flex;align-items:center;justify-content:center;background:"+(ovOn?ovBgStr:(st.backgroundColor||"#fff"))+";";
  } else {
    // Popup modal (default) + embed inline handled separately below
    ovStyle+="inset:0;display:flex;align-items:center;justify-content:center;background:"+ovBgStr+";";
  }
  ov.style.cssText=ovStyle;

  // Click-outside-to-close: per-device (only relevant for popup/fullpage)
  var cox=B.clickOutsideClose||{desktop:true,mobile:true};
  var coxEnabled=isMob?cox.mobile!==false:cox.desktop!==false;
  if(coxEnabled&&(formType==="popup"||formType==="fullpage"))ov.addEventListener("click",function(e){if(e.target===ov)close()});
  var w=isMob?Math.min(st.width||480,window.innerWidth-32):(st.width||480);
  var hasSide=st.sideImage&&st.sideImage.enabled&&st.sideImage.src&&!isMob&&formType!=="banner"&&formType!=="flyout";
  var popW=hasSide?w+(st.sideImage.width||200):w;
  var pop=document.createElement("div");pop.id="wf-pop-"+FID;

  // Pop (inner card) style depends on form type
  var popStyle="position:relative;display:flex;overflow:hidden;animation:"+(st.animation==="slide-up"?"wfSlide":"wfFade")+" .3s ease;";
  if(formType==="banner"){
    popStyle+="width:100%;max-width:100%;border-radius:0;box-shadow:0 2px 8px rgba(0,0,0,0.08);";
  } else if(formType==="flyout"){
    popStyle+="max-width:"+popW+"px;width:"+(isMob?"calc(100vw - 32px)":popW+"px")+";border-radius:"+(st.borderRadius||16)+"px;box-shadow:0 20px 40px -10px rgba(0,0,0,0.3);";
  } else if(formType==="fullpage"){
    popStyle+="max-width:"+popW+"px;width:calc(100% - 32px);border-radius:"+(st.borderRadius||16)+"px;box-shadow:none;";
  } else {
    popStyle+="max-width:"+popW+"px;width:calc(100% - 32px);border-radius:"+(st.borderRadius||16)+"px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);";
  }
  pop.style.cssText=popStyle;
  // Per-side padding with fallback to single value
  var padT=st.paddingTop!=null?st.paddingTop:(typeof st.padding==="number"?st.padding:32);
  var padR=st.paddingRight!=null?st.paddingRight:(typeof st.padding==="number"?st.padding:32);
  var padB=st.paddingBottom!=null?st.paddingBottom:(typeof st.padding==="number"?st.padding:32);
  var padL=st.paddingLeft!=null?st.paddingLeft:(typeof st.padding==="number"?st.padding:32);
  var fontFam=st.fontFamily||"Inter, sans-serif";
  var content=document.createElement("div");
  var maxH=formType==="banner"?"none":(formType==="flyout"?"80vh":"90vh");
  content.style.cssText="flex:1;background:"+(st.backgroundColor||"#fff")+";padding:"+padT+"px "+padR+"px "+padB+"px "+padL+"px;overflow-y:auto;max-height:"+maxH+";font-family:"+fontFam;
  if(st.closeButton&&st.closeButton.show!==false){
    var cb=document.createElement("button");cb.innerHTML="&times;";cb.onclick=close;
    cb.style.cssText="position:absolute;top:12px;right:12px;z-index:2;width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,0.06);border:none;font-size:20px;color:"+(st.closeButton.color||"#6B7280")+";cursor:pointer;display:flex;align-items:center;justify-content:center";
    pop.appendChild(cb);
  }
  content.innerHTML='<form id="wf-form-'+FID+'">'+renderStep(0)+'</form>';
  pop.appendChild(content);
  if(hasSide){
    var sideUrl=st.sideImage.src;
    if(sideUrl&&!/^(https?:|\/)/i.test(sideUrl))sideUrl="";
    if(sideUrl){
      var side=document.createElement("div");
      side.style.cssText="width:"+(st.sideImage.width||50)+"%;flex-shrink:0;background:url("+encodeURI(sideUrl)+") center/cover no-repeat";
      if(st.sideImage.position==="left")pop.insertBefore(side,content);else pop.appendChild(side);
    }
  }
  ov.appendChild(pop);
  if(formType==="embed"){
    // Inline render: look for host element [data-worder-form="FID"]
    var host=document.querySelector('[data-worder-form="'+FID+'"]');
    if(host){
      // Reset container styles for inline rendering
      pop.style.boxShadow="none";
      pop.style.animation="";
      host.innerHTML="";
      host.appendChild(pop);
    } else {
      // No host found — fall back to popup modal behaviour
      ov.style.cssText="position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:"+ovBgStr+";animation:wfFade .3s ease";
      document.body.appendChild(ov);
    }
  } else {
    document.body.appendChild(ov);
  }
  // Track impression
  fetch(BU+"/api/public/forms/"+FID+"/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({_track:"impression"})}).catch(function(){});
  // Form events
  var form=document.getElementById("wf-form-"+FID);
  if(form){
    form.addEventListener("click",function(e){
      var btn=e.target.closest("[data-action]");
      if(!btn)return;
      var act=btn.getAttribute("data-action");
      if(act==="next-step"){e.preventDefault();if(curStep<steps.length-1){curStep++;content.innerHTML='<form id="wf-form-'+FID+'">'+renderStep(curStep)+'</form>';bindForm()}}
      if(act==="close"){e.preventDefault();close()}
      if(act==="url"&&btn.dataset.url){e.preventDefault();window.open(btn.dataset.url,"_blank")}
    });
    bindForm();
  }
  function bindForm(){
    var f=document.getElementById("wf-form-"+FID);
    if(!f)return;
    f.addEventListener("submit",function(e){
      e.preventDefault();
      var reqInputs=f.querySelectorAll("[required]");
      var valid=true;
      reqInputs.forEach(function(inp){inp.style.borderColor=""});
      reqInputs.forEach(function(inp){
        if(!inp.value||!inp.value.trim()){valid=false;inp.style.borderColor="#EF4444";inp.focus()}
        if(inp.type==="email"&&inp.value&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inp.value)){valid=false;inp.style.borderColor="#EF4444";inp.focus()}
      });
      if(!valid)return;
      var fd=new FormData(f);
      fd.forEach(function(v,k){
        if(allData[k]!==undefined){
          // Aggregate multiple values (checkboxes) into comma-separated string
          allData[k]=allData[k]+","+v;
        } else {
          allData[k]=v;
        }
      });
      var payload={answers:allData};
      if(currentUtms.utm_source)payload.utm_source=currentUtms.utm_source;
      if(currentUtms.utm_medium)payload.utm_medium=currentUtms.utm_medium;
      if(currentUtms.utm_campaign)payload.utm_campaign=currentUtms.utm_campaign;
      if(currentUtms.utm_term)payload.utm_term=currentUtms.utm_term;
      if(currentUtms.utm_content)payload.utm_content=currentUtms.utm_content;
      // Identity signals — let the server stitch this submission into the
      // visitor_identities row that's been tracking this browser anonymously,
      // so historic events get backfilled to the new contact.
      try{
        var vid=localStorage.getItem("_worder_canonical")||localStorage.getItem("_worder_vid");
        var sid=sessionStorage.getItem("_worder_sid");
        if(vid)payload.visitor_id=vid;
        if(sid)payload.session_id=sid;
      }catch(_){}
      fetch(BU+"/api/public/forms/"+FID+"/submit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
      .then(function(r){return r.json().catch(function(){return{}})})
      .then(function(res){
        sc(ck,"1",freq.showAfterDays||30);
        if(freq.stopAfterSubmission)sc(ck,"1",365);
        sc("_wf_sub","1",365);
        // Bridge captured data to Worder tracking so visitor_id is linked to this
        // contact. All subsequent viewed_product / added_to_cart events from this
        // browser will then be attributed to this identified visitor.
        try{
          var idData={};
          var fullNameVal=allData.full_name||"";
          var fn=allData.first_name||(fullNameVal?String(fullNameVal).trim().split(/\s+/)[0]:"");
          var ln=allData.last_name||(fullNameVal?String(fullNameVal).trim().split(/\s+/).slice(1).join(" "):"");
          if(allData.email)idData.email=allData.email;
          if(allData.phone)idData.phone=allData.phone;
          if(fn)idData.firstName=fn;
          if(ln)idData.lastName=ln;
          idData.source="popup_form";
          idData.properties={form_id:FID,form_name:"${String(form.name || '').replace(/"/g, '\\"')}"};
          if(idData.email||idData.phone){
            if(window.worder&&typeof window.worder.identify==="function"){
              window.worder.identify(idData);
            } else {
              // Worder tracking script not yet loaded — POST identify directly as fallback
              var trackEp=(window.__worder&&window.__worder.config&&window.__worder.config.endpoint)||(BU+"/api/track");
              fetch(trackEp+"/identify",{method:"POST",headers:{"Content-Type":"application/json"},keepalive:true,body:JSON.stringify({
                storeDomain:(window.__worder&&window.__worder.config&&window.__worder.config.shopDomain)||location.hostname,
                email:idData.email||null,phone:idData.phone||null,
                firstName:idData.firstName||null,lastName:idData.lastName||null,
                source:"popup_form",properties:idData.properties,
                timestamp:new Date().toISOString()
              })}).catch(function(){});
            }
            // Persist email in 1st-party cookie so identity survives future sessions
            if(idData.email){
              var ed=new Date();ed.setTime(ed.getTime()+730*24*60*60*1000);
              document.cookie="__worder_id_email="+encodeURIComponent(idData.email)+";expires="+ed.toUTCString()+";path=/;SameSite=Lax";
              // Bridge identity into Shopify cart attributes so the sandboxed Web Pixel
              // (which can't read our cookies) picks up the email from cart data and
              // attaches it to added_to_cart / checkout events.
              fetch("/cart/update.js",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
                attributes:{"_worder_email":idData.email,"_worder_fn":idData.firstName||"","_worder_ln":idData.lastName||"","_worder_phone":idData.phone||""}
              })}).catch(function(){});
              // Real-time bridge: publish a custom Shopify event so the Web Pixel
              // (in its sandboxed iframe) can pick up identity immediately — no
              // navigation required. This closes the gap for "same page popup+ATC".
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
        // Fire client-side pixels (Facebook/GA) using tracking data returned by server
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
        // Prefer server-provided redirect_url, fallback to configured postSubmit
        var act=postSubmit.action||"show-success";
        var redirectUrl=(res&&res.redirect_url)||postSubmit.redirectUrl||"";
        if(act==="redirect"&&redirectUrl){
          // Honor configured redirect URL after submit
          window.location.href=redirectUrl;
          return;
        }
        if(act==="close"){
          close();
          return;
        }
        // Default: show-success step, then auto-close after delay (0 = stay open)
        content.innerHTML=renderStep(-1);
        var delay=postSubmit.closeDelay!=null?postSubmit.closeDelay:4;
        if(delay>0)setTimeout(close,delay*1000);
      }).catch(function(){});
    });
  }
}
function close(){var o=document.getElementById("wf-ov-"+FID);if(o)o.remove();sc(ck,"1",freq.showAfterDays||1)}
// Expose custom trigger API (always available)
window._worderOnsite=window._worderOnsite||[];
var _origPush=window._worderOnsite.push;
function processCmd(cmd){
  if(Array.isArray(cmd)&&cmd[0]==="openForm"&&cmd[1]===FID){show()}
}
// Process any commands already queued
for(var _i=0;_i<window._worderOnsite.length;_i++){processCmd(window._worderOnsite[_i])}
window._worderOnsite.push=function(cmd){_origPush.call(window._worderOnsite,cmd);processCmd(cmd);return window._worderOnsite.length};

// Determine triggers to evaluate (Klaviyo-style multi-condition with AND/OR)
var disp=B.display||{};
var useExit=disp.exitEnabled===true;
var useTime=disp.timeEnabled===true;
var useScroll=disp.scrollEnabled===true;
var usePageView=disp.pageViewEnabled===true;
var matchAll=disp.matchAll===true;
var anyEnabled=useExit||useTime||useScroll||usePageView;

// Run location gate first (async), then trigger setup
runLocationGate(function(locOk){
  if(!locOk)return;
  if(!anyEnabled&&!useCustomTrigger){
    // No rules enabled at all: default to time delay 5s
    setTimeout(show,5000);
    return;
  }
  if(!anyEnabled&&useCustomTrigger){
    // Only custom trigger — don't auto-show, wait for explicit openForm
    return;
  }

  var satisfied={exit:false,time:false,scroll:false,pv:false};
  function tryShow(which){
    satisfied[which]=true;
    if(matchAll){
      // AND: require all ENABLED rules to be satisfied
      if((!useExit||satisfied.exit)&&(!useTime||satisfied.time)&&(!useScroll||satisfied.scroll)&&(!usePageView||satisfied.pv))show();
    } else {
      // OR: any single rule triggers
      show();
    }
  }

  if(useTime)setTimeout(function(){tryShow("time")},(disp.delay||5)*1000);

  if(useScroll){
    var sp=disp.scrollPercent||30;
    function onScroll(){
      var max=document.body.scrollHeight-window.innerHeight;
      if(max<=0)return;
      var pct=(window.scrollY/max)*100;
      if(pct>=sp){window.removeEventListener("scroll",onScroll);tryShow("scroll")}
    }
    window.addEventListener("scroll",onScroll,{passive:true});
  }

  if(useExit){
    function onLeave(e){if(e.clientY<10){document.removeEventListener("mouseout",onLeave);tryShow("exit")}}
    document.addEventListener("mouseout",onLeave);
  }

  if(usePageView){
    var need=disp.pageViewCount||3;
    if(pvCount>=need)tryShow("pv");
  }
});
var s=document.createElement("style");s.textContent="@keyframes wfFade{from{opacity:0}to{opacity:1}}@keyframes wfSlide{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}";document.head.appendChild(s);
// Inject the most common web fonts so popups using Montserrat / Inter / Poppins
// / Roboto / Open Sans render correctly even on storefronts that don't already
// load them. Idempotent: skips if any of our font links is already in the page.
if(!document.getElementById("wf-fonts-link")){
  var fl=document.createElement("link");
  fl.id="wf-fonts-link";
  fl.rel="stylesheet";
  fl.href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700;800&family=Roboto:wght@400;500;700&family=Open+Sans:wght@400;500;600;700&display=swap";
  document.head.appendChild(fl);
}
})();`

    return new Response(script, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch {
    return new Response('/* Error */', { headers: { 'Content-Type': 'application/javascript' } })
  }
}
